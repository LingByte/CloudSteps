package handlers

import (
	"errors"
	"strings"

	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/ling-base/apidocs/humax"
	lbconstants "github.com/LingByte/ling-base/common/constants"

	"github.com/LingByte/CloudStepsGo/internal/models"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (h *Handlers) registerInviteRoutes(r *humax.Group) {
	g := r.Group("invite")
	g.Use(auth.Required)
	{
		g.GET("/me", h.handleInviteMe)
		g.POST("/rotate", h.handleInviteRotate)
	}

	admin := r.Group("admin")
	admin.Use(auth.Required, auth.AdminRequired)
	{
		admin.GET("/invite/records", h.handleAdminListInviteRecords)
		admin.GET("/invite/reward", h.handleAdminGetInviteReward)
		admin.PUT("/invite/reward", h.handleAdminPutInviteReward)
	}
}

func (h *Handlers) handleInviteMe(c *gin.Context) {
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	ov, err := models.GetInviteOverview(db, user.ID)
	if err != nil {
		response.FailI18n(c, "invite.query_failed", err)
		return
	}
	response.SuccessI18n(c, "common.success", ov)
}

func (h *Handlers) handleInviteRotate(c *gin.Context) {
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	row, err := models.RotateInviteCode(db, user.ID)
	if err != nil {
		response.FailI18n(c, "invite.rotate_failed", err)
		return
	}
	ov, err := models.GetInviteOverview(db, user.ID)
	if err != nil {
		response.FailI18n(c, "invite.query_failed", err)
		return
	}
	ov.Code = row.Code
	response.SuccessI18n(c, "invite.rotated", ov)
}

func (h *Handlers) handleAdminListInviteRecords(c *gin.Context) {
	page, pageSize := parsePageParams(c)
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	out, err := models.ListAdminInviteRecords(db, models.AdminInviteListQuery{
		Page:     page,
		PageSize: pageSize,
		Status:   strings.TrimSpace(c.Query("status")),
		Search:   strings.TrimSpace(c.Query("search")),
	})
	if err != nil {
		response.FailI18n(c, "invite.query_failed", err)
		return
	}
	response.SuccessI18n(c, "common.ok", out)
}

func (h *Handlers) handleAdminGetInviteReward(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	row, err := models.GetOrCreateInviteRewardSetting(db)
	if err != nil {
		response.FailI18n(c, "invite.reward_query_failed", err)
		return
	}
	response.SuccessI18n(c, "common.ok", row)
}

func (h *Handlers) handleAdminPutInviteReward(c *gin.Context) {
	var body models.InviteRewardSetting
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	row, err := models.SaveInviteRewardSetting(db, body)
	if err != nil {
		response.FailI18n(c, "invite.reward_save_failed", err)
		return
	}
	response.SuccessI18n(c, "invite.reward_saved", row)
}

func previewInviteCode(db *gorm.DB, rawCode string) error {
	if strings.TrimSpace(rawCode) == "" {
		return nil
	}
	_, err := models.FindInviteCodeOwner(db, rawCode)
	return err
}

func inviteErrMsg(err error) string {
	switch {
	case errors.Is(err, models.ErrInviteCodeInvalid):
		return "invite.invalid"
	case errors.Is(err, models.ErrInviteCodeSelf):
		return "invite.self"
	case errors.Is(err, models.ErrInviteAlreadyBound):
		return "invite.already_bound"
	default:
		return "invite.apply_failed"
	}
}

func applyInviteAfterRegister(db *gorm.DB, inviteeID uint, rawCode string) error {
	err := models.ApplyInviteCode(db, inviteeID, rawCode)
	if err == nil || errors.Is(err, models.ErrInviteAlreadyBound) {
		return nil
	}
	return err
}
