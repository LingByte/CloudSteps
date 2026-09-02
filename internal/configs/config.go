// Package configs 应用配置（YAML 为唯一来源；APP_* / 兼容旧环境变量可覆盖）。
package configs

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/ling-base/common/logger"
	"gopkg.in/yaml.v3"
)

// Global 进程级配置（Load 后非 nil）。
var Global *Config

// Config 完整应用配置。
type Config struct {
	MachineID      int64                `yaml:"machineId"`
	App            AppConfig            `yaml:"app"`
	Server         ServerConfig         `yaml:"server"`
	Database       DatabaseConfig       `yaml:"database"`
	Redis          RedisConfig          `yaml:"redis"`
	Logging        LoggingConfig        `yaml:"logging"`
	Auth           AuthConfig           `yaml:"auth"`
	Services       ServicesConfig       `yaml:"services"`
	Features       FeaturesConfig       `yaml:"features"`
	Middleware     MiddlewareConfig     `yaml:"middleware"`
	RateLimit      RateLimitConfig      `yaml:"rateLimit"`
	CircuitBreaker CircuitBreakerConfig `yaml:"circuitBreaker"`
	Docs           DocsConfig           `yaml:"docs"`
	JWT            JWTConfig            `yaml:"jwt"`
	I18n           I18nConfig           `yaml:"i18n"`
	Storage        StorageConfig        `yaml:"storage"`
	TTS            TTSConfig            `yaml:"tts"`
	Realtime       RealtimeConfig       `yaml:"realtime"`
	Cache          CacheConfig          `yaml:"cache"`
	Wechat         WechatConfig         `yaml:"wechat"`
}

type AppConfig struct {
	Name        string `yaml:"name"`
	Environment string `yaml:"environment"` // dev | test | prod | development | production
}

type ServerConfig struct {
	Name         string        `yaml:"name"`
	Desc         string        `yaml:"desc"`
	URL          string        `yaml:"url"`
	Logo         string        `yaml:"logo"`
	TermsURL     string        `yaml:"termsUrl"`
	Port         int           `yaml:"port"`
	Addr         string        `yaml:"addr"`
	ReadTimeout  time.Duration `yaml:"readTimeout"`
	WriteTimeout time.Duration `yaml:"writeTimeout"`
	IdleTimeout  time.Duration `yaml:"idleTimeout"`
	DocsPrefix   string        `yaml:"docsPrefix"`
	APIPrefix    string        `yaml:"apiPrefix"`
	AdminPrefix  string        `yaml:"adminPrefix"`
	AuthPrefix   string        `yaml:"authPrefix"`
	SSLEnabled   bool          `yaml:"sslEnabled"`
	SSLCertFile  string        `yaml:"sslCertFile"`
	SSLKeyFile   string        `yaml:"sslKeyFile"`
}

type DatabaseConfig struct {
	Driver          string        `yaml:"driver"`
	DSN             string        `yaml:"dsn"`
	MaxOpenConns    int           `yaml:"maxOpenConns"`
	MaxIdleConns    int           `yaml:"maxIdleConns"`
	ConnMaxLifetime time.Duration `yaml:"connMaxLifetime"`
}

type RedisConfig struct {
	Addr     string `yaml:"addr"`
	Password string `yaml:"password"`
	DB       int    `yaml:"db"`
}

type LoggingConfig struct {
	Level           string `yaml:"level"`
	Filename        string `yaml:"filename"`
	MaxSize         int    `yaml:"maxSize"`
	MaxAge          int    `yaml:"maxAge"`
	MaxBackups      int    `yaml:"maxBackups"`
	Daily           bool   `yaml:"daily"`
	SensitiveFields string `yaml:"sensitiveFields"`
}

type AuthConfig struct {
	Header            string `yaml:"header"`
	SessionSecret     string `yaml:"sessionSecret"`
	SessionExpireDays int    `yaml:"sessionExpireDays"`
	TokenExpired      string `yaml:"tokenExpired"`
	APISecretKey      string `yaml:"apiSecretKey"`
}

type ServicesConfig struct {
	LLM      LLMConfig      `yaml:"llm"`
	ImageGen ImageGenConfig `yaml:"imageGen"`
	Mail     MailConfig     `yaml:"mail"`
}

type MailConfig struct {
	Provider string `yaml:"provider"`
	Host     string `yaml:"host"`
	Port     int64  `yaml:"port"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
	APIUser  string `yaml:"apiUser"`
	APIKey   string `yaml:"apiKey"`
	From     string `yaml:"from"`
}

type LLMConfig struct {
	APIKey  string `yaml:"apiKey"`
	BaseURL string `yaml:"baseUrl"`
	Model   string `yaml:"model"`
}

type ImageGenConfig struct {
	APIKey  string `yaml:"apiKey"`
	BaseURL string `yaml:"baseUrl"`
	Model   string `yaml:"model"`
}

type FeaturesConfig struct {
	LanguageEnabled bool   `yaml:"languageEnabled"`
	BackupEnabled   bool   `yaml:"backupEnabled"`
	BackupPath      string `yaml:"backupPath"`
	BackupSchedule  string `yaml:"backupSchedule"`
}

type MiddlewareConfig struct {
	RateLimit            RateLimiterDetailConfig    `yaml:"rateLimit"`
	Timeout              TimeoutDetailConfig        `yaml:"timeout"`
	CircuitBreaker       CircuitBreakerDetailConfig `yaml:"circuitBreaker"`
	EnableRateLimit      bool                       `yaml:"enableRateLimit"`
	EnableTimeout        bool                       `yaml:"enableTimeout"`
	EnableCircuitBreaker bool                       `yaml:"enableCircuitBreaker"`
	EnableOperationLog   bool                       `yaml:"enableOperationLog"`
}

type RateLimiterDetailConfig struct {
	GlobalRPS    int           `yaml:"globalRPS"`
	GlobalBurst  int           `yaml:"globalBurst"`
	GlobalWindow time.Duration `yaml:"globalWindow"`
	UserRPS      int           `yaml:"userRPS"`
	UserBurst    int           `yaml:"userBurst"`
	UserWindow   time.Duration `yaml:"userWindow"`
	IPRPS        int           `yaml:"ipRPS"`
	IPBurst      int           `yaml:"ipBurst"`
	IPWindow     time.Duration `yaml:"ipWindow"`
}

type TimeoutDetailConfig struct {
	DefaultTimeout   time.Duration  `yaml:"defaultTimeout"`
	FallbackResponse map[string]any `yaml:"fallbackResponse"`
}

type CircuitBreakerDetailConfig struct {
	FailureThreshold      int           `yaml:"failureThreshold"`
	SuccessThreshold      int           `yaml:"successThreshold"`
	Timeout               time.Duration `yaml:"timeout"`
	OpenTimeout           time.Duration `yaml:"openTimeout"`
	MaxConcurrentRequests int           `yaml:"maxConcurrentRequests"`
}

type RateLimitConfig struct {
	Enabled bool `yaml:"enabled"`
	RPS     int  `yaml:"rps"`
	Burst   int  `yaml:"burst"`
}

type CircuitBreakerConfig struct {
	Enabled          bool   `yaml:"enabled"`
	FailureThreshold int    `yaml:"failureThreshold"`
	MinRequests      int    `yaml:"minRequests"`
	RecoveryTimeout  string `yaml:"recoveryTimeout"`
}

type DocsConfig struct {
	Enabled  bool   `yaml:"enabled"`
	Path     string `yaml:"path"`
	DarkMode bool   `yaml:"darkMode"`
}

type JWTConfig struct {
	Enabled    bool   `yaml:"enabled"`
	Secret     string `yaml:"secret"`
	Issuer     string `yaml:"issuer"`
	AccessTTL  string `yaml:"accessTTL"`
	RefreshTTL string `yaml:"refreshTTL"`
}

type I18nConfig struct {
	Enabled          bool     `yaml:"enabled"`
	DefaultLocale    string   `yaml:"defaultLocale"`
	SupportedLocales []string `yaml:"supportedLocales"`
	FallbackLocale   string   `yaml:"fallbackLocale"`
	TranslationsPath string   `yaml:"translationsPath"`
}

type StorageConfig struct {
	Kind           string `yaml:"kind"`
	QiniuAccessKey string `yaml:"qiniuAccessKey"`
	QiniuSecretKey string `yaml:"qiniuSecretKey"`
	QiniuBucket    string `yaml:"qiniuBucket"`
	QiniuDomain    string `yaml:"qiniuDomain"`
	QiniuPrivate   bool   `yaml:"qiniuPrivate"`
	QiniuRegion    string `yaml:"qiniuRegion"`
}

type TTSConfig struct {
	Provider                string `yaml:"provider"`
	QCloudAccountsJSON      string `yaml:"qcloudAccountsJSON"`
	WordBookBatchPerAccount int    `yaml:"wordBookBatchPerAccount"`
	MaxRetries              int    `yaml:"maxRetries"`
	RetryBaseMS             int    `yaml:"retryBaseMs"`
	DashScopeAPIKey         string `yaml:"dashScopeApiKey"`
}

type RealtimeConfig struct {
	Provider string `yaml:"provider"`
	APIKey   string `yaml:"apiKey"`
	Model    string `yaml:"model"`
}

type CacheConfig struct {
	Type            string `yaml:"type"`
	LocalMaxSize    int    `yaml:"localMaxSize"`
	LocalDefaultTTL string `yaml:"localDefaultTTL"`
}

// WechatConfig 微信公众号登录（关注 + 验证码 + 网页轮询）。
type WechatConfig struct {
	Enabled          bool          `yaml:"enabled"`
	Token            string        `yaml:"token"`
	AppID            string        `yaml:"appId"`
	AppSecret        string        `yaml:"appSecret"`
	EncodingAESKey   string        `yaml:"encodingAESKey"`
	EncryptMode      string        `yaml:"encryptMode"` // plain | compatible | safe
	LoginSessionTTL  time.Duration `yaml:"loginSessionTTL"`
	LoginCodeTTL     time.Duration `yaml:"loginCodeTTL"`
}

// Default 默认配置（无密钥）。
func Default() *Config {
	return &Config{
		MachineID: 1,
		App: AppConfig{
			Name:        "CloudSteps",
			Environment: "dev",
		},
		Server: ServerConfig{
			Name:         "CloudSteps",
			Desc:         "CloudSteps",
			Port:         7072,
			Addr:         ":7072",
			ReadTimeout:  300 * time.Second,
			WriteTimeout: 300 * time.Second,
			IdleTimeout:  120 * time.Second,
			DocsPrefix:   "/api/docs",
			APIPrefix:    "/api",
			AdminPrefix:  "/admin",
			AuthPrefix:   "/auth",
		},
		Database: DatabaseConfig{
			Driver:          "sqlite",
			DSN:             "file:cloudsteps.db?cache=shared&_fk=1",
			MaxOpenConns:    25,
			MaxIdleConns:    10,
			ConnMaxLifetime: 5 * time.Minute,
		},
		Logging: LoggingConfig{
			Level:      "info",
			Filename:   "logs/app.log",
			MaxSize:    100,
			MaxAge:     30,
			MaxBackups: 10,
			Daily:      true,
		},
		Auth: AuthConfig{
			Header:            "Authorization",
			SessionExpireDays: 7,
			TokenExpired:      "168h",
		},
		Services: ServicesConfig{
			LLM: LLMConfig{
				BaseURL: "https://api.openai.com/v1",
				Model:   "gpt-3.5-turbo",
			},
			ImageGen: ImageGenConfig{
				BaseURL: "https://ai.lingecho.com",
				Model:   "gpt-image-2-1k",
			},
			Mail: MailConfig{
				Provider: "smtp",
				Port:     587,
			},
		},
		Features: FeaturesConfig{
			LanguageEnabled: true,
			BackupPath:      "./backups",
			BackupSchedule:  "0 2 * * *",
		},
		Middleware: defaultMiddleware(false),
		RateLimit: RateLimitConfig{
			Enabled: true,
			RPS:     200,
			Burst:   400,
		},
		CircuitBreaker: CircuitBreakerConfig{
			Enabled:          true,
			FailureThreshold: 5,
			MinRequests:      10,
			RecoveryTimeout:  "30s",
		},
		Docs: DocsConfig{Enabled: true, Path: "/docs"},
		JWT: JWTConfig{
			Enabled:    false,
			Secret:     "change-me-in-prod-cloudsteps-32b",
			Issuer:     "cloudsteps",
			AccessTTL:  "15m",
			RefreshTTL: "168h",
		},
		I18n: I18nConfig{
			Enabled:          true,
			DefaultLocale:    "zh-CN",
			SupportedLocales: []string{"zh-CN", "en"},
			FallbackLocale:   "en",
			TranslationsPath: "i18n/translations",
		},
		TTS: TTSConfig{
			Provider:                "qcloud",
			WordBookBatchPerAccount: 9,
			MaxRetries:              2,
			RetryBaseMS:             800,
		},
		Cache: CacheConfig{
			Type:            "local",
			LocalMaxSize:    1000,
			LocalDefaultTTL: "5m",
		},
	}
}

func defaultMiddleware(prod bool) MiddlewareConfig {
	if prod {
		return MiddlewareConfig{
			RateLimit: RateLimiterDetailConfig{
				GlobalRPS: 2000, GlobalBurst: 4000, GlobalWindow: time.Minute,
				UserRPS: 200, UserBurst: 400, UserWindow: time.Minute,
				IPRPS: 100, IPBurst: 200, IPWindow: time.Minute,
			},
			Timeout: TimeoutDetailConfig{
				DefaultTimeout: 30 * time.Second,
				FallbackResponse: map[string]any{
					"error": "service_unavailable", "message": "服务暂时不可用，请稍后重试", "code": 503,
				},
			},
			CircuitBreaker: CircuitBreakerDetailConfig{
				FailureThreshold: 3, SuccessThreshold: 2,
				Timeout: 30 * time.Second, OpenTimeout: 30 * time.Second,
				MaxConcurrentRequests: 200,
			},
			EnableRateLimit: true, EnableTimeout: true, EnableCircuitBreaker: true, EnableOperationLog: true,
		}
	}
	return MiddlewareConfig{
		RateLimit: RateLimiterDetailConfig{
			GlobalRPS: 10000, GlobalBurst: 20000, GlobalWindow: time.Minute,
			UserRPS: 1000, UserBurst: 2000, UserWindow: time.Minute,
			IPRPS: 500, IPBurst: 1000, IPWindow: time.Minute,
		},
		Timeout: TimeoutDetailConfig{
			DefaultTimeout: 60 * time.Second,
			FallbackResponse: map[string]any{
				"error": "service_unavailable", "message": "服务暂时不可用，请稍后重试", "code": 503,
			},
		},
		CircuitBreaker: CircuitBreakerDetailConfig{
			FailureThreshold: 10, SuccessThreshold: 5,
			Timeout: 60 * time.Second, OpenTimeout: 60 * time.Second,
			MaxConcurrentRequests: 1000,
		},
		EnableRateLimit: true, EnableTimeout: true, EnableCircuitBreaker: false, EnableOperationLog: true,
	}
}

// Load 加载 YAML（可缺省），再用环境变量覆盖，并导出兼容旧 GetEnv 的键。
func Load(path string) (*Config, error) {
	cfg := Default()
	if data, err := os.ReadFile(path); err == nil {
		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, fmt.Errorf("parse yaml: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("read config: %w", err)
	}
	applyEnvOverrides(cfg)
	normalize(cfg)
	exportCompatEnv(cfg)
	Global = cfg
	return cfg, nil
}

func normalize(cfg *Config) {
	if cfg.Server.Addr == "" && cfg.Server.Port > 0 {
		cfg.Server.Addr = fmt.Sprintf(":%d", cfg.Server.Port)
	}
	if cfg.App.Name == "" && cfg.Server.Name != "" {
		cfg.App.Name = cfg.Server.Name
	}
	if cfg.Server.Name == "" && cfg.App.Name != "" {
		cfg.Server.Name = cfg.App.Name
	}
	env := strings.ToLower(cfg.App.Environment)
	if env == "production" {
		cfg.App.Environment = "prod"
	}
	if env == "development" {
		cfg.App.Environment = "dev"
	}
	// 引擎级限流开关同步到 middleware 细节
	cfg.Middleware.EnableRateLimit = cfg.RateLimit.Enabled
	cfg.Middleware.EnableCircuitBreaker = cfg.CircuitBreaker.Enabled
	if cfg.RateLimit.RPS > 0 {
		cfg.Middleware.RateLimit.GlobalRPS = cfg.RateLimit.RPS
		cfg.Middleware.RateLimit.GlobalBurst = cfg.RateLimit.Burst
	}
}

// LogConfig 转为 ling-base logger.LogConfig。
func (c *Config) LogConfig() *logger.LogConfig {
	return &logger.LogConfig{
		Level:           c.Logging.Level,
		Filename:        c.Logging.Filename,
		MaxSize:         c.Logging.MaxSize,
		MaxAge:          c.Logging.MaxAge,
		MaxBackups:      c.Logging.MaxBackups,
		Daily:           c.Logging.Daily,
		SensitiveFields: c.Logging.SensitiveFields,
	}
}

func (c *Config) ListenAddr() string {
	if c.Server.Addr != "" {
		return c.Server.Addr
	}
	return fmt.Sprintf(":%d", c.Server.Port)
}

func (c *Config) IsDev() bool {
	e := strings.ToLower(c.App.Environment)
	return e == "dev" || e == "development" || e == "test"
}

func (c *Config) Mode() string {
	switch strings.ToLower(c.App.Environment) {
	case "prod", "production":
		return "production"
	case "test":
		return "test"
	default:
		return "development"
	}
}

// exportCompatEnv 把 YAML 字段导出到环境变量，供仍用 common.GetEnv 的存储 / TTS 等读取。
func exportCompatEnv(cfg *Config) {
	set := func(k, v string) {
		if v == "" {
			return
		}
		if _, ok := os.LookupEnv(k); !ok {
			_ = os.Setenv(k, v)
		}
	}
	setBool := func(k string, v bool) {
		if _, ok := os.LookupEnv(k); ok {
			return
		}
		if v {
			_ = os.Setenv(k, "true")
		} else {
			_ = os.Setenv(k, "false")
		}
	}
	set("MACHINE_ID", strconv.FormatInt(cfg.MachineID, 10))
	set("SERVER_NAME", cfg.Server.Name)
	set("SERVER_DESC", cfg.Server.Desc)
	set("SERVER_URL", cfg.Server.URL)
	set("SERVER_LOGO", cfg.Server.Logo)
	set("SERVER_TERMS_URL", cfg.Server.TermsURL)
	set("ADDR", cfg.Server.Addr)
	set("MODE", cfg.Mode())
	set("APP_ENV", cfg.App.Environment)
	set("DB_DRIVER", cfg.Database.Driver)
	set("DSN", cfg.Database.DSN)
	set("LOG_LEVEL", cfg.Logging.Level)
	set("LOG_FILENAME", cfg.Logging.Filename)
	set("API_PREFIX", cfg.Server.APIPrefix)
	set("AUTH_PREFIX", cfg.Server.AuthPrefix)
	set("ADMIN_PREFIX", cfg.Server.AdminPrefix)
	set("DOCS_PREFIX", cfg.Server.DocsPrefix)
	set("SESSION_SECRET", cfg.Auth.SessionSecret)
	set("SESSION_EXPIRE_DAYS", strconv.Itoa(cfg.Auth.SessionExpireDays))
	set("AUTH_HEADER", cfg.Auth.Header)
	set("AUTH_TOKEN_EXPIRED", cfg.Auth.TokenExpired)
	set("MAIL_PROVIDER", cfg.Services.Mail.Provider)
	set("SMTP_HOST", cfg.Services.Mail.Host)
	set("SMTP_USERNAME", cfg.Services.Mail.Username)
	set("SMTP_PASSWORD", cfg.Services.Mail.Password)
	set("SMTP_PORT", strconv.FormatInt(cfg.Services.Mail.Port, 10))
	set("MAIL_FROM_EMAIL", cfg.Services.Mail.From)
	set("LLM_API_KEY", cfg.Services.LLM.APIKey)
	set("LLM_BASE_URL", cfg.Services.LLM.BaseURL)
	set("LLM_MODEL", cfg.Services.LLM.Model)
	set("IMAGE_GEN_API_KEY", cfg.Services.ImageGen.APIKey)
	set("IMAGE_GEN_BASE_URL", cfg.Services.ImageGen.BaseURL)
	set("IMAGE_GEN_MODEL", cfg.Services.ImageGen.Model)
	set("TTS_PROVIDER", cfg.TTS.Provider)
	set("QCLOUD_TTS_ACCOUNTS", cfg.TTS.QCloudAccountsJSON)
	set("WORDBOOK_BATCH_AUDIO_PER_ACCOUNT", strconv.Itoa(cfg.TTS.WordBookBatchPerAccount))
	set("WORDBOOK_TTS_MAX_RETRIES", strconv.Itoa(cfg.TTS.MaxRetries))
	set("WORDBOOK_TTS_RETRY_BASE_MS", strconv.Itoa(cfg.TTS.RetryBaseMS))
	set("DASHSCOPE_API_KEY", cfg.TTS.DashScopeAPIKey)
	set("REALTIME_PROVIDER", cfg.Realtime.Provider)
	set("REALTIME_API_KEY", cfg.Realtime.APIKey)
	set("REALTIME_MODEL", cfg.Realtime.Model)
	set("STORAGE_KIND", cfg.Storage.Kind)
	set("QINIU_ACCESS_KEY", cfg.Storage.QiniuAccessKey)
	set("QINIU_SECRET_KEY", cfg.Storage.QiniuSecretKey)
	set("QINIU_BUCKET", cfg.Storage.QiniuBucket)
	set("QINIU_DOMAIN", cfg.Storage.QiniuDomain)
	set("QINIU_REGION", cfg.Storage.QiniuRegion)
	setBool("QINIU_PRIVATE", cfg.Storage.QiniuPrivate)
	setBool("SSL_ENABLED", cfg.Server.SSLEnabled)
	set("CACHE_TYPE", cfg.Cache.Type)
}

func applyEnvOverrides(cfg *Config) {
	if v := os.Getenv("APP_ENV"); v != "" {
		cfg.App.Environment = v
	}
	if v := os.Getenv("MODE"); v != "" {
		cfg.App.Environment = v
	}
	if v := os.Getenv("ADDR"); v != "" {
		cfg.Server.Addr = v
	}
	if v := os.Getenv("DB_DRIVER"); v != "" {
		cfg.Database.Driver = v
	}
	if v := os.Getenv("DSN"); v != "" {
		cfg.Database.DSN = v
	}
	if v := os.Getenv("APP_JWT_SECRET"); v != "" {
		cfg.JWT.Secret = v
	}
	if v := os.Getenv("APP_JWT_ENABLED"); v != "" {
		cfg.JWT.Enabled = strings.EqualFold(v, "true") || v == "1"
	}
	if v := os.Getenv("SSL_ENABLED"); v != "" {
		cfg.Server.SSLEnabled = strings.EqualFold(v, "true") || v == "1"
	}
	if v := os.Getenv("SESSION_SECRET"); v != "" {
		cfg.Auth.SessionSecret = v
	}
	if v := os.Getenv("WECHAT_ENABLED"); v != "" {
		cfg.Wechat.Enabled = strings.EqualFold(v, "true") || v == "1"
	}
	if v := os.Getenv("WECHAT_TOKEN"); v != "" {
		cfg.Wechat.Token = v
	}
	if v := os.Getenv("WECHAT_APP_ID"); v != "" {
		cfg.Wechat.AppID = v
	}
	if v := os.Getenv("WECHAT_APP_SECRET"); v != "" {
		cfg.Wechat.AppSecret = v
	}
	if v := os.Getenv("WECHAT_ENCODING_AES_KEY"); v != "" {
		cfg.Wechat.EncodingAESKey = v
	}
}
