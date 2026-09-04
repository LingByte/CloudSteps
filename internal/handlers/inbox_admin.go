package handlers

import (
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/pkg/notify"
	"github.com/LingByte/ling-base/apidocs/humax"

	"github.com/LingByte/CloudStepsGo/internal/models"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/LingByte/ling-base/notification/inbox"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type adminInboxMessageRow struct {
	ID          uint      `json:"id"`
	UserID      string    `json:"userId"`
	UserName    string    `json:"userName,omitempty"`
	UserEmail   string    `json:"userEmail,omitempty"`
	Title       string    `json:"title"`
	Content     string    `json:"content"`
	ActionURL   string    `json:"actionUrl,omitempty"`
	ActionLabel string    `json:"actionLabel,omitempty"`
	Read        bool      `json:"read"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type inboxMessageCreateReq struct {
	UserID      string `json:"userId" binding:"required"`
	Title       string `json:"title" binding:"required,max=255"`
	Content     string `json:"content" binding:"required"`
	ActionURL   string `json:"actionUrl" binding:"max=512"`
	ActionLabel string `json:"actionLabel" binding:"max=64"`
}

type inboxMessageUpdateReq struct {
	Title       string `json:"title" binding:"max=255"`
	Content     string `json:"content"`
	ActionURL   string `json:"actionUrl" binding:"max=512"`
	ActionLabel string `json:"actionLabel" binding:"max=64"`
	Read        *bool  `json:"read"`
}

func (h *Handlers) registerInboxAdminRoutes(admin *humax.Group) {
	g := admin.Group("inbox-messages")
	{
		g.GET("", h.handleAdminListInboxMessages)
		g.POST("", h.handleAdminCreateInboxMessage)
		g.GET("/:id", h.handleAdminGetInboxMessage)
		g.PUT("/:id", h.handleAdminUpdateInboxMessage)
		g.DELETE("/:id", h.handleAdminDeleteInboxMessage)
	}
}

// GET /admin/inbox-messages
func (h *Handlers) handleAdminListInboxMessages(c *gin.Context) {
	page, pageSize := parsePageParams(c)
	filter := c.DefaultQuery("filter", inbox.FilterAll)
	if !inbox.IsValidFilter(filter) {
		filter = inbox.FilterAll
	}
	userID := strings.TrimSpace(c.Query("userId"))
	title := strings.TrimSpace(c.Query("title"))
	content := strings.TrimSpace(c.Query("content"))

	q := h.db.Model(&notify.InternalNotification{})
	if userID != "" {
		q = q.Where("user_id = ?", userID)
	}
	switch filter {
	case inbox.FilterUnread:
		q = q.Where("`read` = ?", false)
	case inbox.FilterRead:
		q = q.Where("`read` = ?", true)
	}
	if title != "" {
		q = q.Where("title LIKE ?", "%"+title+"%")
	}
	if content != "" {
		q = q.Where("content LIKE ?", "%"+content+"%")
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}

	var rows []notify.InternalNotification
	offset := (page - 1) * pageSize
	if err := q.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&rows).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}

	userNames := loadInboxUserLabels(h.db, rows)
	list := make([]adminInboxMessageRow, 0, len(rows))
	for _, row := range rows {
		label := userNames[row.UserID]
		list = append(list, adminInboxMessageRow{
			ID:          row.ID,
			UserID:      row.UserID,
			UserName:    label.Name,
			UserEmail:   label.Email,
			Title:       row.Title,
			Content:     row.Content,
			ActionURL:   row.ActionURL,
			ActionLabel: row.ActionLabel,
			Read:        row.Read,
			CreatedAt:   row.CreatedAt,
			UpdatedAt:   row.UpdatedAt,
		})
	}

	response.SuccessI18n(c, "common.ok", gin.H{
		"list":     list,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// POST /admin/inbox-messages
func (h *Handlers) handleAdminCreateInboxMessage(c *gin.Context) {
	var req inboxMessageCreateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	userID := parseQueryUintID(req.UserID)
	if userID == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	user, err := models.GetUserByUID(h.db, userID)
	if err != nil {
		response.FailI18n(c, "auth.user_not_found", err)
		return
	}

	store := inbox.NewGormStore(h.db)
	if err := store.Create(inbox.Message{
		UserID:      strconv.FormatUint(uint64(user.ID), 10),
		Title:       strings.TrimSpace(req.Title),
		Content:     req.Content,
		ActionURL:   strings.TrimSpace(req.ActionURL),
		ActionLabel: strings.TrimSpace(req.ActionLabel),
		Read:        false,
	}); err != nil {
		response.FailI18n(c, "feedback.send_inbox_failed", err)
		return
	}

	response.SuccessI18n(c, "common.sent", nil)
}

// GET /admin/inbox-messages/:id
func (h *Handlers) handleAdminGetInboxMessage(c *gin.Context) {
	row, ok := h.findInboxMessage(c)
	if !ok {
		return
	}
	response.SuccessI18n(c, "common.ok", toAdminInboxRow(h.db, row))
}

// PUT /admin/inbox-messages/:id
func (h *Handlers) handleAdminUpdateInboxMessage(c *gin.Context) {
	row, ok := h.findInboxMessage(c)
	if !ok {
		return
	}
	var req inboxMessageUpdateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}

	updates := map[string]any{}
	if strings.TrimSpace(req.Title) != "" {
		updates["title"] = strings.TrimSpace(req.Title)
	}
	if req.Content != "" {
		updates["content"] = req.Content
	}
	updates["action_url"] = strings.TrimSpace(req.ActionURL)
	updates["action_label"] = strings.TrimSpace(req.ActionLabel)
	if req.Read != nil {
		updates["read"] = *req.Read
	}
	if len(updates) == 0 {
		response.FailI18n(c, "common.no_updatable_fields", nil)
		return
	}
	if err := h.db.Model(&notify.InternalNotification{}).Where("id = ?", row.ID).Updates(updates).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	var updated notify.InternalNotification
	if err := h.db.First(&updated, row.ID).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.updated", toAdminInboxRow(h.db, &updated))
}

// DELETE /admin/inbox-messages/:id
func (h *Handlers) handleAdminDeleteInboxMessage(c *gin.Context) {
	row, ok := h.findInboxMessage(c)
	if !ok {
		return
	}
	if err := h.db.Delete(&notify.InternalNotification{}, row.ID).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.deleted", nil)
}

func (h *Handlers) findInboxMessage(c *gin.Context) (*notify.InternalNotification, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "wordbook.invalid_id", err)
		return nil, false
	}
	var row notify.InternalNotification
	if err := h.db.First(&row, id).Error; err != nil {
		response.FailI18n(c, "notification.not_found", err)
		return nil, false
	}
	return &row, true
}

type inboxUserLabel struct {
	Name   string
	Email  string
	Avatar string
}

func loadInboxUserLabels(db *gorm.DB, rows []notify.InternalNotification) map[string]inboxUserLabel {
	out := map[string]inboxUserLabel{}
	if len(rows) == 0 {
		return out
	}
	seen := map[uint]struct{}{}
	ids := make([]uint, 0, len(rows))
	for _, row := range rows {
		uid, err := strconv.ParseUint(row.UserID, 10, 64)
		if err != nil || uid == 0 {
			continue
		}
		id := uint(uid)
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
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
		out[strconv.FormatUint(uint64(u.ID), 10)] = inboxUserLabel{
			Name:   name,
			Email:  u.Username,
			Avatar: u.Avatar,
		}
	}
	return out
}

func toAdminInboxRow(db *gorm.DB, row *notify.InternalNotification) adminInboxMessageRow {
	labels := loadInboxUserLabels(db, []notify.InternalNotification{*row})
	label := labels[row.UserID]
	return adminInboxMessageRow{
		ID:          row.ID,
		UserID:      row.UserID,
		UserName:    label.Name,
		UserEmail:   label.Email,
		Title:       row.Title,
		Content:     row.Content,
		ActionURL:   row.ActionURL,
		ActionLabel: row.ActionLabel,
		Read:        row.Read,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
	}
}
