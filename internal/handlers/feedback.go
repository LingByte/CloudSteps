package handlers

import (
	"errors"
	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/ling-base/apidocs/humax"
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type feedbackCreateReq struct {
	Content string `json:"content"`
	Contact string `json:"contact"`
}

type feedbackReplyReq struct {
	Content string `json:"content"`
}

type feedbackReplyDTO struct {
	ID        uint      `json:"id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

type feedbackTicketDTO struct {
	ID               uint               `json:"id"`
	Content          string             `json:"content"`
	Contact          string             `json:"contact,omitempty"`
	Status           string             `json:"status"`
	UserUnread       bool               `json:"userUnread"`
	LastRepliedAt    *time.Time         `json:"lastRepliedAt,omitempty"`
	LastReplierRole  string             `json:"lastReplierRole,omitempty"`
	LastReplyPreview string             `json:"lastReplyPreview,omitempty"`
	ReplyCount       int                `json:"replyCount"`
	CreatedAt        time.Time          `json:"createdAt"`
	Replies          []feedbackReplyDTO `json:"replies,omitempty"`
}

func (h *Handlers) registerFeedbackRoutes(r *humax.Group) {
	g := r.Group("feedback")
	g.Use(auth.Required)
	{
		g.GET("", h.handleListMyFeedback)
		g.POST("", h.handleCreateFeedback)
		g.GET("/unread-count", h.handleFeedbackUnreadCount)
		g.POST("/read-all", h.handleMarkMyFeedbackReadAll)
		g.POST("/images", h.handleUploadFeedbackImage)
		g.GET("/:id", h.handleGetMyFeedback)
		g.POST("/:id/replies", h.handleReplyMyFeedback)
	}
}

func (h *Handlers) handleCreateFeedback(c *gin.Context) {
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	var req feedbackCreateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	ticket, err := models.NewFeedbackTicket(user.ID, req.Content, req.Contact, strconv.FormatUint(uint64(user.ID), 10))
	if err != nil {
		response.FailI18n(c, feedbackErrMsg(err), err)
		return
	}
	if err := h.db.Create(ticket).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.submitted", toFeedbackTicketDTO(ticket, nil))
}

func (h *Handlers) handleListMyFeedback(c *gin.Context) {
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	page, pageSize := parsePageParams(c)
	q := h.db.Model(&models.FeedbackTicket{}).
		Where("user_id = ?", user.ID)

	var total int64
	if err := q.Count(&total).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	var rows []models.FeedbackTicket
	if err := q.Order("updated_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	list := make([]feedbackTicketDTO, 0, len(rows))
	for i := range rows {
		list = append(list, toFeedbackTicketDTO(&rows[i], nil))
	}
	response.SuccessI18n(c, "common.ok", gin.H{
		"list":     list,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (h *Handlers) handleGetMyFeedback(c *gin.Context) {
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	ticket, ok := h.findOwnedFeedback(c, user.ID)
	if !ok {
		return
	}
	if ticket.UserUnread {
		if err := h.db.Model(ticket).Update("user_unread", false).Error; err != nil {
			response.FailI18n(c, "common.operation_failed", err)
			return
		}
		ticket.UserUnread = false
	}
	replies, err := loadFeedbackReplies(h.db, ticket.ID)
	if err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	response.SuccessI18n(c, "common.ok", toFeedbackTicketDTO(ticket, replies))
}

func (h *Handlers) handleReplyMyFeedback(c *gin.Context) {
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	ticket, ok := h.findOwnedFeedback(c, user.ID)
	if !ok {
		return
	}
	var req feedbackReplyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	if _, err := appendFeedbackReply(h.db, ticket, user.ID, models.FeedbackRoleUser, req.Content, strconv.FormatUint(uint64(user.ID), 10)); err != nil {
		response.FailI18n(c, feedbackErrMsg(err), err)
		return
	}
	replies, err := loadFeedbackReplies(h.db, ticket.ID)
	if err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	response.SuccessI18n(c, "msg.4bea887d", toFeedbackTicketDTO(ticket, replies))
}

func (h *Handlers) handleFeedbackUnreadCount(c *gin.Context) {
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	var count int64
	if err := h.db.Model(&models.FeedbackTicket{}).
		Where("user_id = ? AND user_unread = ?", user.ID, true).
		Count(&count).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	response.SuccessI18n(c, "common.ok", gin.H{"count": count})
}

func (h *Handlers) handleMarkMyFeedbackReadAll(c *gin.Context) {
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	if err := h.db.Model(&models.FeedbackTicket{}).
		Where("user_id = ? AND user_unread = ?", user.ID, true).
		Update("user_unread", false).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.ok", nil)
}

func (h *Handlers) findOwnedFeedback(c *gin.Context, userID uint) (*models.FeedbackTicket, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "feedback.not_found", err)
		return nil, false
	}
	var ticket models.FeedbackTicket
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).
		First(&ticket).Error; err != nil {
		response.FailI18n(c, "feedback.not_found", err)
		return nil, false
	}
	return &ticket, true
}

func loadFeedbackReplies(db *gorm.DB, ticketID uint) ([]models.FeedbackReply, error) {
	var replies []models.FeedbackReply
	err := db.Where("ticket_id = ?", ticketID).
		Order("id ASC").Find(&replies).Error
	return replies, err
}

func appendFeedbackReply(db *gorm.DB, ticket *models.FeedbackTicket, authorID uint, role, content, operator string) (*models.FeedbackReply, error) {
	if !ticket.CanReply() {
		return nil, models.ErrFeedbackClosed
	}
	reply, err := models.NewFeedbackReply(ticket.ID, authorID, role, content, operator)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	preview := models.PreviewFeedback(reply.Content, models.FeedbackPreviewMaxRunes)
	updates := map[string]any{
		"reply_count":        gorm.Expr("reply_count + 1"),
		"last_replier_role":  role,
		"last_replied_at":    now,
		"last_reply_preview": preview,
		"update_by":          operator,
		"updated_at":         now,
	}
	if role == models.FeedbackRoleAdmin {
		updates["user_unread"] = true
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(reply).Error; err != nil {
			return err
		}
		return tx.Model(ticket).Updates(updates).Error
	})
	if err != nil {
		return nil, err
	}
	ticket.ReplyCount++
	ticket.LastReplierRole = role
	ticket.LastRepliedAt = &now
	ticket.LastReplyPreview = preview
	if role == models.FeedbackRoleAdmin {
		ticket.UserUnread = true
	}
	return reply, nil
}

func toFeedbackTicketDTO(ticket *models.FeedbackTicket, replies []models.FeedbackReply) feedbackTicketDTO {
	out := feedbackTicketDTO{
		ID:               ticket.ID,
		Content:          ticket.Content,
		Contact:          ticket.Contact,
		Status:           ticket.Status,
		UserUnread:       ticket.UserUnread,
		LastRepliedAt:    ticket.LastRepliedAt,
		LastReplierRole:  ticket.LastReplierRole,
		LastReplyPreview: ticket.LastReplyPreview,
		ReplyCount:       ticket.ReplyCount,
		CreatedAt:        ticket.CreatedAt,
	}
	if len(replies) > 0 {
		out.Replies = make([]feedbackReplyDTO, 0, len(replies))
		for _, r := range replies {
			out.Replies = append(out.Replies, feedbackReplyDTO{
				ID:        r.ID,
				Role:      r.Role,
				Content:   r.Content,
				CreatedAt: r.CreatedAt,
			})
		}
	}
	return out
}

func feedbackErrMsg(err error) string {
	switch {
	case errors.Is(err, models.ErrFeedbackClosed):
		return "feedback.closed"
	case errors.Is(err, models.ErrFeedbackContentInvalid):
		return "feedback.content_invalid"
	case errors.Is(err, models.ErrFeedbackContactInvalid):
		return "feedback.contact_invalid"
	default:
		return "common.operation_failed"
	}
}

func parseFeedbackID(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "feedback.not_found", err)
		return 0, false
	}
	return uint(id), true
}
