package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/llm"
	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/ling-base/apidocs/humax"
	lbconstants "github.com/LingByte/ling-base/common/constants"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (h *Handlers) registerUserReadingRoutes(rg *humax.Group) {
	custom := rg.Group("custom")
	custom.Use(auth.Required)
	{
		custom.GET("/passages", h.handleUserReadingListPassages)
		custom.POST("/passages", h.handleUserReadingCreatePassage)
		custom.POST("/passages/import", h.handleUserReadingImportPassages)
		custom.POST("/passages/import-text", h.handleUserReadingImportText)
		custom.GET("/passages/:id", h.handleUserReadingGetPassage)
		custom.GET("/passages/:id/knowledge", h.handleUserReadingGetKnowledge)
		custom.POST("/passages/:id/check", h.handleUserReadingCheckAnswer)
		custom.PUT("/passages/:id", h.handleUserReadingUpdatePassage)
		custom.DELETE("/passages/:id", h.handleUserReadingDeletePassage)
		custom.POST("/passages/:id/submit", h.handleUserReadingSubmit)
		custom.GET("/records", h.handleUserReadingListRecords)
	}

	adminCustom := rg.Group("admin/custom")
	adminCustom.Use(auth.Required, auth.AdminRequired)
	{
		adminCustom.GET("/passages", h.handleAdminUserReadingListPassages)
		adminCustom.GET("/passages/:id", h.handleAdminUserReadingGetPassage)
		adminCustom.DELETE("/passages/:id", h.handleAdminUserReadingDeletePassage)
	}
}

func userReadingPassageListItem(db *gorm.DB, userID uint, list []models.UserReadingPassage) []gin.H {
	ids := make([]uint, 0, len(list))
	for _, p := range list {
		ids = append(ids, p.ID)
	}

	type qCount struct {
		PassageID uint
		Cnt       int64
	}
	countMap := map[uint]int64{}
	if len(ids) > 0 {
		var rows []qCount
		db.Model(&models.UserReadingQuestion{}).
			Select("passage_id as passage_id, count(*) as cnt").
			Where("passage_id IN ?", ids).
			Group("passage_id").
			Scan(&rows)
		for _, r := range rows {
			countMap[r.PassageID] = r.Cnt
		}
	}

	latestMap := map[uint]models.UserReadingRecord{}
	if len(ids) > 0 {
		var records []models.UserReadingRecord
		db.Where("user_id = ? AND passage_id IN ? AND is_latest = ?",
			userID, ids, true).Find(&records)
		for _, rec := range records {
			latestMap[rec.PassageID] = rec
		}
	}

	items := make([]gin.H, 0, len(list))
	for _, p := range list {
		item := gin.H{
			"id":               p.ID,
			"title":            p.Title,
			"level":            p.Level,
			"summary":          p.Summary,
			"wordCount":        p.WordCount,
			"estimatedMinutes": p.EstimatedMinutes,
			"questionCount":    countMap[p.ID],
			"sortOrder":        p.SortOrder,
			"source":           p.Source,
			"status":           p.Status,
			"isCustom":         true,
		}
		if rec, ok := latestMap[p.ID]; ok {
			item["lastScore"] = rec.Score
			item["lastCorrectCount"] = rec.CorrectCount
			item["lastQuestionCount"] = rec.QuestionCount
			item["lastCompletedAt"] = rec.CompletedAt
		}
		items = append(items, item)
	}
	return items
}

func createUserReadingPassageTx(tx *gorm.DB, userID uint, operator string, in models.ParsedUserReadingPassage, source string) (models.UserReadingPassage, error) {
	minutes := in.EstimatedMinutes
	if minutes <= 0 {
		minutes = 5
	}
	level := in.Level
	if level == "" {
		level = "初阶"
	}
	passage := models.UserReadingPassage{
		UserID:           userID,
		Title:            strings.TrimSpace(in.Title),
		Level:            level,
		Content:          in.Content,
		Summary:          in.Summary,
		Status:           models.UserReadingStatusActive,
		Source:           source,
		WordCount:        countEnglishWords(in.Content),
		EstimatedMinutes: minutes,
	}
	passage.SetCreateInfo(operator)
	if err := tx.Create(&passage).Error; err != nil {
		return passage, err
	}
	for i, q := range in.Questions {
		opts, err := json.Marshal(q.Options)
		if err != nil {
			return passage, err
		}
		sort := q.SortOrder
		if sort == 0 {
			sort = i + 1
		}
		qq := models.UserReadingQuestion{
			PassageID:   passage.ID,
			Stem:        q.Stem,
			Options:     string(opts),
			Answer:      strings.ToUpper(strings.TrimSpace(q.Answer)),
			Explanation: q.Explanation,
			SortOrder:   sort,
		}
		qq.SetCreateInfo(operator)
		if err := tx.Create(&qq).Error; err != nil {
			return passage, err
		}
	}
	return passage, nil
}

// GET /reading/custom/passages
func (h *Handlers) handleUserReadingListPassages(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	level := strings.TrimSpace(c.Query("level"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := db.Model(&models.UserReadingPassage{}).
		Where("user_id = ? AND status = ?", user.ID, models.UserReadingStatusActive)
	if level != "" {
		q = q.Where("level = ?", level)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}

	var list []models.UserReadingPassage
	if err := q.Order("sort_order ASC, id DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&list).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"list":     userReadingPassageListItem(db, user.ID, list),
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// POST /reading/custom/passages
func (h *Handlers) handleUserReadingCreatePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	var body struct {
		Title            string `json:"title" binding:"required"`
		Level            string `json:"level"`
		Content          string `json:"content" binding:"required"`
		Summary          string `json:"summary"`
		EstimatedMinutes int    `json:"estimatedMinutes"`
		Questions        []struct {
			Stem        string          `json:"stem" binding:"required"`
			Options     []readingOption `json:"options" binding:"required"`
			Answer      string          `json:"answer" binding:"required"`
			Explanation string          `json:"explanation"`
			SortOrder   int             `json:"sortOrder"`
		} `json:"questions" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Questions) == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	parsed := models.ParsedUserReadingPassage{
		Title:            body.Title,
		Level:            body.Level,
		Summary:          body.Summary,
		Content:          body.Content,
		EstimatedMinutes: body.EstimatedMinutes,
	}
	for i, q := range body.Questions {
		opts := make([]map[string]string, 0, len(q.Options))
		for _, o := range q.Options {
			opts = append(opts, map[string]string{"key": o.Key, "text": o.Text})
		}
		sort := q.SortOrder
		if sort == 0 {
			sort = i + 1
		}
		parsed.Questions = append(parsed.Questions, models.ParsedUserReadingQuestion{
			Stem:        q.Stem,
			Options:     opts,
			Answer:      q.Answer,
			Explanation: q.Explanation,
			SortOrder:   sort,
		})
	}

	var passage models.UserReadingPassage
	err := db.Transaction(func(tx *gorm.DB) error {
		var err error
		passage, err = createUserReadingPassageTx(tx, user.ID, user.Username, parsed, models.UserReadingSourceManual)
		return err
	})
	if err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.created", gin.H{"id": passage.ID})
}

// POST /reading/custom/passages/import
func (h *Handlers) handleUserReadingImportPassages(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	var body struct {
		Source   string `json:"source"`
		Passages []struct {
			Title            string `json:"title" binding:"required"`
			Level            string `json:"level"`
			Summary          string `json:"summary"`
			Content          string `json:"content" binding:"required"`
			EstimatedMinutes int    `json:"estimatedMinutes"`
			Questions        []struct {
				Stem        string          `json:"stem" binding:"required"`
				Options     []readingOption `json:"options" binding:"required"`
				Answer      string          `json:"answer" binding:"required"`
				Explanation string          `json:"explanation"`
				SortOrder   int             `json:"sortOrder"`
			} `json:"questions" binding:"required"`
		} `json:"passages" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Passages) == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	if len(body.Passages) > 20 {
		response.FailI18n(c, "reading.import_too_many", nil)
		return
	}

	source := body.Source
	if source == "" {
		source = models.UserReadingSourceExcel
	}

	ids := make([]uint, 0, len(body.Passages))
	err := db.Transaction(func(tx *gorm.DB) error {
		for _, p := range body.Passages {
			parsed := models.ParsedUserReadingPassage{
				Title:            p.Title,
				Level:            p.Level,
				Summary:          p.Summary,
				Content:          p.Content,
				EstimatedMinutes: p.EstimatedMinutes,
			}
			for i, q := range p.Questions {
				opts := make([]map[string]string, 0, len(q.Options))
				for _, o := range q.Options {
					opts = append(opts, map[string]string{"key": o.Key, "text": o.Text})
				}
				sort := q.SortOrder
				if sort == 0 {
					sort = i + 1
				}
				parsed.Questions = append(parsed.Questions, models.ParsedUserReadingQuestion{
					Stem: q.Stem, Options: opts, Answer: q.Answer,
					Explanation: q.Explanation, SortOrder: sort,
				})
			}
			passage, err := createUserReadingPassageTx(tx, user.ID, user.Username, parsed, source)
			if err != nil {
				return err
			}
			ids = append(ids, passage.ID)
		}
		return nil
	})
	if err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.created", gin.H{"ids": ids, "count": len(ids)})
}

// POST /reading/custom/passages/import-text
func (h *Handlers) handleUserReadingImportText(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	var body struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	parsedList, err := models.ParseUserReadingText(body.Text)
	if err != nil {
		response.FailI18n(c, "reading.import_parse_failed", err)
		return
	}
	if len(parsedList) > 20 {
		response.FailI18n(c, "reading.import_too_many", nil)
		return
	}

	ids := make([]uint, 0, len(parsedList))
	err = db.Transaction(func(tx *gorm.DB) error {
		for _, p := range parsedList {
			passage, err := createUserReadingPassageTx(tx, user.ID, user.Username, p, models.UserReadingSourceText)
			if err != nil {
				return err
			}
			ids = append(ids, passage.ID)
		}
		return nil
	})
	if err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.created", gin.H{"ids": ids, "count": len(ids)})
}

// GET /reading/custom/passages/:id
func (h *Handlers) handleUserReadingGetPassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "reading.invalid_id", nil)
		return
	}

	var passage models.UserReadingPassage
	if err := db.Where("id = ? AND user_id = ? AND status = ?",
		id, user.ID, models.UserReadingStatusActive).
		First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	var questions []models.UserReadingQuestion
	db.Where("passage_id = ?", passage.ID).
		Order("sort_order ASC, id ASC").
		Find(&questions)

	qs := make([]gin.H, 0, len(questions))
	for _, q := range questions {
		qs = append(qs, gin.H{
			"id":        q.ID,
			"stem":      q.Stem,
			"options":   parseReadingOptions(q.Options),
			"sortOrder": q.SortOrder,
		})
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"id":               passage.ID,
		"title":            passage.Title,
		"level":            passage.Level,
		"content":          passage.Content,
		"summary":          passage.Summary,
		"wordCount":        passage.WordCount,
		"estimatedMinutes": passage.EstimatedMinutes,
		"isCustom":         true,
		"questions":        qs,
	})
}

// GET /reading/custom/passages/:id/knowledge — AI 知识点（无则生成入库，有则直接返回）。
func (h *Handlers) handleUserReadingGetKnowledge(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "reading.invalid_id", nil)
		return
	}
	var passage models.UserReadingPassage
	if err := db.Where("id = ? AND user_id = ? AND status = ?", id, user.ID, models.UserReadingStatusActive).
		First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	cfg := llm.FromGlobal()
	chat := models.KnowledgeChatFunc(nil)
	if cfg.Enabled() {
		chat = cfg.Chat
	} else if !models.KnowledgeJSONReady(passage.KnowledgeJSON) {
		response.FailI18n(c, "reading.knowledge_llm_unavailable", nil)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()
	points, err := models.EnsureUserReadingPassageKnowledge(ctx, db, passage.ID, user.ID, chat)
	if err != nil {
		if errors.Is(err, llm.ErrNotConfigured) || errors.Is(err, models.ErrKnowledgeChatRequired) {
			response.FailI18n(c, "reading.knowledge_llm_unavailable", nil)
			return
		}
		response.FailI18n(c, "reading.knowledge_generate_failed", err.Error())
		return
	}
	response.SuccessI18n(c, "common.success", gin.H{"items": points})
}

// POST /reading/custom/passages/:id/check
func (h *Handlers) handleUserReadingCheckAnswer(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "reading.invalid_id", nil)
		return
	}
	var body struct {
		QuestionID uint   `json:"questionId"`
		Answer     string `json:"answer"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.QuestionID == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	var passage models.UserReadingPassage
	if err := db.Where("id = ? AND user_id = ? AND status = ?",
		id, user.ID, models.UserReadingStatusActive).
		First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	var q models.UserReadingQuestion
	if err := db.Where("id = ? AND passage_id = ?", body.QuestionID, passage.ID).
		First(&q).Error; err != nil {
		response.FailI18n(c, "reading.no_questions", nil)
		return
	}

	userAns := strings.TrimSpace(strings.ToUpper(body.Answer))
	right := strings.TrimSpace(strings.ToUpper(q.Answer))
	response.SuccessI18n(c, "common.success", gin.H{
		"questionId":  q.ID,
		"answer":      userAns,
		"correct":     userAns != "" && userAns == right,
		"rightAnswer": right,
		"explanation": q.Explanation,
		"stem":        q.Stem,
	})
}

// PUT /reading/custom/passages/:id
func (h *Handlers) handleUserReadingUpdatePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var passage models.UserReadingPassage
	if err := db.Where("id = ? AND user_id = ?", id, user.ID).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	var body struct {
		Title            *string `json:"title"`
		Level            *string `json:"level"`
		Content          *string `json:"content"`
		Summary          *string `json:"summary"`
		EstimatedMinutes *int    `json:"estimatedMinutes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	if body.Title != nil {
		passage.Title = strings.TrimSpace(*body.Title)
	}
	if body.Level != nil {
		passage.Level = *body.Level
	}
	if body.Content != nil {
		passage.Content = *body.Content
		passage.WordCount = countEnglishWords(*body.Content)
		passage.KnowledgeJSON = ""
	}
	if body.Summary != nil {
		passage.Summary = *body.Summary
	}
	if body.EstimatedMinutes != nil {
		passage.EstimatedMinutes = *body.EstimatedMinutes
	}
	passage.SetUpdateInfo(user.Username)
	if err := db.Save(&passage).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.updated", passage)
}

// DELETE /reading/custom/passages/:id
func (h *Handlers) handleUserReadingDeletePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var passage models.UserReadingPassage
	if err := db.Where("id = ? AND user_id = ?", id, user.ID).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	passage.Status = models.UserReadingStatusArchived
	passage.SoftDelete(user.Username)
	if err := db.Save(&passage).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.deleted", nil)
}

// POST /reading/custom/passages/:id/submit
func (h *Handlers) handleUserReadingSubmit(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "reading.invalid_id", nil)
		return
	}

	var body struct {
		Answers []struct {
			QuestionID uint   `json:"questionId"`
			Answer     string `json:"answer"`
		} `json:"answers" binding:"required"`
		DurationSec int `json:"durationSec"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Answers) == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	var passage models.UserReadingPassage
	if err := db.Where("id = ? AND user_id = ? AND status = ?",
		id, user.ID, models.UserReadingStatusActive).
		First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	var questions []models.UserReadingQuestion
	db.Where("passage_id = ?", passage.ID).
		Order("sort_order ASC, id ASC").
		Find(&questions)
	if len(questions) == 0 {
		response.FailI18n(c, "reading.no_questions", nil)
		return
	}

	qMap := make(map[uint]models.UserReadingQuestion, len(questions))
	for _, q := range questions {
		qMap[q.ID] = q
	}
	answerMap := make(map[uint]string, len(body.Answers))
	for _, a := range body.Answers {
		answerMap[a.QuestionID] = strings.TrimSpace(strings.ToUpper(a.Answer))
	}

	details := make([]readingAnswerItem, 0, len(questions))
	correctCount := 0
	for _, q := range questions {
		userAns := answerMap[q.ID]
		right := strings.TrimSpace(strings.ToUpper(q.Answer))
		ok := userAns != "" && userAns == right
		if ok {
			correctCount++
		}
		details = append(details, readingAnswerItem{
			QuestionID:  q.ID,
			Answer:      userAns,
			Correct:     ok,
			RightAnswer: right,
			Stem:        q.Stem,
			Explanation: q.Explanation,
		})
	}

	total := len(questions)
	score := 0
	if total > 0 {
		score = correctCount * 100 / total
	}

	answersJSON, _ := json.Marshal(details)
	now := time.Now()
	var record models.UserReadingRecord

	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.UserReadingRecord{}).
			Where("user_id = ? AND passage_id = ? AND is_latest = ?", user.ID, passage.ID, true).
			Update("is_latest", false).Error; err != nil {
			return err
		}
		record = models.UserReadingRecord{
			UserID:        user.ID,
			PassageID:     passage.ID,
			Answers:       string(answersJSON),
			QuestionCount: total,
			CorrectCount:  correctCount,
			Score:         score,
			DurationSec:   body.DurationSec,
			IsLatest:      true,
			CompletedAt:   &now,
		}
		return tx.Create(&record).Error
	})
	if err != nil {
		response.FailI18n(c, "reading.save_record_failed", err)
		return
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"recordId":      record.ID,
		"passageId":     passage.ID,
		"title":         passage.Title,
		"level":         passage.Level,
		"questionCount": total,
		"correctCount":  correctCount,
		"score":         score,
		"durationSec":   body.DurationSec,
		"completedAt":   now,
		"isCustom":      true,
		"details":       details,
	})
}

// GET /reading/custom/records
func (h *Handlers) handleUserReadingListRecords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := db.Model(&models.UserReadingRecord{}).Where("user_id = ?", user.ID)
	var total int64
	q.Count(&total)

	var records []models.UserReadingRecord
	q.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&records)

	passageIDs := make([]uint, 0, len(records))
	for _, r := range records {
		passageIDs = append(passageIDs, r.PassageID)
	}
	titleMap := map[uint]string{}
	levelMap := map[uint]string{}
	if len(passageIDs) > 0 {
		var passages []models.UserReadingPassage
		db.Select("id, title, level").Where("id IN ?", passageIDs).Find(&passages)
		for _, p := range passages {
			titleMap[p.ID] = p.Title
			levelMap[p.ID] = p.Level
		}
	}

	list := make([]gin.H, 0, len(records))
	for _, r := range records {
		list = append(list, gin.H{
			"id":            r.ID,
			"passageId":     r.PassageID,
			"title":         titleMap[r.PassageID],
			"level":         levelMap[r.PassageID],
			"questionCount": r.QuestionCount,
			"correctCount":  r.CorrectCount,
			"score":         r.Score,
			"durationSec":   r.DurationSec,
			"isLatest":      r.IsLatest,
			"completedAt":   r.CompletedAt,
			"isCustom":      true,
		})
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"list": list, "total": total, "page": page, "pageSize": pageSize,
	})
}

// ---------- admin custom ----------

func (h *Handlers) handleAdminUserReadingListPassages(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := db.Model(&models.UserReadingPassage{}).Where("status = ?", models.UserReadingStatusActive)
	if uid := strings.TrimSpace(c.Query("userId")); uid != "" {
		if id, err := strconv.ParseUint(uid, 10, 64); err == nil && id > 0 {
			q = q.Where("user_id = ?", id)
		}
	}
	if level := strings.TrimSpace(c.Query("level")); level != "" {
		q = q.Where("level = ?", level)
	}
	if kw := strings.TrimSpace(c.Query("keyword")); kw != "" {
		like := "%" + kw + "%"
		q = q.Where("title LIKE ? OR summary LIKE ?", like, like)
	}

	var total int64
	q.Count(&total)

	var list []models.UserReadingPassage
	q.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&list)

	userIDs := make([]uint, 0, len(list))
	for _, p := range list {
		userIDs = append(userIDs, p.UserID)
	}
	userMap := map[uint]models.User{}
	if len(userIDs) > 0 {
		var users []models.User
		db.Select("id, username, email").Where("id IN ?", userIDs).Find(&users)
		for _, u := range users {
			userMap[u.ID] = u
		}
	}

	items := make([]gin.H, 0, len(list))
	for _, p := range list {
		u := userMap[p.UserID]
		items = append(items, gin.H{
			"id":               p.ID,
			"userId":           p.UserID,
			"username":         u.Username,
			"email":            u.Email,
			"title":            p.Title,
			"level":            p.Level,
			"summary":          p.Summary,
			"wordCount":        p.WordCount,
			"estimatedMinutes": p.EstimatedMinutes,
			"source":           p.Source,
			"status":           p.Status,
			"createdAt":        p.CreatedAt,
		})
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"list": items, "total": total, "page": page, "pageSize": pageSize,
	})
}

func (h *Handlers) handleAdminUserReadingGetPassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var passage models.UserReadingPassage
	if err := db.Where("id = ?", id).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	var user models.User
	db.Select("id, username, email").First(&user, passage.UserID)

	var questions []models.UserReadingQuestion
	db.Where("passage_id = ?", passage.ID).
		Order("sort_order ASC, id ASC").Find(&questions)

	qs := make([]gin.H, 0, len(questions))
	for _, q := range questions {
		qs = append(qs, gin.H{
			"id":          q.ID,
			"stem":        q.Stem,
			"options":     parseReadingOptions(q.Options),
			"answer":      q.Answer,
			"explanation": q.Explanation,
			"sortOrder":   q.SortOrder,
		})
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"passage":   passage,
		"user":      gin.H{"id": user.ID, "username": user.Username, "email": user.Email},
		"questions": qs,
	})
}

func (h *Handlers) handleAdminUserReadingDeletePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var passage models.UserReadingPassage
	if err := db.Where("id = ?", id).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	op := ""
	if user != nil {
		op = user.Username
	}
	passage.Status = models.UserReadingStatusArchived
	passage.SoftDelete(op)
	if err := db.Save(&passage).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.deleted", nil)
}
