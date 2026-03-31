package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/LingByte/CloudStepsGo/cmd/bootstrap"
	"github.com/LingByte/CloudStepsGo/internal/handlers"
	"github.com/LingByte/CloudStepsGo/internal/listeners"
	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/internal/task"
	"github.com/LingByte/CloudStepsGo/pkg/cache"
	"github.com/LingByte/CloudStepsGo/pkg/captcha"
	"github.com/LingByte/CloudStepsGo/pkg/config"
	"github.com/LingByte/CloudStepsGo/pkg/constants"
	"github.com/LingByte/CloudStepsGo/pkg/logger"
	"github.com/LingByte/CloudStepsGo/pkg/metrics"
	"github.com/LingByte/CloudStepsGo/pkg/middleware"
	"github.com/LingByte/CloudStepsGo/pkg/utils"
	"github.com/LingByte/CloudStepsGo/pkg/utils/backup"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type CloudStepsGoApp struct {
	db       *gorm.DB
	handlers *handlers.Handlers
}

func NewCloudStepsGoApp(db *gorm.DB) *CloudStepsGoApp {
	return &CloudStepsGoApp{
		db:       db,
		handlers: handlers.NewHandlers(db),
	}
}

func (app *CloudStepsGoApp) RegisterRoutes(r *gin.Engine) {
	// Register system routes (with /api prefix)
	app.handlers.Register(r)
}

func main() {

	// 1. Parse Command Line Parameters
	init := flag.Bool("init", false, "initialize database")
	seed := flag.Bool("seed", false, "seed database")
	mode := flag.String("mode", "", "running environment (development, test, production)")
	initSQL := flag.String("init-sql", "", "path to database init .sql script (optional)")
	flag.Parse()

	// 2. Set Environment Variables
	if *mode != "" {
		os.Setenv("APP_ENV", *mode)
	}

	// 3. Load Global Configuration
	if err := config.Load(); err != nil {
		panic("config load failed: " + err.Error())
	}

	// 4. Load Log Configuration
	err := logger.Init(&config.GlobalConfig.Log, config.GlobalConfig.Server.Mode)
	if err != nil {
		panic(err)
	}

	// 5. Print Banner
	if err := bootstrap.PrintBannerFromFile("banner.txt", config.GlobalConfig.Server.Name); err != nil {
		log.Fatalf("unload banner: %v", err)
	}

	// 7. Load Data Source
	db, err := bootstrap.SetupDatabase(os.Stdout, &bootstrap.Options{
		InitSQLPath: *initSQL, // Can be specified via --init-sql
		AutoMigrate: *init,    // Whether to migrate entities
		SeedNonProd: *seed,    // Non-production default configuration
	})
	if err != nil {
		logger.Error("database setup failed", zap.Error(err))
		return
	}

	// 8. Load Base Configs
	var addr = config.GlobalConfig.Server.Addr
	if addr == "" {
		addr = ":7072"
	}

	var DBDriver = config.GlobalConfig.Database.Driver
	if DBDriver == "" {
		DBDriver = "sqlite"
	}

	var DSN = config.GlobalConfig.Database.DSN
	if DSN == "" {
		DSN = "file::memory:?cache=shared"
	}
	flag.StringVar(&addr, "addr", addr, "HTTP Serve address")
	flag.StringVar(&DBDriver, "db-driver", DBDriver, "database driver")
	flag.StringVar(&DSN, "dsn", DSN, "database source name")

	logger.Info("checked config -- addr: ", zap.String("addr", addr))
	logger.Info("checked config -- db-driver: ", zap.String("db-driver", DBDriver), zap.String("dsn", DSN))
	logger.Info("checked config -- mode: ", zap.String("mode", config.GlobalConfig.Server.Mode))

	// 9. Load Global Cache (new cache system)
	if err := cache.InitGlobalCache(config.GlobalConfig.Cache); err != nil {
		logger.Error("failed to initialize cache", zap.Error(err))
		logger.Info("falling back to default local cache")
	}
	utils.InitGlobalCache(1024, 5*time.Minute)

	// Initialize global registration guard
	utils.InitGlobalRegistrationGuard(logger.Lg)

	// Initialize global distributed lock
	utils.InitGlobalDistributedLock()

	// Initialize global captcha manager
	captcha.InitGlobalCaptchaManager(nil) // Use memory storage, can be replaced with Redis storage

	// Initialize global login security manager
	utils.InitGlobalLoginSecurityManager(logger.Lg)

	// Initialize global intelligent risk control manager
	utils.InitGlobalIntelligentRiskControl(logger.Lg)

	//// 11. New App
	app := NewCloudStepsGoApp(db)

	// 11.5. Initialize SIP Server (if enabled)
	// Check if SIP server should be enabled via environment variable
	sipEnabled := utils.GetBoolEnv("SIP_ENABLED")
	if sipEnabled {
		sipPortInt64 := utils.GetIntEnv("SIP_PORT")
		if sipPortInt64 == 0 {
			sipPortInt64 = 5060 // Default SIP port
		}
		sipPort := int(sipPortInt64)

		rtpPortInt64 := utils.GetIntEnv("SIP_RTP_PORT")
		if rtpPortInt64 == 0 {
			rtpPortInt64 = 10000 // Default RTP port
		}
		rtpPort := int(rtpPortInt64)

		//sipServer := sip.NewSipServer(rtpPort)
		//sipServer.SetDBConfig(db)

		// Set SIP server to handlers (wrap to match interface)
		//app.handlers.SetSipServer(sipServer)

		// Start SIP server in background (pass empty targetURI to avoid auto-call)
		go func() {
			// Only start if explicitly enabled
			// sipServer.Start(sipPort, "") // Start SIP server
		}()

		logger.Info("SIP server initialized", zap.Int("sip_port", sipPort), zap.Int("rtp_port", rtpPort))
	} else {
		logger.Info("SIP server is disabled (set SIP_ENABLED=true to enable)")
	}

	// 12. Initialize Monitoring System
	maxSpansEnv := utils.GetIntEnv("METRICS_MAX_SPANS")
	maxQueriesEnv := utils.GetIntEnv("METRICS_MAX_QUERIES")
	maxStatsEnv := utils.GetIntEnv("METRICS_MAX_STATS")

	maxSpans := int(maxSpansEnv)
	if maxSpans == 0 {
		maxSpans = 500 // Default 500 (originally 10000), reducing 95% memory usage
	}

	maxQueries := int(maxQueriesEnv)
	if maxQueries == 0 {
		maxQueries = 500 // Default 500 (originally 10000), reducing 95% memory usage
	}

	maxStats := int(maxStatsEnv)
	if maxStats == 0 {
		maxStats = 100 // Default 100 (originally 1000), reducing 90% memory usage
	}

	// Tracing feature consumes the most memory, disabled by default
	enableTracing := utils.GetBoolEnv("METRICS_ENABLE_TRACING")
	enableSQLAnalysis := utils.GetBoolEnv("METRICS_ENABLE_SQL_ANALYSIS")
	if !enableSQLAnalysis && utils.GetEnv("METRICS_ENABLE_SQL_ANALYSIS") == "" {
		enableSQLAnalysis = true // Enable SQL analysis by default
	}
	enableSystemMonitor := utils.GetBoolEnv("METRICS_ENABLE_SYSTEM_MONITOR")
	if !enableSystemMonitor && utils.GetEnv("METRICS_ENABLE_SYSTEM_MONITOR") == "" {
		enableSystemMonitor = true // Enable system monitoring by default
	}

	monitor := metrics.NewMonitor(&metrics.MonitorConfig{
		EnableMetrics:       true,
		EnableTracing:       enableTracing,
		MaxSpans:            maxSpans,
		EnableSQLAnalysis:   enableSQLAnalysis,
		MaxQueries:          maxQueries,
		SlowThreshold:       100 * time.Millisecond,
		EnableSystemMonitor: enableSystemMonitor,
		MaxStats:            maxStats,
		MonitorInterval:     30 * time.Second,
	})

	// 13. Set Global Monitor
	metrics.SetGlobalMonitor(monitor)

	monitor.Start()
	defer monitor.Stop()

	// 13.5. Initialize Global Middleware Manager
	middleware.InitGlobalMiddlewareManager(config.GlobalConfig.Middleware)
	logger.Info("Global middleware manager initialized with config",
		zap.Bool("rateLimit", config.GlobalConfig.Middleware.EnableRateLimit),
		zap.Bool("timeout", config.GlobalConfig.Middleware.EnableTimeout),
		zap.Bool("circuitBreaker", config.GlobalConfig.Middleware.EnableCircuitBreaker),
		zap.Bool("operationLog", config.GlobalConfig.Middleware.EnableOperationLog))

	// 15. Start Timed task
	// Start Email Cleaner Task
	task.StartEmailCleaner(db)
	// Start Backup Data
	if config.GlobalConfig.Features.BackupEnabled {
		backup.StartBackupScheduler()
	}

	// 15. Initialize Gin Routing
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()        // Use gin.New() instead of gin.Default() to avoid automatic redirects
	r.Use(gin.Recovery()) // Manually add Recovery middleware
	r.LoadHTMLGlob("templates/**/**")

	// Disable automatic redirects to avoid CORS issues caused by 307 redirects
	r.RedirectTrailingSlash = false
	r.RedirectFixedPath = false

	// Set maximum memory limit for multipart forms (32MB)
	r.MaxMultipartMemory = 32 << 20 // 32 MB

	// 16. use middleware
	// Monitoring Middleware
	r.Use(metrics.MonitorMiddleware(monitor))

	// Cookie Register
	secret := utils.GetEnv(constants.ENV_SESSION_SECRET)
	if secret != "" {
		expireDays := utils.GetIntEnv(constants.ENV_SESSION_EXPIRE_DAYS)
		if expireDays <= 0 {
			expireDays = 7
		}
		r.Use(middleware.WithCookieSession(secret, int(expireDays)*24*3600))
	} else {
		r.Use(middleware.WithMemSession(utils.RandText(32)))
	}

	// Cors Handle Middleware
	r.Use(middleware.CorsMiddleware())

	// Logger Handle Middleware
	r.Use(middleware.LoggerMiddleware(zap.L()))

	// Static service for uploaded files
	uploadDir := utils.GetEnv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	// 注册 /uploads（主路径）并保留 /media 兼容历史
	r.Static("/uploads", uploadDir)
	r.Static("/media", uploadDir)
	apiPrefix := config.GlobalConfig.Server.APIPrefix
	if apiPrefix == "" {
		apiPrefix = "/api"
	}
	// 18. Register Routes
	app.RegisterRoutes(r)

	// 18.6. Register Metrics Monitor Routes
	// Get API prefix from config (default: /api)
	apiPrefix = config.GlobalConfig.Server.APIPrefix
	if apiPrefix == "" {
		apiPrefix = "/api"
	}
	// Get monitor prefix from config (default: /metrics)
	monitorPrefix := config.GlobalConfig.Server.MonitorPrefix
	if monitorPrefix == "" {
		monitorPrefix = "/metrics"
	}
	// Combine API prefix with monitor prefix: /api/metrics
	fullMonitorPrefix := apiPrefix + monitorPrefix
	monitorGroup := r.Group(fullMonitorPrefix)
	monitorAPI := metrics.NewMonitorAPI(monitor)
	monitorAPI.RegisterRoutes(monitorGroup)
	logger.Info("Metrics monitor routes registered", zap.String("prefix", fullMonitorPrefix))

	// 19. Initialize System Listener
	listeners.InitSystemListeners()

	// 20. Start Search Indexer (if enabled)
	searchEnabled := utils.GetBoolValue(db, constants.KEY_SEARCH_ENABLED)
	if !searchEnabled && config.GlobalConfig != nil {
		searchEnabled = config.GlobalConfig.Features.SearchEnabled
	}
	// 21. Emit system initialization signal
	utils.Sig().Emit(models.SigInitSystemConfig, nil)

	// 22. Start HTTP/HTTPS Server
	httpServer := &http.Server{
		Addr:           addr,
		Handler:        r,
		ReadTimeout:    300 * time.Second,
		WriteTimeout:   30 * time.Second,
		IdleTimeout:    120 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1MB
	}
	if config.GlobalConfig.Server.SSLEnabled && listeners.IsSSLEnabled() {
		tlsConfig, err := listeners.GetTLSConfig()
		if err != nil {
			logger.Error("failed to get TLS config", zap.Error(err))
			return
		}
		if tlsConfig != nil {
			httpServer.TLSConfig = tlsConfig
			logger.Info("Starting HTTPS server", zap.String("addr", addr))
			if err := httpServer.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
				logger.Error("HTTPS server run failed", zap.Error(err))
			}
		} else {
			logger.Warn("SSL enabled but TLS config is nil, falling back to HTTP")
			if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				logger.Error("HTTP server run failed", zap.Error(err))
			}
		}
	} else {
		logger.Info("Starting HTTP server", zap.String("addr", addr))
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("HTTP server run failed", zap.Error(err))
		}
	}
}
