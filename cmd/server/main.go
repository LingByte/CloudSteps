package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/app"
	"github.com/LingByte/CloudStepsGo/internal/configs"

	"github.com/LingByte/CloudStepsGo/internal/handlers"

	"github.com/LingByte/ling-base/bootstrap"
	"github.com/LingByte/ling-base/common"
	lbconstants "github.com/LingByte/ling-base/common/constants"
	"github.com/LingByte/ling-base/common/logger"
	"github.com/LingByte/ling-base/common/response"
	respgin "github.com/LingByte/ling-base/common/response/gin"
	"github.com/LingByte/ling-base/i18n"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// Version / BuildTime / GitCommit 可由 ldflags 注入。
var (
	Version   = "dev"
	BuildTime = "unknown"
	GitCommit = "none"
)

func main() {
	initDB := flag.Bool("init", false, "initialize database (auto-migrate)")
	seed := flag.Bool("seed", false, "seed database")
	mode := flag.String("mode", "", "running environment (development, test, production / dev, test, prod)")
	initSQL := flag.String("init-sql", "", "path to database init .sql script (optional)")
	configPath := flag.String("config", "configs/config.yaml", "path to YAML config")
	flag.Parse()

	if *mode != "" {
		_ = os.Setenv("APP_ENV", *mode)
	}

	cfg, err := configs.Load(*configPath)
	if err != nil {
		fatalf("加载配置失败: %v", err)
	}

	info := handlers.AppInfo{
		Name:      cfg.App.Name,
		Version:   Version,
		BuildTime: BuildTime,
		GitCommit: GitCommit,
	}
	if info.Name == "" {
		info.Name = "CloudSteps"
	}
	handlers.EnrichAppInfo(&info)

	logger.InitTimezone(lbconstants.TimezoneShanghai)
	if err := logger.Init(cfg.LogConfig(), cfg.Mode()); err != nil {
		fatalf("初始化日志失败: %v", err)
	}

	var i18nManager *i18n.Manager
	if cfg.I18n.Enabled {
		manager, err := setupI18n(cfg, *configPath)
		if err != nil {
			fatal("init i18n failed", err)
		}
		i18nManager = manager
		defaultLocale := i18nManager.GetDefaultLocale()
		fallbackLocale := i18n.Locale(cfg.I18n.FallbackLocale)
		if fallbackLocale == "" {
			fallbackLocale = defaultLocale
		}
		// FailI18n 的 Resolver 拿不到 gin.Context，只能按默认语言翻；
		// 请求语言中间件仍会写入 context，供显式 i18ngin.T 使用。
		respgin.Resolver = response.ResolverFunc(func(key string, args ...any) string {
			msg := i18nManager.T(defaultLocale, key, args...)
			if msg == key && fallbackLocale != defaultLocale {
				msg = i18nManager.T(fallbackLocale, key, args...)
			}
			return msg
		})
	}

	logger.Info("checked config",
		zap.String("addr", cfg.ListenAddr()),
		zap.String("db-driver", cfg.Database.Driver),
		zap.String("env", cfg.App.Environment),
	)

	// 连接数据库（在创建 Application 之前，因为 WithAutoMigrate 需要已连接的 *gorm.DB）
	db, err := app.Connect(os.Stdout)
	if err != nil {
		fatal("init database failed", err)
	}

	// 可选：执行初始化 SQL
	if *initSQL != "" {
		if err := runInitSQL(db, *initSQL); err != nil {
			fatal("run init sql failed: "+*initSQL, err)
		}
	}

	lbApp := bootstrap.New(info.Name,
		bootstrap.WithProfile(cfg.Mode()),
		bootstrap.WithBannerFile("banner.txt"),
		bootstrap.WithShutdownTimeout(30*time.Second),
	)

	if *initDB {
		lbApp.AddInitHook("auto-migrate", func(ctx context.Context) error {
			models := app.Models()
			logger.Info("running auto-migrate", zap.Int("models", len(models)))
			if err := db.AutoMigrate(models...); err != nil {
				return fmt.Errorf("auto-migrate failed: %w", err)
			}
			if err := app.PostMigrate(db); err != nil {
				return fmt.Errorf("post-migrate failed: %w", err)
			}
			logger.Info("migration success",
				zap.String("database", cfg.Database.Driver),
				zap.String("dsn", cfg.Database.DSN),
			)
			return nil
		})
	} else {
		lbApp.AddInitHook("post-migrate", func(ctx context.Context) error {
			return app.PostMigrate(db)
		})
	}

	// 通知模板种子（始终执行，确保基线行存在）
	lbApp.AddInitHook("seed-notification-defaults", func(ctx context.Context) error {
		seedSvc := &app.SeedService{DB: db}
		return seedSvc.SeedNotificationDefaults()
	})

	if *seed {
		lbApp.AddInitHook("seed-all", func(ctx context.Context) error {
			seedSvc := &app.SeedService{DB: db}
			return seedSvc.SeedAll()
		})
	}

	if err := lbApp.Register("http-server", &app.HTTPServer{
		Cfg:  cfg,
		DB:   db,
		Info: info,
		I18n: i18nManager,
	}); err != nil {
		fatal("注册 HTTP 组件失败", err)
	}

	if err := lbApp.Run(); err != nil {
		fatal("应用启动失败", err)
	}
}

func fatal(msg string, err error) {
	fatalf("%s: %v", msg, err)
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	if logger.Lg != nil {
		logger.Error(fmt.Sprintf(format, args...))
		_ = logger.Lg.Sync()
	}
	os.Exit(1)
}

// runInitSQL 执行初始化 SQL 脚本（按分号分段）。
func runInitSQL(db *gorm.DB, path string) error {
	return common.RunInitSQL(db, path)
}

func setupI18n(cfg *configs.Config, configPath string) (*i18n.Manager, error) {
	supportedLocales := make([]i18n.Locale, len(cfg.I18n.SupportedLocales))
	for i, loc := range cfg.I18n.SupportedLocales {
		supportedLocales[i] = i18n.Locale(loc)
	}
	translationsPath, err := resolveTranslationsPath(configPath, cfg.I18n.TranslationsPath)
	if err != nil {
		return nil, err
	}
	manager := i18n.NewManager(&i18n.Config{
		DefaultLocale:    i18n.Locale(cfg.I18n.DefaultLocale),
		SupportedLocales: supportedLocales,
		FallbackLocale:   i18n.Locale(cfg.I18n.FallbackLocale),
	})
	if err := manager.LoadTranslations(translationsPath); err != nil {
		return nil, fmt.Errorf("load translations from %s: %w", translationsPath, err)
	}
	defaultLocale := manager.GetDefaultLocale()
	sampleKey := "coaching.quota_insufficient"
	if got := manager.T(defaultLocale, sampleKey); got == sampleKey {
		return nil, fmt.Errorf("i18n key %q missing for locale %s (path=%s)", sampleKey, defaultLocale, translationsPath)
	}
	logger.Info("i18n loaded",
		zap.String("path", translationsPath),
		zap.String("defaultLocale", string(defaultLocale)),
		zap.Int("zhCN", len(manager.GetTranslations(i18n.LocaleZhCN))),
		zap.Int("en", len(manager.GetTranslations(i18n.LocaleEn))),
	)
	return manager, nil
}

// resolveTranslationsPath 把相对翻译目录解析成绝对路径：
// 优先当前工作目录，其次相对配置文件所在目录 / 项目根目录。
func resolveTranslationsPath(configPath, translationsPath string) (string, error) {
	if translationsPath == "" {
		return "", fmt.Errorf("i18n.translationsPath is empty")
	}
	candidates := make([]string, 0, 4)
	if filepath.IsAbs(translationsPath) {
		candidates = append(candidates, translationsPath)
	} else {
		if abs, err := filepath.Abs(translationsPath); err == nil {
			candidates = append(candidates, abs)
		}
		configDir := filepath.Dir(configPath)
		if absConfigDir, err := filepath.Abs(configDir); err == nil {
			candidates = append(candidates,
				filepath.Join(absConfigDir, translationsPath),
				filepath.Clean(filepath.Join(absConfigDir, "..", translationsPath)),
			)
		}
	}
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if _, ok := seen[candidate]; ok {
			continue
		}
		seen[candidate] = struct{}{}
		info, err := os.Stat(candidate)
		if err == nil && info.IsDir() {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("translations path not found: %s (tried %v)", translationsPath, candidates)
}
