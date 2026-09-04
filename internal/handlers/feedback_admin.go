package handlers

import (
	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/ling-base/apidocs/humax"
	"strconv"
	"strings"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	"github.com/LingByte/CloudStepsGo/internal/models"
	common "github.com/LingByte/ling-base/common"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type adminFeedbackTicketDTO struct {
	feedbackTicketDTO
	UserID     uint   `json:"userId"`
	UserName   string `json:"userName,omitempty"`
	UserEmail  string `json:"userEmail,omitempty"`
	UserAvatar string `json:"userAvatar,omitempty"`
}

func (h *Handlers) registerFeedbackAdminRoutes(r *humax.Group) {
	admin := r.Group("admin")
	admin.Use(auth.Required, auth.AdminRequired)
	g := admin.Group("feedbacks")
	{
		g.GET("", h.handleAdminListFeedback)
		g.POST("/images", h.handleUploadFeedbackImage)
		g.GET("/:id", h.handleAdminGetFeedback)
		g.POST("/:id/replies", h.handleAdminReplyFeedback)
		g.POST("/:id/close", h.handleAdminCloseFeedback)
	}
}

func (h *Handlers) handleAdminListFeedback(c *gin.Context) {
	page, pageSize := parsePageParams(c)
	status := strings.TrimSpace(c.Query("status"))
	userID := strings.TrimSpace(c.Query("userId"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	userUnread := strings.TrimSpace(c.Query("userUnread"))

	q := h.db.Model(&models.FeedbackTicket{})
	if status == models.FeedbackStatusOpen || status == models.FeedbackStatusClosed {
		q = q.Where("status = ?", status)
	}
	if userID != "" {
		q = q.Where("user_id = ?", userID)
	}
	if userUnread == "true" || userUnread == "1" {
		q = q.Where("user_unread = ?", true)
	} else if userUnread == "false" || userUnread == "0" {
		q = q.Where("user_unread = ?", false)
	}
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("content LIKE ? OR last_reply_preview LIKE ?", like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	var rows []models.FeedbackTicket
	if err := q.Order("updated_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}

	labels := loadFeedbackUserLabels(h.db, rows)
	list := make([]adminFeedbackTicketDTO, 0, len(rows))
	for i := range rows {
		list = append(list, toAdminFeedbackDTO(&rows[i], nil, labels))
	}
	response.SuccessI18n(c, "common.ok", gin.H{
		"list":     list,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (h *Handlers) handleAdminGetFeedback(c *gin.Context) {
	ticket, ok := h.findAdminFeedback(c)
	if !ok {
		return
	}
	replies, err := loadFeedbackReplies(h.db, ticket.ID)
	if err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	labels := loadFeedbackUserLabels(h.db, []models.FeedbackTicket{*ticket})
	response.SuccessI18n(c, "common.ok", toAdminFeedbackDTO(ticket, replies, labels))
}

func (h *Handlers) handleAdminReplyFeedback(c *gin.Context) {
	admin := auth.CurrentUser(c)
	if admin == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	ticket, ok := h.findAdminFeedback(c)
	if !ok {
		return
	}
	var req feedbackReplyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	reply, err := appendFeedbackReply(h.db, ticket, admin.ID, models.FeedbackRoleAdmin, req.Content, strconv.FormatUint(uint64(admin.ID), 10))
	if err != nil {
		response.FailI18n(c, feedbackErrMsg(err), err)
		return
	}

	owner, err := models.GetUserByUID(h.db, ticket.UserID)
	if err == nil && owner != nil {
		common.Sig().Emit(constants.SigFeedbackAdminReplied, owner, ticket, reply, c, h.db)
	}

	replies, err := loadFeedbackReplies(h.db, ticket.ID)
	if err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	labels := loadFeedbackUserLabels(h.db, []models.FeedbackTicket{*ticket})
	response.SuccessI18n(c, "msg.4bea887d", toAdminFeedbackDTO(ticket, replies, labels))
}

func (h *Handlers) handleAdminCloseFeedback(c *gin.Context) {
	admin := auth.CurrentUser(c)
	if admin == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	ticket, ok := h.findAdminFeedback(c)
	if !ok {
		return
	}
	if ticket.Status == models.FeedbackStatusClosed {
		replies, err := loadFeedbackReplies(h.db, ticket.ID)
		if err != nil {
			response.FailI18n(c, "common.query_failed", err)
			return
		}
		labels := loadFeedbackUserLabels(h.db, []models.FeedbackTicket{*ticket})
		response.SuccessI18n(c, "common.closed", toAdminFeedbackDTO(ticket, replies, labels))
		return
	}
	if err := h.db.Model(ticket).Updates(map[string]any{
		"status":    models.FeedbackStatusClosed,
		"update_by": strconv.FormatUint(uint64(admin.ID), 10),
	}).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	ticket.Status = models.FeedbackStatusClosed
	replies, err := loadFeedbackReplies(h.db, ticket.ID)
	if err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	labels := loadFeedbackUserLabels(h.db, []models.FeedbackTicket{*ticket})
	response.SuccessI18n(c, "common.closed", toAdminFeedbackDTO(ticket, replies, labels))
}

func (h *Handlers) findAdminFeedback(c *gin.Context) (*models.FeedbackTicket, bool) {
	id, ok := parseFeedbackID(c)
	if !ok {
		return nil, false
	}
	var ticket models.FeedbackTicket
	if err := h.db.Where("id = ?", id).First(&ticket).Error; err != nil {
		response.FailI18n(c, "feedback.not_found", err)
		return nil, false
	}
	return &ticket, true
}

func toAdminFeedbackDTO(ticket *models.FeedbackTicket, replies []models.FeedbackReply, labels map[uint]inboxUserLabel) adminFeedbackTicketDTO {
	label := labels[ticket.UserID]
	return adminFeedbackTicketDTO{
		feedbackTicketDTO: toFeedbackTicketDTO(ticket, replies),
		UserID:            ticket.UserID,
		UserName:          label.Name,
		UserEmail:         label.Email,
		UserAvatar:        label.Avatar,
	}
}

func loadFeedbackUserLabels(db *gorm.DB, rows []models.FeedbackTicket) map[uint]inboxUserLabel {
	out := map[uint]inboxUserLabel{}
	if len(rows) == 0 {
		return out
	}
	seen := map[uint]struct{}{}
	ids := make([]uint, 0, len(rows))
	for _, row := range rows {
		if row.UserID == 0 {
			continue
		}
		if _, ok := seen[row.UserID]; ok {
			continue
		}
		seen[row.UserID] = struct{}{}
		ids = append(ids, row.UserID)
	}
	if len(ids) == 0 {
		return out
	}
	var users []models.User
	if err := db.Where("id IN ?", ids).Find(&users).Error; err != nil {
		return out
	}
	for _, u := range users {
		name := u.DisplayName
		if name == "" {
			name = u.Username
		}
		out[u.ID] = inboxUserLabel{Name: name, Email: u.Username, Avatar: u.Avatar}
	}
	return out
}
