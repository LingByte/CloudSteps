package handlers

import (
	"encoding/json"

	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/ling-base/apidocs/humax"
	lbconstants "github.com/LingByte/ling-base/common/constants"

	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type clozeOption struct {
	Key  string `json:"key"`
	Text string `json:"text"`
}

type clozeAnswerItem struct {
	BlankID     uint   `json:"blankId"`
	BlankNo     int    `json:"blankNo"`
	Answer      string `json:"answer"`
	Correct     bool   `json:"correct"`
	RightAnswer string `json:"rightAnswer,omitempty"`
	Explanation string `json:"explanation,omitempty"`
}

var clozeBlankRe = regexp.MustCompile(`\{\{(\d+)\}\}`)

func (h *Handlers) registerClozeRoutes(r *humax.Group) {
	rg := r.Group("cloze")
	{
		user := rg.Group("")
		user.Use(auth.Required)
		user.GET("/passages", h.handleClozeListPassages)
		user.GET("/passages/:id", h.handleClozeGetPassage)
		user.GET("/tags", h.handleClozeListTags)
		user.POST("/passages/:id/submit", h.handleClozeSubmit)
		user.GET("/records", h.handleClozeListRecords)
		user.GET("/records/:id", h.handleClozeGetRecord)

		admin := rg.Group("admin")
		admin.Use(auth.Required, auth.AdminRequired)
		admin.GET("/passages", h.handleAdminClozeListPassages)
		admin.GET("/passages/:id", h.handleAdminClozeGetPassage)
		admin.POST("/passages", h.handleAdminClozeCreatePassage)
		admin.PUT("/passages/:id", h.handleAdminClozeUpdatePassage)
		admin.DELETE("/passages/:id", h.handleAdminClozeDeletePassage)
		admin.GET("/records", h.handleAdminClozeListRecords)
		admin.GET("/records/:id", h.handleAdminClozeGetRecord)
	}

	h.registerUserClozeRoutes(rg)
}

func parseClozeOptions(raw string) []clozeOption {
	var opts []clozeOption
	_ = json.Unmarshal([]byte(raw), &opts)
	return opts
}

func countClozeMarkers(content string) int {
	return len(clozeBlankRe.FindAllStringSubmatch(content, -1))
}

// GET /cloze/passages
func (h *Handlers) handleClozeListPassages(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)

	level := strings.TrimSpace(c.Query("level"))
	tag := strings.TrimSpace(c.Query("tag"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit < 1 || limit > 100 {
		limit = 20
	}

	// 游标格式: "sortOrder,id"
	var cursorSO int
	var cursorID uint
	if raw := strings.TrimSpace(c.Query("cursor")); raw != "" {
		parts := strings.SplitN(raw, ",", 2)
		if len(parts) == 2 {
			cursorSO, _ = strconv.Atoi(parts[0])
			if v, err := strconv.ParseUint(parts[1], 10, 64); err == nil {
				cursorID = uint(v)
			}
		}
	}

	q := db.Model(&models.ClozePassage{}).
		Where("status = ?", models.ClozeStatusPublished)
	if level != "" {
		q = q.Where("level = ?", level)
	}
	if tag != "" {
		q = q.Where("tags LIKE ?", "%"+tag+"%")
	}
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("title LIKE ? OR summary LIKE ?", like, like)
	}
	if cursorID > 0 {
		q = q.Where("(sort_order > ? OR (sort_order = ? AND id > ?))", cursorSO, cursorSO, cursorID)
	}

	var list []models.ClozePassage
	if err := q.Order("sort_order ASC, id ASC").
		Limit(limit + 1).
		Find(&list).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}

	hasMore := len(list) > limit
	if hasMore {
		list = list[:limit]
	}

	ids := make([]uint, 0, len(list))
	for _, p := range list {
		ids = append(ids, p.ID)
	}

	latestMap := map[uint]models.ClozeRecord{}
	if user != nil && len(ids) > 0 {
		var records []models.ClozeRecord
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
			"tags":             p.Tags,
			"summary":          p.Summary,
			"blankCount":       p.BlankCount,
			"estimatedMinutes": p.EstimatedMinutes,
			"sortOrder":        p.SortOrder,
		}
		if rec, ok := latestMap[p.ID]; ok {
			item["lastScore"] = rec.Score
			item["lastCorrectCount"] = rec.CorrectCount
			item["lastBlankCount"] = rec.BlankCount
			item["lastCompletedAt"] = rec.CompletedAt
		}
		items = append(items, item)
	}

	var nextCursor string
	if hasMore && len(list) > 0 {
		last := list[len(list)-1]
		nextCursor = strconv.Itoa(last.SortOrder) + "," + strconv.FormatUint(uint64(last.ID), 10)
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"list":       items,
		"nextCursor": nextCursor,
		"hasMore":    hasMore,
		"limit":      limit,
	})
}

// GET /cloze/passages/:id
func (h *Handlers) handleClozeGetPassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "reading.invalid_id", nil)
		return
	}

	var passage models.ClozePassage
	if err := db.Where("id = ? AND status = ?",
		id, models.ClozeStatusPublished).
		First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found_or_unpublished", nil)
		return
	}

	var blanks []models.ClozeBlank
	db.Where("passage_id = ?", passage.ID).
		Order("blank_no ASC, id ASC").
		Find(&blanks)

	bs := make([]gin.H, 0, len(blanks))
	for _, b := range blanks {
		bs = append(bs, gin.H{
			"id":      b.ID,
			"blankNo": b.BlankNo,
			"options": parseClozeOptions(b.Options),
		})
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"id":               passage.ID,
		"title":            passage.Title,
		"level":            passage.Level,
		"content":          passage.Content,
		"summary":          passage.Summary,
		"blankCount":       passage.BlankCount,
		"estimatedMinutes": passage.EstimatedMinutes,
		"blanks":           bs,
	})
}

// POST /cloze/passages/:id/submit
func (h *Handlers) handleClozeSubmit(c *gin.Context) {
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
			BlankID uint   `json:"blankId"`
			Answer  string `json:"answer"`
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

	var passage models.ClozePassage
	if err := db.Where("id = ? AND status = ?",
		id, models.ClozeStatusPublished).
		First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found_or_unpublished", nil)
		return
	}

	var blanks []models.ClozeBlank
	db.Where("passage_id = ?", passage.ID).
		Order("blank_no ASC, id ASC").
		Find(&blanks)
	if len(blanks) == 0 {
		response.FailI18n(c, "reading.no_cloze_questions", nil)
		return
	}

	answerMap := make(map[uint]string, len(body.Answers))
	for _, a := range body.Answers {
		answerMap[a.BlankID] = strings.TrimSpace(strings.ToUpper(a.Answer))
	}

	details := make([]clozeAnswerItem, 0, len(blanks))
	correctCount := 0
	for _, b := range blanks {
		userAns := answerMap[b.ID]
		right := strings.TrimSpace(strings.ToUpper(b.Answer))
		ok := userAns != "" && userAns == right
		if ok {
			correctCount++
		}
		details = append(details, clozeAnswerItem{
			BlankID:     b.ID,
			BlankNo:     b.BlankNo,
			Answer:      userAns,
			Correct:     ok,
			RightAnswer: right,
			Explanation: b.Explanation,
		})
	}

	total := len(blanks)
	score := 0
	if total > 0 {
		score = correctCount * 100 / total
	}

	answersJSON, _ := json.Marshal(details)
	now := time.Now()
	var record models.ClozeRecord

	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.ClozeRecord{}).
			Where("user_id = ? AND passage_id = ? AND is_latest = ?", user.ID, passage.ID, true).
			Update("is_latest", false).Error; err != nil {
			return err
		}
		record = models.ClozeRecord{
			UserID:       user.ID,
			PassageID:    passage.ID,
			Answers:      string(answersJSON),
			BlankCount:   total,
			CorrectCount: correctCount,
			Score:        score,
			DurationSec:  body.DurationSec,
			IsLatest:     true,
			CompletedAt:  &now,
		}
		return tx.Create(&record).Error
	})
	if err != nil {
		response.FailI18n(c, "reading.save_record_failed", err)
		return
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"recordId":     record.ID,
		"passageId":    passage.ID,
		"title":        passage.Title,
		"level":        passage.Level,
		"blankCount":   total,
		"correctCount": correctCount,
		"score":        score,
		"durationSec":  body.DurationSec,
		"completedAt":  now,
		"details":      details,
	})
}

// GET /cloze/records
func (h *Handlers) handleClozeListRecords(c *gin.Context) {
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

	q := db.Model(&models.ClozeRecord{}).
		Where("user_id = ?", user.ID)

	var total int64
	q.Count(&total)

	var records []models.ClozeRecord
	q.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&records)

	passageIDs := make([]uint, 0, len(records))
	for _, r := range records {
		passageIDs = append(passageIDs, r.PassageID)
	}
	titleMap := map[uint]string{}
	levelMap := map[uint]string{}
	if len(passageIDs) > 0 {
		var passages []models.ClozePassage
		db.Select("id, title, level").Where("id IN ?", passageIDs).Find(&passages)
		for _, p := range passages {
			titleMap[p.ID] = p.Title
			levelMap[p.ID] = p.Level
		}
	}

	list := make([]gin.H, 0, len(records))
	for _, r := range records {
		list = append(list, gin.H{
			"id":           r.ID,
			"passageId":    r.PassageID,
			"title":        titleMap[r.PassageID],
			"level":        levelMap[r.PassageID],
			"blankCount":   r.BlankCount,
			"correctCount": r.CorrectCount,
			"score":        r.Score,
			"durationSec":  r.DurationSec,
			"isLatest":     r.IsLatest,
			"completedAt":  r.CompletedAt,
		})
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"list":     list,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// GET /cloze/records/:id
func (h *Handlers) handleClozeGetRecord(c *gin.Context) {
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

	var record models.ClozeRecord
	if err := db.Where("id = ? AND user_id = ?",
		id, user.ID).First(&record).Error; err != nil {
		response.FailI18n(c, "common.record_not_found", nil)
		return
	}

	var passage models.ClozePassage
	db.Select("id, title, level, content").First(&passage, record.PassageID)

	var details []clozeAnswerItem
	_ = json.Unmarshal([]byte(record.Answers), &details)

	response.SuccessI18n(c, "common.success", gin.H{
		"id":           record.ID,
		"passageId":    record.PassageID,
		"title":        passage.Title,
		"level":        passage.Level,
		"content":      passage.Content,
		"blankCount":   record.BlankCount,
		"correctCount": record.CorrectCount,
		"score":        record.Score,
		"durationSec":  record.DurationSec,
		"completedAt":  record.CompletedAt,
		"details":      details,
	})
}

// ---------- admin ----------

func (h *Handlers) handleAdminClozeListPassages(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := db.Model(&models.ClozePassage{})
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if level := strings.TrimSpace(c.Query("level")); level != "" {
		q = q.Where("level = ?", level)
	}
	if tag := strings.TrimSpace(c.Query("tag")); tag != "" {
		q = q.Where("tags LIKE ?", "%"+tag+"%")
	}
	if kw := strings.TrimSpace(c.Query("keyword")); kw != "" {
		like := "%" + kw + "%"
		q = q.Where("title LIKE ? OR summary LIKE ?", like, like)
	}

	var total int64
	q.Count(&total)
	var list []models.ClozePassage
	q.Order("sort_order ASC, id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&list)
	response.SuccessI18n(c, "common.success", gin.H{"list": list, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Handlers) handleAdminClozeGetPassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var passage models.ClozePassage
	if err := db.Where("id = ?", id).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}
	var blanks []models.ClozeBlank
	db.Where("passage_id = ?", passage.ID).
		Order("blank_no ASC, id ASC").Find(&blanks)

	bs := make([]gin.H, 0, len(blanks))
	for _, b := range blanks {
		bs = append(bs, gin.H{
			"id":          b.ID,
			"blankNo":     b.BlankNo,
			"options":     parseClozeOptions(b.Options),
			"answer":      b.Answer,
			"explanation": b.Explanation,
		})
	}
	response.SuccessI18n(c, "common.success", gin.H{"passage": passage, "blanks": bs})
}

func (h *Handlers) handleAdminClozeCreatePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)

	var body struct {
		Title            string `json:"title" binding:"required"`
		Level            string `json:"level"`
		Content          string `json:"content" binding:"required"`
		Summary          string `json:"summary"`
		Tags             string `json:"tags"`
		Status           string `json:"status"`
		EstimatedMinutes int    `json:"estimatedMinutes"`
		SortOrder        int    `json:"sortOrder"`
		Blanks           []struct {
			BlankNo     int           `json:"blankNo" binding:"required"`
			Options     []clozeOption `json:"options" binding:"required"`
			Answer      string        `json:"answer" binding:"required"`
			Explanation string        `json:"explanation"`
		} `json:"blanks"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	status := body.Status
	if status == "" {
		status = models.ClozeStatusPublished
	}
	level := body.Level
	if level == "" {
		level = "初阶"
	}
	minutes := body.EstimatedMinutes
	if minutes <= 0 {
		minutes = 5
	}
	op := ""
	if user != nil {
		op = user.Username
	}

	var passage models.ClozePassage
	err := db.Transaction(func(tx *gorm.DB) error {
		passage = models.ClozePassage{
			Title:            strings.TrimSpace(body.Title),
			Level:            level,
			Content:          body.Content,
			Summary:          body.Summary,
			Tags:             strings.TrimSpace(body.Tags),
			Status:           status,
			BlankCount:       countClozeMarkers(body.Content),
			EstimatedMinutes: minutes,
			SortOrder:        body.SortOrder,
		}
		if len(body.Blanks) > 0 {
			passage.BlankCount = len(body.Blanks)
		}
		passage.SetCreateInfo(op)
		if err := tx.Create(&passage).Error; err != nil {
			return err
		}
		for _, b := range body.Blanks {
			opts, _ := json.Marshal(b.Options)
			bb := models.ClozeBlank{
				PassageID:   passage.ID,
				BlankNo:     b.BlankNo,
				Options:     string(opts),
				Answer:      strings.ToUpper(strings.TrimSpace(b.Answer)),
				Explanation: b.Explanation,
			}
			bb.SetCreateInfo(op)
			if err := tx.Create(&bb).Error; err != nil {
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

func (h *Handlers) handleAdminClozeUpdatePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var passage models.ClozePassage
	if err := db.Where("id = ?", id).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	var body struct {
		Title            *string `json:"title"`
		Level            *string `json:"level"`
		Content          *string `json:"content"`
		Summary          *string `json:"summary"`
		Tags             *string `json:"tags"`
		Status           *string `json:"status"`
		EstimatedMinutes *int    `json:"estimatedMinutes"`
		SortOrder        *int    `json:"sortOrder"`
		// Blanks 非 nil 时整表替换该文章空位（与阅读题目 replace 语义一致）
		Blanks *[]struct {
			BlankNo     int           `json:"blankNo" binding:"required"`
			Options     []clozeOption `json:"options" binding:"required"`
			Answer      string        `json:"answer" binding:"required"`
			Explanation string        `json:"explanation"`
		} `json:"blanks"`
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
		if body.Title != nil {
			passage.Title = strings.TrimSpace(*body.Title)
		}
		if body.Level != nil {
			passage.Level = *body.Level
		}
		if body.Content != nil {
			passage.Content = *body.Content
			passage.BlankCount = countClozeMarkers(*body.Content)
		}
		if body.Summary != nil {
			passage.Summary = *body.Summary
		}
		if body.Tags != nil {
			passage.Tags = strings.TrimSpace(*body.Tags)
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
		if body.Blanks != nil {
			passage.BlankCount = len(*body.Blanks)
			if err := tx.Unscoped().Where("passage_id = ?", passage.ID).Delete(&models.ClozeBlank{}).Error; err != nil {
				return err
			}
			for _, b := range *body.Blanks {
				opts, _ := json.Marshal(b.Options)
				bb := models.ClozeBlank{
					PassageID:   passage.ID,
					BlankNo:     b.BlankNo,
					Options:     string(opts),
					Answer:      strings.ToUpper(strings.TrimSpace(b.Answer)),
					Explanation: b.Explanation,
				}
				bb.SetCreateInfo(op)
				if err := tx.Create(&bb).Error; err != nil {
					return err
				}
			}
		}
		passage.SetUpdateInfo(op)
		return tx.Save(&passage).Error
	})
	if err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.updated", passage)
}

func (h *Handlers) handleAdminClozeDeletePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var passage models.ClozePassage
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
	if err := db.Unscoped().Where("passage_id = ?", passage.ID).Delete(&models.ClozeBlank{}).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.deleted", nil)
}

func (h *Handlers) handleAdminClozeListRecords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := adminReadingRecordQuery(db.Model(&models.ClozeRecord{}), c)
	var total int64
	q.Count(&total)
	var records []models.ClozeRecord
	q.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&records)

	userIDs := make([]uint, 0, len(records))
	passageIDs := make([]uint, 0, len(records))
	for _, r := range records {
		userIDs = append(userIDs, r.UserID)
		passageIDs = append(passageIDs, r.PassageID)
	}
	userMap := loadUserNames(db, userIDs)
	titleMap := map[uint]string{}
	levelMap := map[uint]string{}
	if len(passageIDs) > 0 {
		var passages []models.ClozePassage
		db.Select("id, title, level").Where("id IN ?", passageIDs).Find(&passages)
		for _, p := range passages {
			titleMap[p.ID] = p.Title
			levelMap[p.ID] = p.Level
		}
	}

	list := make([]gin.H, 0, len(records))
	for _, r := range records {
		u := userMap[r.UserID]
		list = append(list, gin.H{
			"id": r.ID, "userId": r.UserID, "username": u.Username, "email": u.Email,
			"passageId": r.PassageID, "title": titleMap[r.PassageID], "level": levelMap[r.PassageID],
			"blankCount": r.BlankCount, "correctCount": r.CorrectCount, "score": r.Score,
			"durationSec": r.DurationSec, "isLatest": r.IsLatest, "completedAt": r.CompletedAt, "source": "system",
		})
	}
	response.SuccessI18n(c, "common.success", gin.H{"list": list, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Handlers) handleAdminClozeGetRecord(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var record models.ClozeRecord
	if err := db.Where("id = ?", id).First(&record).Error; err != nil {
		response.FailI18n(c, "common.record_not_found", nil)
		return
	}
	var passage models.ClozePassage
	db.Select("id, title, level, content").First(&passage, record.PassageID)
	var user models.User
	db.Select("id, username, email").First(&user, record.UserID)

	response.SuccessI18n(c, "common.success", gin.H{
		"id": record.ID, "userId": record.UserID, "username": user.Username, "email": user.Email,
		"passageId": record.PassageID, "title": passage.Title, "level": passage.Level,
		"content": passage.Content, "blankCount": record.BlankCount, "correctCount": record.CorrectCount,
		"score": record.Score, "durationSec": record.DurationSec, "isLatest": record.IsLatest,
		"completedAt": record.Answers, "answers": record.Answers, "source": "system",
	})
}

// GET /cloze/tags — 返回所有已用标签列表（去重），用于前端筛选 UI。
func (h *Handlers) handleClozeListTags(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	var rows []string
	db.Model(&models.ClozePassage{}).
		Where("status = ? AND tags <> ''", models.ClozeStatusPublished).
		Distinct("tags").
		Pluck("tags", &rows)
	tagSet := make(map[string]struct{})
	for _, t := range rows {
		for _, tag := range strings.Split(t, ",") {
			tag = strings.TrimSpace(tag)
			if tag != "" {
				tagSet[tag] = struct{}{}
			}
		}
	}
	tags := make([]string, 0, len(tagSet))
	for tag := range tagSet {
		tags = append(tags, tag)
	}
	sort.Strings(tags)
	response.SuccessI18n(c, "common.success", gin.H{"tags": tags})
}
