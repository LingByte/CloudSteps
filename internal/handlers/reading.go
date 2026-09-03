package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/llm"
	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/ling-base/apidocs/humax"
	lbconstants "github.com/LingByte/ling-base/common/constants"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type readingOption struct {
	Key  string `json:"key"`
	Text string `json:"text"`
}

type readingAnswerItem struct {
	QuestionID  uint   `json:"questionId"`
	Answer      string `json:"answer"`
	Correct     bool   `json:"correct"`
	RightAnswer string `json:"rightAnswer,omitempty"`
	Stem        string `json:"stem,omitempty"`
	Explanation string `json:"explanation,omitempty"`
}

func (h *Handlers) registerReadingRoutes(r *humax.Group) {
	rg := r.Group("reading")
	{
		user := rg.Group("")
		user.Use(auth.Required)
		user.GET("/passages", h.handleReadingListPassages)
		user.GET("/passages/:id", h.handleReadingGetPassage)
		user.GET("/passages/:id/knowledge", h.handleReadingGetKnowledge)
		user.POST("/passages/:id/check", h.handleReadingCheckAnswer)
		user.POST("/passages/:id/submit", h.handleReadingSubmit)
		user.GET("/records", h.handleReadingListRecords)
		user.GET("/records/:id", h.handleReadingGetRecord)

		admin := rg.Group("admin")
		admin.Use(auth.Required, auth.AdminRequired)
		admin.POST("/passages", h.handleAdminCreatePassage)
		admin.PUT("/passages/:id", h.handleAdminUpdatePassage)
		admin.DELETE("/passages/:id", h.handleAdminDeletePassage)
		admin.POST("/passages/:id/questions", h.handleAdminUpsertQuestions)
		admin.GET("/passages", h.handleAdminListPassages)
		admin.GET("/passages/:id", h.handleAdminGetPassage)
	}

	h.registerUserReadingRoutes(rg)
	h.registerReadingAdminRecordRoutes(rg)
}

func countEnglishWords(s string) int {
	n := 0
	inWord := false
	for _, r := range s {
		if unicode.IsLetter(r) {
			if !inWord {
				n++
				inWord = true
			}
		} else {
			inWord = false
		}
	}
	return n
}

func parseReadingOptions(raw string) []readingOption {
	var opts []readingOption
	_ = json.Unmarshal([]byte(raw), &opts)
	return opts
}

// GET /reading/passages
func (h *Handlers) handleReadingListPassages(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)

	level := strings.TrimSpace(c.Query("level"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := db.Model(&models.ReadingPassage{}).
		Where("status = ?", models.ReadingStatusPublished)
	if level != "" {
		q = q.Where("level = ?", level)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}

	var list []models.ReadingPassage
	if err := q.Order("sort_order ASC, id ASC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&list).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}

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
		db.Model(&models.ReadingQuestion{}).
			Select("passage_id as passage_id, count(*) as cnt").
			Where("passage_id IN ?", ids).
			Group("passage_id").
			Scan(&rows)
		for _, r := range rows {
			countMap[r.PassageID] = r.Cnt
		}
	}

	latestMap := map[uint]models.ReadingRecord{}
	if user != nil && len(ids) > 0 {
		var records []models.ReadingRecord
		db.Where("user_id = ? AND passage_id IN ? AND is_latest = ?",
			user.ID, ids, true).
			Find(&records)
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
		}
		if rec, ok := latestMap[p.ID]; ok {
			item["lastScore"] = rec.Score
			item["lastCorrectCount"] = rec.CorrectCount
			item["lastQuestionCount"] = rec.QuestionCount
			item["lastCompletedAt"] = rec.CompletedAt
		}
		items = append(items, item)
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"list":     items,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// GET /reading/passages/:id — 做题视图，不含正确答案
func (h *Handlers) handleReadingGetPassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "reading.invalid_id", nil)
		return
	}

	var passage models.ReadingPassage
	if err := db.Where("id = ? AND status = ?",
		id, models.ReadingStatusPublished).
		First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found_or_unpublished", nil)
		return
	}

	var questions []models.ReadingQuestion
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
		"questions":        qs,
	})
}

// GET /reading/passages/:id/knowledge — AI 知识点（无则生成入库，有则直接返回；空数组表示无要点）。
func (h *Handlers) handleReadingGetKnowledge(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "reading.invalid_id", nil)
		return
	}
	var passage models.ReadingPassage
	if err := db.Where("id = ? AND status = ?", id, models.ReadingStatusPublished).
		First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found_or_unpublished", nil)
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
	points, err := models.EnsureReadingPassageKnowledge(ctx, db, passage.ID, chat)
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

// POST /reading/passages/:id/check — reveal correctness for one question after the user answers.
func (h *Handlers) handleReadingCheckAnswer(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
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

	var passage models.ReadingPassage
	if err := db.Where("id = ? AND status = ?", id, models.ReadingStatusPublished).
		First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found_or_unpublished", nil)
		return
	}

	var q models.ReadingQuestion
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

// POST /reading/passages/:id/submit
func (h *Handlers) handleReadingSubmit(c *gin.Context) {
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
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	if len(body.Answers) == 0 {
		response.FailI18n(c, "msg.9be807ce", nil)
		return
	}

	var passage models.ReadingPassage
	if err := db.Where("id = ? AND status = ?",
		id, models.ReadingStatusPublished).
		First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found_or_unpublished", nil)
		return
	}

	var questions []models.ReadingQuestion
	db.Where("passage_id = ?", passage.ID).
		Order("sort_order ASC, id ASC").
		Find(&questions)
	if len(questions) == 0 {
		response.FailI18n(c, "reading.no_questions", nil)
		return
	}

	qMap := make(map[uint]models.ReadingQuestion, len(questions))
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
	var record models.ReadingRecord

	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.ReadingRecord{}).
			Where("user_id = ? AND passage_id = ? AND is_latest = ?", user.ID, passage.ID, true).
			Update("is_latest", false).Error; err != nil {
			return err
		}
		record = models.ReadingRecord{
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
		"details":       details,
	})
}

// GET /reading/records
func (h *Handlers) handleReadingListRecords(c *gin.Context) {
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

	q := db.Model(&models.ReadingRecord{}).
		Where("user_id = ?", user.ID)

	var total int64
	q.Count(&total)

	var records []models.ReadingRecord
	q.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&records)

	passageIDs := make([]uint, 0, len(records))
	for _, r := range records {
		passageIDs = append(passageIDs, r.PassageID)
	}
	titleMap := map[uint]string{}
	levelMap := map[uint]string{}
	if len(passageIDs) > 0 {
		var passages []models.ReadingPassage
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
		})
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"list":     list,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// GET /reading/records/:id
func (h *Handlers) handleReadingGetRecord(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "common.invalid_record_id", nil)
		return
	}

	var record models.ReadingRecord
	if err := db.Where("id = ? AND user_id = ?",
		id, user.ID).First(&record).Error; err != nil {
		response.FailI18n(c, "common.record_not_found", nil)
		return
	}

	var passage models.ReadingPassage
	db.Select("id, title, level, content").First(&passage, record.PassageID)

	var details []readingAnswerItem
	_ = json.Unmarshal([]byte(record.Answers), &details)

	response.SuccessI18n(c, "common.success", gin.H{
		"id":            record.ID,
		"passageId":     record.PassageID,
		"title":         passage.Title,
		"level":         passage.Level,
		"content":       passage.Content,
		"questionCount": record.QuestionCount,
		"correctCount":  record.CorrectCount,
		"score":         record.Score,
		"durationSec":   record.DurationSec,
		"completedAt":   record.CompletedAt,
		"details":       details,
	})
}

// ---------- admin ----------

func (h *Handlers) handleAdminListPassages(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := db.Model(&models.ReadingPassage{})
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
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
	var list []models.ReadingPassage
	q.Order("sort_order ASC, id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&list)

	response.SuccessI18n(c, "common.success", gin.H{"list": list, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Handlers) handleAdminGetPassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var passage models.ReadingPassage
	if err := db.Where("id = ?", id).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}
	var questions []models.ReadingQuestion
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
	response.SuccessI18n(c, "common.success", gin.H{"passage": passage, "questions": qs})
}

func (h *Handlers) handleAdminCreatePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)

	var body struct {
		Title            string `json:"title" binding:"required"`
		Level            string `json:"level"`
		Content          string `json:"content" binding:"required"`
		Summary          string `json:"summary"`
		Status           string `json:"status"`
		EstimatedMinutes int    `json:"estimatedMinutes"`
		SortOrder        int    `json:"sortOrder"`
		Questions        []struct {
			Stem        string          `json:"stem" binding:"required"`
			Options     []readingOption `json:"options" binding:"required"`
			Answer      string          `json:"answer" binding:"required"`
			Explanation string          `json:"explanation"`
			SortOrder   int             `json:"sortOrder"`
		} `json:"questions"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	status := body.Status
	if status == "" {
		status = models.ReadingStatusPublished
	}
	level := body.Level
	if level == "" {
		level = "初阶"
	}
	minutes := body.EstimatedMinutes
	if minutes <= 0 {
		minutes = 5
	}

	operator := ""
	if user != nil {
		operator = user.Username
	}

	var passage models.ReadingPassage
	err := db.Transaction(func(tx *gorm.DB) error {
		passage = models.ReadingPassage{
			Title:            strings.TrimSpace(body.Title),
			Level:            level,
			Content:          body.Content,
			Summary:          body.Summary,
			Status:           status,
			WordCount:        countEnglishWords(body.Content),
			EstimatedMinutes: minutes,
			SortOrder:        body.SortOrder,
		}
		passage.SetCreateInfo(operator)
		if err := tx.Create(&passage).Error; err != nil {
			return err
		}
		for i, q := range body.Questions {
			opts, _ := json.Marshal(q.Options)
			sort := q.SortOrder
			if sort == 0 {
				sort = i + 1
			}
			qq := models.ReadingQuestion{
				PassageID:   passage.ID,
				Stem:        q.Stem,
				Options:     string(opts),
				Answer:      strings.ToUpper(strings.TrimSpace(q.Answer)),
				Explanation: q.Explanation,
				SortOrder:   sort,
			}
			qq.SetCreateInfo(operator)
			if err := tx.Create(&qq).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.created", gin.H{"id": passage.ID})
}

func (h *Handlers) handleAdminUpdatePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var passage models.ReadingPassage
	if err := db.Where("id = ?", id).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	var body struct {
		Title            *string `json:"title"`
		Level            *string `json:"level"`
		Content          *string `json:"content"`
		Summary          *string `json:"summary"`
		Status           *string `json:"status"`
		EstimatedMinutes *int    `json:"estimatedMinutes"`
		SortOrder        *int    `json:"sortOrder"`
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
	if body.Status != nil {
		passage.Status = *body.Status
	}
	if body.EstimatedMinutes != nil {
		passage.EstimatedMinutes = *body.EstimatedMinutes
	}
	if body.SortOrder != nil {
		passage.SortOrder = *body.SortOrder
	}
	if user != nil {
		passage.SetUpdateInfo(user.Username)
	}
	if err := db.Save(&passage).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.updated", passage)
}

func (h *Handlers) handleAdminDeletePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var passage models.ReadingPassage
	if err := db.Where("id = ?", id).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}
	op := ""
	if user != nil {
		op = user.Username
	}
	passage.SoftDelete(op)
	if err := db.Save(&passage).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	if err := db.Unscoped().Where("passage_id = ?", passage.ID).Delete(&models.ReadingQuestion{}).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.deleted", nil)
}

func (h *Handlers) handleAdminUpsertQuestions(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var passage models.ReadingPassage
	if err := db.Where("id = ?", id).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	var body struct {
		Replace   bool `json:"replace"`
		Questions []struct {
			Stem        string          `json:"stem" binding:"required"`
			Options     []readingOption `json:"options" binding:"required"`
			Answer      string          `json:"answer" binding:"required"`
			Explanation string          `json:"explanation"`
			SortOrder   int             `json:"sortOrder"`
		} `json:"questions" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	op := ""
	if user != nil {
		op = user.Username
	}

	err := db.Transaction(func(tx *gorm.DB) error {
		if body.Replace {
			if err := tx.Unscoped().Where("passage_id = ?", passage.ID).Delete(&models.ReadingQuestion{}).Error; err != nil {
				return err
			}
		}
		if err := models.ClearReadingPassageKnowledge(tx, passage.ID); err != nil {
			return err
		}
		for i, q := range body.Questions {
			opts, _ := json.Marshal(q.Options)
			sort := q.SortOrder
			if sort == 0 {
				sort = i + 1
			}
			qq := models.ReadingQuestion{
				PassageID:   passage.ID,
				Stem:        q.Stem,
				Options:     string(opts),
				Answer:      strings.ToUpper(strings.TrimSpace(q.Answer)),
				Explanation: q.Explanation,
				SortOrder:   sort,
			}
			qq.SetCreateInfo(op)
			if err := tx.Create(&qq).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		response.FailI18n(c, "reading.save_question_failed", err)
		return
	}
	response.SuccessI18n(c, "common.saved", nil)
}
