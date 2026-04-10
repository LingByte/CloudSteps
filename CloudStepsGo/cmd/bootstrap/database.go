package bootstrap

import (
	"bufio"
	"errors"
	"io"
	"os"
	"strings"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/config"
	"github.com/LingByte/CloudStepsGo/pkg/logger"
	"github.com/LingByte/CloudStepsGo/pkg/middleware"
	"github.com/LingByte/CloudStepsGo/pkg/notification"
	"github.com/LingByte/CloudStepsGo/pkg/utils"
	"go.uber.org/zap"

	"gorm.io/gorm"
)

// Options controls database initialization behavior
type Options struct {
	// InitSQLPath points to a .sql script file (optional); skip if empty
	InitSQLPath string
	// AutoMigrate whether to execute entity migration (default true)
	AutoMigrate bool
	// SeedNonProd whether to write default configuration in non-production environments (default true)
	SeedNonProd bool
}

// SetupDatabase unified entry: connect database -> run initialization SQL -> migrate entities -> (non-production) write default configuration
func SetupDatabase(logWriter io.Writer, opts *Options) (*gorm.DB, error) {
	if opts == nil {
		opts = &Options{AutoMigrate: true, SeedNonProd: true}
	}

	// 1) Connect to database
	db, err := initDBConn(logWriter)
	if err != nil {
		logger.Error("init database failed", zap.Error(err))
		return nil, err
	}

	// 2) Optional: execute initialization SQL
	if opts.InitSQLPath != "" {
		if err := RunInitSQL(db, opts.InitSQLPath); err != nil {
			logger.Error("run init sql failed", zap.String("path", opts.InitSQLPath), zap.Error(err))
			return nil, err
		}
	}

	// 3) Migrate entities
	if opts.AutoMigrate {
		if err := RunMigrations(db); err != nil {
			logger.Error("migration failed", zap.Error(err))
			return nil, err
		}
		logger.Info("migration success",
			zap.String("database", config.GlobalConfig.Database.Driver),
			zap.String("dsn", config.GlobalConfig.Database.DSN),
		)
	}

	// 4) Non-production: default configuration
	if opts.SeedNonProd {
		service := SeedService{
			db: db,
		}
		if err := service.SeedAll(); err != nil {
			logger.Error("seed failed", zap.Error(err))
			return nil, err
		}
	}

	logger.Info("system bootstrap - database is initialization complete")
	return db, nil
}

// initDBConn creates *gorm.DB based on global configuration
func initDBConn(logWriter io.Writer) (*gorm.DB, error) {
	dbDriver := config.GlobalConfig.Database.Driver
	dsn := config.GlobalConfig.Database.DSN
	return utils.InitDatabase(logWriter, dbDriver, dsn)
}

// RunInitSQL executes SQL statements from a local .sql file segment by segment (split by semicolon ;), idempotent scripts should use IF NOT EXISTS in SQL for protection
func RunInitSQL(db *gorm.DB, sqlFilePath string) error {
	f, err := os.Open(sqlFilePath)
	if err != nil {
		return err
	}
	defer f.Close()
	var (
		sb      strings.Builder
		scanner = bufio.NewScanner(f)
	)
	// Relax token limit (long lines)
	buf := make([]byte, 0, 1024*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		trim := strings.TrimSpace(line)
		// Ignore comment lines (starting with --) and empty lines
		if trim == "" || strings.HasPrefix(trim, "--") || strings.HasPrefix(trim, "#") {
			continue
		}
		sb.WriteString(line)
		sb.WriteString("\n")
		// Use ; as statement terminator (simple splitting, suitable for most scenarios)
		if strings.HasSuffix(trim, ";") {
			stmt := strings.TrimSpace(sb.String())
			sb.Reset()
			if stmt != "" {
				if err := db.Exec(stmt).Error; err != nil {
					return err
				}
			}
		}
	}
	// Handle remaining content at end of file without semicolon
	rest := strings.TrimSpace(sb.String())
	if rest != "" {
		if err := db.Exec(rest).Error; err != nil {
			return err
		}
	}
	return scanner.Err()
}

// RunMigrations executes entity migration
func RunMigrations(db *gorm.DB) error {
	if db == nil {
		return errors.New("db is nil")
	}
	return utils.MakeMigrates(db, []any{
		&utils.Config{},
		&models.AccountLock{},
		&models.UserDevice{},
		&models.LoginHistory{},
		&middleware.OperationLog{},
		&models.User{},
		&models.UserWordBook{},
		&models.UserWordState{},
		&models.ReviewQueue{},
		&models.StudySession{},
		&models.SessionWord{},
		&models.WordBook{},
		&models.Word{},
		&models.VocabTestQuestion{},
		&models.VocabTestRecord{},
		&notification.InternalNotification{},
		&models.Class{},
		&models.ClassCourse{},
		&models.ClassStudent{},
		&models.Course{},
		&models.Schedule{},
		&models.ScheduleStudent{},
		&models.ClassSession{},
		&models.StudentClassRecord{},
	})
}
