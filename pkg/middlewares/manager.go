package middlewares

import (
	"time"

	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/ling-base/common/logger"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// MiddlewareManager 中间件管理器（CloudSteps 配置面 + ling-base 超时熔断）。
type MiddlewareManager struct {
	config      configs.MiddlewareConfig
	rateLimiter *RateLimiter
}

// NewMiddlewareManager 创建中间件管理器
func NewMiddlewareManager(cfg configs.MiddlewareConfig) *MiddlewareManager {
	mgr := &MiddlewareManager{
		config: cfg,
	}

	if cfg.EnableRateLimit {
		rateLimitConfig := RateLimiterConfig{
			GlobalRPS:      cfg.RateLimit.GlobalRPS,
			GlobalBurst:    cfg.RateLimit.GlobalBurst,
			GlobalWindow:   cfg.RateLimit.GlobalWindow,
			UserRPS:        cfg.RateLimit.UserRPS,
			UserBurst:      cfg.RateLimit.UserBurst,
			UserWindow:     cfg.RateLimit.UserWindow,
			IPRPS:          cfg.RateLimit.IPRPS,
			IPBurst:        cfg.RateLimit.IPBurst,
			IPWindow:       cfg.RateLimit.IPWindow,
			EndpointLimits: getDefaultEndpointLimits(),
		}
		mgr.rateLimiter = NewRateLimiter(rateLimitConfig)
		globalRateLimiter = mgr.rateLimiter
		logger.Info("Rate limiter initialized",
			zap.Int("globalRPS", cfg.RateLimit.GlobalRPS),
			zap.Int("userRPS", cfg.RateLimit.UserRPS),
			zap.Int("ipRPS", cfg.RateLimit.IPRPS))
	}

	if cfg.EnableTimeout || cfg.EnableCircuitBreaker {
		timeoutConfig := TimeoutConfig{
			DefaultTimeout:   cfg.Timeout.DefaultTimeout,
			EndpointTimeouts: getDefaultEndpointTimeouts(),
			FallbackResponse: cfg.Timeout.FallbackResponse,
		}
		if timeoutConfig.DefaultTimeout <= 0 {
			timeoutConfig.DefaultTimeout = DefaultTimeoutConfig().DefaultTimeout
		}
		if timeoutConfig.FallbackResponse == nil {
			timeoutConfig.FallbackResponse = DefaultTimeoutConfig().FallbackResponse
		}
		circuitBreakerConfig := CircuitBreakerConfig{
			FailureThreshold:      cfg.CircuitBreaker.FailureThreshold,
			SuccessThreshold:      cfg.CircuitBreaker.SuccessThreshold,
			Timeout:               cfg.CircuitBreaker.Timeout,
			OpenTimeout:           cfg.CircuitBreaker.OpenTimeout,
			MaxConcurrentRequests: cfg.CircuitBreaker.MaxConcurrentRequests,
		}
		if circuitBreakerConfig.FailureThreshold <= 0 {
			circuitBreakerConfig = DefaultCircuitBreakerConfig()
		}
		// sync.Once：若 app 层已 Init，此处为 no-op，保留先置入的 enable 标志。
		InitTimeoutCircuitManager(timeoutConfig, circuitBreakerConfig, cfg.EnableTimeout, cfg.EnableCircuitBreaker)
		logger.Info("Timeout and circuit breaker manager initialized",
			zap.Duration("defaultTimeout", timeoutConfig.DefaultTimeout),
			zap.Int("failureThreshold", circuitBreakerConfig.FailureThreshold))
	}

	return mgr
}

func getDefaultEndpointLimits() map[string]EndpointLimit {
	return map[string]EndpointLimit{
		"/api/auth/login/password": {
			RPS:    1,
			Burst:  5,
			Window: time.Minute,
		},
		"/api/auth/login/email": {
			RPS:    1,
			Burst:  5,
			Window: time.Minute,
		},
		"/api/auth/register": {
			RPS:    1,
			Burst:  3,
			Window: time.Minute,
		},
		"/api/upload": {
			RPS:    2,
			Burst:  5,
			Window: time.Minute,
		},
	}
}

func getDefaultEndpointTimeouts() map[string]time.Duration {
	return map[string]time.Duration{
		"/api/auth/login/password":        10 * time.Second,
		"/api/auth/login/email":           10 * time.Second,
		"/api/upload":                     5 * time.Minute,
		"/api/assistant/chat":             60 * time.Second,
		"/api/chat/send":                  60 * time.Second,
		"/api/workflow/execute":           10 * time.Minute,
		"/api/voice/training/create":      30 * time.Second,
		"/api/voice/synthesis":            30 * time.Second,
		"/api/voice/realtime/":            10 * time.Minute,
		"/api/voice/CloudStepsGo/v1/":     10 * time.Minute,
		"/api/admin/storage/stats/":       2 * time.Minute,
		"/api/wordbooks/batch-audio/jobs": 8 * time.Second,
		"/api/wordbooks/cover-ai/jobs":    8 * time.Second,
		"/api/admin/wechat-mp-articles/generate-thumb": 15 * time.Second,
		"/api/wordbooks/custom":           2 * time.Minute,
	}
}

// ApplyMiddlewares 应用中间件到路由组
func (mgr *MiddlewareManager) ApplyMiddlewares(r *gin.RouterGroup) {
	logger.Info("Applying middlewares",
		zap.Bool("rateLimit", mgr.config.EnableRateLimit),
		zap.Bool("timeout", mgr.config.EnableTimeout),
		zap.Bool("circuitBreaker", mgr.config.EnableCircuitBreaker),
		zap.Bool("operationLog", mgr.config.EnableOperationLog))

	if mgr.config.EnableRateLimit && mgr.rateLimiter != nil {
		// 全局限流已迁至 engine 层 pkg/middlewares.RateLimit（tokenbucket）。
		// 此处保留细粒度 endpoint / IP / 用户限流作为补充。
		r.Use(RateLimitMiddleware())
		logger.Info("Endpoint rate limit middleware applied (legacy supplement)")
	}

	if mgr.config.EnableTimeout || mgr.config.EnableCircuitBreaker {
		r.Use(CombinedTimeoutCircuitMiddleware())
		logger.Info("Timeout and circuit breaker middleware applied")
	}

	if mgr.config.EnableOperationLog {
		r.Use(OperationLogMiddleware())
		logger.Info("Operation log middleware applied")
	}
}

// GetStats 获取所有中间件统计信息
func (mgr *MiddlewareManager) GetStats() map[string]interface{} {
	stats := make(map[string]interface{})
	if mgr.rateLimiter != nil {
		stats["rate_limiter"] = mgr.rateLimiter.GetStats()
	}
	if mgr.config.EnableTimeout || mgr.config.EnableCircuitBreaker {
		stats["circuit_breakers"] = GetCircuitBreakerStats()
	}
	return stats
}

// UpdateRateLimitConfig 动态更新限流配置
func (mgr *MiddlewareManager) UpdateRateLimitConfig(cfg configs.RateLimiterDetailConfig) {
	if mgr.rateLimiter == nil {
		return
	}
	mgr.config.RateLimit = cfg
	rateLimitConfig := RateLimiterConfig{
		GlobalRPS:      cfg.GlobalRPS,
		GlobalBurst:    cfg.GlobalBurst,
		GlobalWindow:   cfg.GlobalWindow,
		UserRPS:        cfg.UserRPS,
		UserBurst:      cfg.UserBurst,
		UserWindow:     cfg.UserWindow,
		IPRPS:          cfg.IPRPS,
		IPBurst:        cfg.IPBurst,
		IPWindow:       cfg.IPWindow,
		EndpointLimits: getDefaultEndpointLimits(),
	}
	mgr.rateLimiter = NewRateLimiter(rateLimitConfig)
	globalRateLimiter = mgr.rateLimiter
	logger.Info("Rate limit configuration updated",
		zap.Int("globalRPS", cfg.GlobalRPS),
		zap.Int("userRPS", cfg.UserRPS))
}

// UpdateTimeoutConfig 动态更新超时配置。
// ling-base 的超时管理器仅支持进程启动时 Init 一次，运行时变更需重启生效。
func (mgr *MiddlewareManager) UpdateTimeoutConfig(cfg configs.TimeoutDetailConfig) {
	mgr.config.Timeout = cfg
	logger.Warn("Timeout configuration stored; restart required for ling-base timeout manager to apply changes",
		zap.Duration("defaultTimeout", cfg.DefaultTimeout))
}

// UpdateCircuitBreakerConfig 动态更新熔断器配置（同超时：需重启生效）。
func (mgr *MiddlewareManager) UpdateCircuitBreakerConfig(cfg configs.CircuitBreakerDetailConfig) {
	mgr.config.CircuitBreaker = cfg
	logger.Warn("Circuit breaker configuration stored; restart required to apply changes",
		zap.Int("failureThreshold", cfg.FailureThreshold))
}

var globalMiddlewareManager *MiddlewareManager

// InitGlobalMiddlewareManager 初始化全局中间件管理器
func InitGlobalMiddlewareManager(cfg configs.MiddlewareConfig) {
	globalMiddlewareManager = NewMiddlewareManager(cfg)
	logger.Info("Global middleware manager initialized")
}

// GetGlobalMiddlewareManager 获取全局中间件管理器
func GetGlobalMiddlewareManager() *MiddlewareManager {
	if globalMiddlewareManager == nil {
		if configs.Global != nil {
			globalMiddlewareManager = NewMiddlewareManager(configs.Global.Middleware)
		} else {
			defaultConfig := configs.MiddlewareConfig{
				RateLimit: configs.RateLimiterDetailConfig{
					GlobalRPS:    1000,
					GlobalBurst:  2000,
					GlobalWindow: time.Minute,
					UserRPS:      100,
					UserBurst:    200,
					UserWindow:   time.Minute,
					IPRPS:        50,
					IPBurst:      100,
					IPWindow:     time.Minute,
				},
				Timeout: configs.TimeoutDetailConfig{
					DefaultTimeout: 30 * time.Second,
					FallbackResponse: map[string]any{
						"error":   "service_unavailable",
						"message": "服务暂时不可用，请稍后重试",
						"code":    503,
					},
				},
				CircuitBreaker: configs.CircuitBreakerDetailConfig{
					FailureThreshold:      5,
					SuccessThreshold:      3,
					Timeout:               30 * time.Second,
					OpenTimeout:           60 * time.Second,
					MaxConcurrentRequests: 100,
				},
				EnableRateLimit:      true,
				EnableTimeout:        true,
				EnableCircuitBreaker: true,
				EnableOperationLog:   true,
			}
			globalMiddlewareManager = NewMiddlewareManager(defaultConfig)
		}
		logger.Info("Global middleware manager created with default config")
	}
	return globalMiddlewareManager
}

// ApplyGlobalMiddlewares 应用全局中间件
func ApplyGlobalMiddlewares(r *gin.RouterGroup) {
	mgr := GetGlobalMiddlewareManager()
	mgr.ApplyMiddlewares(r)
}

// GetGlobalMiddlewareStats 获取全局中间件统计信息
func GetGlobalMiddlewareStats() map[string]interface{} {
	mgr := GetGlobalMiddlewareManager()
	return mgr.GetStats()
}
