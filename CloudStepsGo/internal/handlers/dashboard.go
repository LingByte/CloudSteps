package handlers

import (
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/constants"
	"github.com/LingByte/CloudStepsGo/pkg/response"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (h *Handlers) registerAdminDashboardRoutes(r *gin.RouterGroup) {
	r.GET("/dashboard", adminOnly(), h.handleAdminDashboard)
}

// GET /dashboard
func (h *Handlers) handleAdminDashboard(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)

	// 总用户数
	var totalUsers int64
	db.Model(&models.User{}).Count(&totalUsers)

	// 今日新增用户
	todayStart := time.Now().Truncate(24 * time.Hour)
	var newUsersToday int64
	db.Model(&models.User{}).Where("created_at >= ?", todayStart).Count(&newUsersToday)
	// 最近7天每天的 PV / UV / 训练次数
	type DayStats struct {
		Date       string `json:"date"`
		PV         int64  `json:"pv"`
		UV         int64  `json:"uv"`
		TrainCount int64  `json:"trainCount"`
	}

	days := make([]DayStats, 7)
	now := time.Now()
	for i := 6; i >= 0; i-- {
		day := now.AddDate(0, 0, -i).Truncate(24 * time.Hour)
		nextDay := day.Add(24 * time.Hour)
		dateStr := day.Format("01/02")

		// PV: login_history 中当天的登录次数（成功）
		var pv int64
		db.Model(&models.LoginHistory{}).
			Where("created_at >= ? AND created_at < ? AND success = ?", day, nextDay, true).
			Count(&pv)

		// UV: 当天独立登录用户数
		var uv int64
		db.Model(&models.LoginHistory{}).
			Where("created_at >= ? AND created_at < ? AND success = ?", day, nextDay, true).
			Distinct("user_id").Count(&uv)

		days[6-i] = DayStats{
			Date: dateStr,
			PV:   pv,
			UV:   uv,
		}
	}

	response.Success(c, "ok", gin.H{
		"totalUsers":    totalUsers,
		"newUsersToday": newUsersToday,
		"daily":         days,
	})
}
