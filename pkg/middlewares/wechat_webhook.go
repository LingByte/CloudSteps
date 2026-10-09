package middlewares

import (
	lbmw "github.com/LingByte/ling-base/middleware"
	"github.com/gin-gonic/gin"
)

// skipTimeoutCircuitPath 这些路径不能进熔断：
// 公众号回调必须稳定 200；登录状态是 2s 轮询，429/瞬时失败会把整条登录链路掐死。
func skipTimeoutCircuitPath(path string) bool {
	switch path {
	case "/api/auth/wechat/mp/message",
		"/api/auth/wechat/login/status":
		return true
	default:
		return false
	}
}

// CircuitBreakerMiddleware 包装 ling-base 熔断器，微信登录相关路径跳过。
func CircuitBreakerMiddleware() gin.HandlerFunc {
	inner := lbmw.CircuitBreakerMiddleware()
	return func(c *gin.Context) {
		if skipTimeoutCircuitPath(c.Request.URL.Path) {
			c.Next()
			return
		}
		inner(c)
	}
}

// CombinedTimeoutCircuitMiddleware 包装组合中间件，微信登录相关路径跳过。
func CombinedTimeoutCircuitMiddleware() gin.HandlerFunc {
	inner := lbmw.CombinedTimeoutCircuitMiddleware()
	return func(c *gin.Context) {
		if skipTimeoutCircuitPath(c.Request.URL.Path) {
			c.Next()
			return
		}
		inner(c)
	}
}
