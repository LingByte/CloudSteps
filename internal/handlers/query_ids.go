package handlers

import (
	"strconv"
	"strings"

	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
)

// parseQueryUintID 解析 query/path 中的无符号 ID（支持雪花 ID 字符串）。
func parseQueryUintID(raw string) uint {
	s := strings.TrimSpace(raw)
	if s == "" {
		return 0
	}
	n, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0
	}
	return uint(n)
}

// parseRouteUintID 解析路由 path 参数中的无符号 ID（支持雪花 ID）。
func parseRouteUintID(c *gin.Context, param string) (uint, bool) {
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param(param)), 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "wordbook.invalid_id", err)
		return 0, false
	}
	return uint(id), true
}
