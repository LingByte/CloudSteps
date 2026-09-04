// Package database 负责数据库连接、迁移模型注册与后置修复。
package app

import (
	"io"
	"strings"

	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/CloudStepsGo/internal/models"
	middleware "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	notify2 "github.com/LingByte/CloudStepsGo/pkg/notify"
	"github.com/LingByte/ling-base/common"
	lbconfig "github.com/LingByte/ling-base/common/config"
	"github.com/LingByte/ling-base/common/logger"
	"go.uber.org/zap"

	"gorm.io/gorm"
)

// Connect 根据全局配置创建 *gorm.DB。
func Connect(logWriter io.Writer) (*gorm.DB, error) {
	return common.InitDatabase(logWriter, configs.Global.Database.Driver, configs.Global.Database.DSN)
}

// Models 返回需要 AutoMigrate 的全部实体，顺序与原 cmd/bootstrap.RunMigrations 一致。
func Models() []any {
	return []any{
		&lbconfig.ConfigItem{},
		&models.AccountLock{},
		&models.UserDevice{},
		&models.LoginHistory{},
		&middleware.OperationLog{},
		&models.User{},
		&models.UserWordBook{},
		&models.UserWordState{},
		&models.UserWord{},
		&models.ReviewQueue{},
		&models.StudySession{},
		&models.SessionWord{},
		&models.WordBook{},
		&models.Word{},
		&models.VocabTestQuestion{},
		&models.VocabTestRecord{},
		&models.ReadingPassage{},
		&models.ReadingQuestion{},
		&models.ReadingRecord{},
		&models.UserReadingPassage{},
		&models.UserReadingQuestion{},
		&models.UserReadingRecord{},
		&models.ClozePassage{},
		&models.ClozeBlank{},
		&models.ClozeRecord{},
		&models.UserClozePassage{},
		&models.UserClozeBlank{},
		&models.UserClozeRecord{},
		&models.GrammarLesson{},
		&models.GrammarQuestion{},
		&models.GrammarRecord{},
		&notify2.InternalNotification{},
		&models.Announcement{},
		&models.AnnouncementRead{},
		&models.WechatMpArticle{},
		&notify2.NotificationChannel{},
		&notify2.MailTemplate{},
		&notify2.MailLog{},
		&models.StudentTeacherCoachingQuota{},
		&models.TeacherTeachingPool{},
		&models.TeacherCheckIn{},
		&models.UserInviteCode{},
		&models.UserInviteRecord{},
		&models.InviteRewardSetting{},
		&models.InviteRewardGrant{},
		&models.TeacherCoachingUsagePeriod{},
		&models.CoachingAppointment{},
		&models.CoachingSessionRecord{},
		&models.CoachingAuditLog{},
		&models.ScenarioDialogueScenario{},
		&models.ScenarioDialogueSession{},
		&models.ScenarioDialogueTurn{},
		&models.SysMetric{},
		&models.FeedbackTicket{},
		&models.FeedbackReply{},
	}
}

// PostMigrate 在 AutoMigrate 之后执行的兜底修复：
//   - 确保 users.email 列存在
//   - 确保 study_sessions 课堂报告相关列存在（不依赖 -init）
//   - 删除 users.username 唯一索引（允许软删后同用户名重新注册）
//   - 修正 scenario_dialogue 表字符集为 utf8mb4
func PostMigrate(db *gorm.DB) error {
	if err := ensureUsersEmailColumn(db); err != nil {
		return err
	}
	if err := ensureStudySessionReportColumns(db); err != nil {
		return err
	}
	if err := dropUsersUsernameUniqueIndex(db); err != nil {
		return err
	}
	return fixScenarioDialogueCharset(db)
}

// ensureUsersEmailColumn 确保 users 表有 email 列（GORM AutoMigrate 对已有表加带索引的列时可能不生效，这里做兜底）。
func ensureUsersEmailColumn(db *gorm.DB) error {
	if configs.Global.Database.Driver != "mysql" && configs.Global.Database.Driver != "sqlite" {
		return nil
	}
	// 检查 email 列是否已存在
	if configs.Global.Database.Driver == "mysql" {
		var colCount int64
		row := db.Raw("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'email'").Row()
		if err := row.Scan(&colCount); err != nil {
			logger.Warn("check users.email column existence failed, will try ALTER TABLE", zap.Error(err))
		}
		if colCount > 0 {
			return nil
		}
		// 列不存在，显式添加
		if err := db.Exec("ALTER TABLE users ADD COLUMN email VARCHAR(128) DEFAULT ''").Error; err != nil {
			if !strings.Contains(err.Error(), "Duplicate column") {
				return err
			}
		}
		if err := db.Exec("CREATE INDEX idx_users_email ON users(email)").Error; err != nil {
			if !strings.Contains(err.Error(), "Duplicate") && !strings.Contains(err.Error(), "already exists") {
				logger.Warn("create idx_users_email failed (non-fatal)", zap.Error(err))
			}
		}
		logger.Info("users.email column ensured via explicit ALTER TABLE")
		return nil
	}
	// SQLite: 检查列是否存在
	var cols []struct {
		Name string `gorm:"column:name"`
	}
	db.Raw("PRAGMA table_info(users)").Scan(&cols)
	for _, c := range cols {
		if c.Name == "email" {
			return nil
		}
	}
	if err := db.Exec("ALTER TABLE users ADD COLUMN email TEXT").Error; err != nil {
		if !strings.Contains(err.Error(), "duplicate column") {
			return err
		}
	}
	logger.Info("users.email column ensured via explicit ALTER TABLE")
	return nil
}

// ensureStudySessionReportColumns adds classroom-report columns without requiring -init AutoMigrate.
func ensureStudySessionReportColumns(db *gorm.DB) error {
	driver := configs.Global.Database.Driver
	if driver != "mysql" && driver != "sqlite" {
		return nil
	}

	table := "study_sessions"
	type colDef struct {
		Name   string
		MySQL  string
		SQLite string
	}
	cols := []colDef{
		{Name: "screened_known_count", MySQL: "INT NOT NULL DEFAULT 0 COMMENT '本课筛词熟词数'", SQLite: "INTEGER NOT NULL DEFAULT 0"},
		{Name: "screened_unknown_count", MySQL: "INT NOT NULL DEFAULT 0 COMMENT '本课筛词生词/新词数'", SQLite: "INTEGER NOT NULL DEFAULT 0"},
		{Name: "report_summary", MySQL: "TEXT NULL COMMENT '课堂报告 AI 摘要缓存'", SQLite: "TEXT"},
	}

	existing := map[string]bool{}
	if driver == "mysql" {
		type colRow struct {
			ColumnName string `gorm:"column:column_name"`
		}
		var rows []colRow
		if err := db.Raw(`
			SELECT column_name
			FROM information_schema.columns
			WHERE table_schema = DATABASE() AND table_name = ?
		`, table).Scan(&rows).Error; err != nil {
			logger.Warn("check study_sessions columns failed, will try ALTER TABLE", zap.Error(err))
		} else {
			for _, r := range rows {
				existing[strings.ToLower(r.ColumnName)] = true
			}
		}
		for _, c := range cols {
			if existing[c.Name] {
				continue
			}
			stmt := "ALTER TABLE `" + table + "` ADD COLUMN `" + c.Name + "` " + c.MySQL
			if err := db.Exec(stmt).Error; err != nil {
				if !strings.Contains(err.Error(), "Duplicate column") {
					return err
				}
			} else {
				logger.Info("study_sessions column ensured", zap.String("column", c.Name))
			}
		}
		return nil
	}

	var pragmaCols []struct {
		Name string `gorm:"column:name"`
	}
	if err := db.Raw("PRAGMA table_info(" + table + ")").Scan(&pragmaCols).Error; err != nil {
		return err
	}
	for _, c := range pragmaCols {
		existing[strings.ToLower(c.Name)] = true
	}
	for _, c := range cols {
		if existing[c.Name] {
			continue
		}
		stmt := "ALTER TABLE " + table + " ADD COLUMN " + c.Name + " " + c.SQLite
		if err := db.Exec(stmt).Error; err != nil {
			if !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
				return err
			}
		} else {
			logger.Info("study_sessions column ensured", zap.String("column", c.Name))
		}
	}
	return nil
}

// dropUsersUsernameUniqueIndex allows re-registering with the same username after soft-delete.
func dropUsersUsernameUniqueIndex(db *gorm.DB) error {
	driver := configs.Global.Database.Driver
	if driver == "mysql" {
		type indexRow struct {
			IndexName  string
			NonUnique  int
			ColumnName string
		}
		var rows []indexRow
		if err := db.Raw(`
			SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
			FROM information_schema.statistics
			WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'username'
		`).Scan(&rows).Error; err != nil {
			return err
		}
		dropped := map[string]bool{}
		for _, row := range rows {
			if row.NonUnique != 0 || row.IndexName == "PRIMARY" || dropped[row.IndexName] {
				continue
			}
			stmt := "ALTER TABLE users DROP INDEX `" + row.IndexName + "`"
			if err := db.Exec(stmt).Error; err != nil {
				if !strings.Contains(err.Error(), "check that column/key exists") {
					return err
				}
			}
			dropped[row.IndexName] = true
			logger.Info("dropped users.username unique index", zap.String("index", row.IndexName))
		}
		return nil
	}
	if driver == "sqlite" {
		// SQLite cannot drop a single index easily on legacy schemas; in-memory tests use fresh tables.
		return nil
	}
	return nil
}

// fixScenarioDialogueCharset ensures emoji/special chars work on MySQL (CynosDB defaults to utf8mb3).
func fixScenarioDialogueCharset(db *gorm.DB) error {
	if configs.Global.Database.Driver != "mysql" {
		return nil
	}
	tables := []string{
		"scenario_dialogue_scenarios",
		"scenario_dialogue_sessions",
		"scenario_dialogue_turns",
	}
	for _, table := range tables {
		stmt := "ALTER TABLE `" + table + "` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
		if err := db.Exec(stmt).Error; err != nil {
			return err
		}
		if table == "scenario_dialogue_sessions" {
			if err := db.Exec("ALTER TABLE `" + table + "` MODIFY COLUMN `review_summary` MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci").Error; err != nil {
				if !strings.Contains(err.Error(), "Unknown column") {
					return err
				}
			}
			if err := db.Exec("ALTER TABLE `" + table + "` MODIFY COLUMN `review_detail` MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci").Error; err != nil {
				if !strings.Contains(err.Error(), "Unknown column") {
					return err
				}
			}
		}
	}
	return nil
}
