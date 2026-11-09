package handlers

import (
	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/ling-base/apidocs/humax"
	lbconstants "github.com/LingByte/ling-base/common/constants"

	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (h *Handlers) registerCheckInRoutes(r *humax.Group) {
	g := r.Group("teacher/checkin")
	g.Use(auth.Required, h.requireTeacherOrAdmin)
	{
		g.GET("", h.handleTeacherCheckInStatus)
		g.POST("", h.handleTeacherCheckIn)
	}
}

func (h *Handlers) handleTeacherCheckInStatus(c *gin.Context) {
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "checkin.not_logged_in", nil)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	st, err := models.GetTeacherCheckInStatus(db, tid, time.Now())
	if err != nil {
		response.FailI18n(c, "checkin.query_failed", err.Error())
		return
	}
	response.SuccessI18n(c, "common.ok", st)
}

func (h *Handlers) handleTeacherCheckIn(c *gin.Context) {
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "checkin.not_logged_in", nil)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	if models.TeacherHasActiveSubscription(db, tid) {
		response.FailI18n(c, "checkin.member_exempt", nil)
		return
	}
	res, err := models.DoTeacherCheckIn(db, tid, time.Now())
	if err != nil {
		response.FailI18n(c, "checkin.query_failed", err.Error())
		return
	}
	msgKey := "checkin.ok"
	if res.AlreadyCheckedIn {
		msgKey = "checkin.already"
	}
	response.SuccessI18n(c, msgKey, res)
}
