package handlers

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/ling-base/apidocs/humax"
	response "github.com/LingByte/ling-base/common/response/gin"
	lbconstants "github.com/LingByte/ling-base/common/constants"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (h *Handlers) registerUserClozeRoutes(rg *humax.Group) {
	custom := rg.Group("custom")
	custom.Use(auth.Required)
	{
		custom.GET("/passages", h.handleUserClozeListPassages)
		custom.POST("/passages", h.handleUserClozeCreatePassage)
		custom.GET("/passages/:id", h.handleUserClozeGetPassage)
		custom.PUT("/passages/:id", h.handleUserClozeUpdatePassage)
		custom.DELETE("/passages/:id", h.handleUserClozeDeletePassage)
		custom.POST("/passages/:id/submit", h.handleUserClozeSubmit)
		custom.GET("/records", h.handleUserClozeListRecords)
	}

	adminCustom := rg.Group("admin/custom")
	adminCustom.Use(auth.Required, auth.AdminRequired)
	{
		adminCustom.GET("/passages", h.handleAdminUserClozeListPassages)
		adminCustom.GET("/passages/:id", h.handleAdminUserClozeGetPassage)
		adminCustom.DELETE("/passages/:id", h.handleAdminUserClozeDeletePassage)
		adminCustom.GET("/records", h.handleAdminListUserClozeRecords)
		adminCustom.GET("/records/:id", h.handleAdminGetUserClozeRecord)
	}
}

func userClozePassageListItem(db *gorm.DB, userID uint, list []models.UserClozePassage) []gin.H {
	ids := make([]uint, 0, len(list))
	for _, p := range list {
		ids = append(ids, p.ID)
	}

	latestMap := map[uint]models.UserClozeRecord{}
	if len(ids) > 0 {
		var records []models.UserClozeRecord
		db.Where("user_id = ? AND passage_id IN ? AND is_latest = ?", userID, ids, true).Find(&records)
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
			"blankCount":       p.BlankCount,
			"estimatedMinutes": p.EstimatedMinutes,
			"sortOrder":        p.SortOrder,
			"source":           p.Source,
			"isCustom":         true,
		}
		if rec, ok := latestMap[p.ID]; ok {
			item["lastScore"] = rec.Score
			item["lastCorrectCount"] = rec.CorrectCount
			item["lastBlankCount"] = rec.BlankCount
			item["lastCompletedAt"] = rec.CompletedAt
		}
		items = append(items, item)
	}
	return items
}

type userClozeBlankInput struct {
	BlankNo     int           `json:"blankNo" binding:"required"`
	Options     []clozeOption `json:"options" binding:"required"`
	Answer      string        `json:"answer" binding:"required"`
	Explanation string        `json:"explanation"`
}

type userClozePassageInput struct {
	Title            string                `json:"title" binding:"required"`
	Level            string                `json:"level"`
	Content          string                `json:"content" binding:"required"`
	Summary          string                `json:"summary"`
	EstimatedMinutes int                   `json:"estimatedMinutes"`
	Blanks           []userClozeBlankInput `json:"blanks" binding:"required"`
}

func createUserClozePassageTx(tx *gorm.DB, userID uint, operator string, in userClozePassageInput, source string) (models.UserClozePassage, error) {
	level := strings.TrimSpace(in.Level)
	if level == "" {
		level = "初阶"
	}
	minutes := in.EstimatedMinutes
	if minutes <= 0 {
		minutes = 5
	}
	blankCount := countClozeMarkers(in.Content)
	if len(in.Blanks) > 0 {
		blankCount = len(in.Blanks)
	}

	passage := models.UserClozePassage{
		UserID:           userID,
		Title:            strings.TrimSpace(in.Title),
		Level:            level,
		Content:          in.Content,
		Summary:          strings.TrimSpace(in.Summary),
		Status:           models.UserClozeStatusActive,
		Source:           source,
		BlankCount:       blankCount,
		EstimatedMinutes: minutes,
	}
	passage.SetCreateInfo(operator)
	if err := tx.Create(&passage).Error; err != nil {
		return passage, err
	}
	for _, b := range in.Blanks {
		opts, err := json.Marshal(b.Options)
		if err != nil {
			return passage, err
		}
		bb := models.UserClozeBlank{
			PassageID:   passage.ID,
			BlankNo:     b.BlankNo,
			Options:     string(opts),
			Answer:      strings.ToUpper(strings.TrimSpace(b.Answer)),
			Explanation: b.Explanation,
		}
		bb.SetCreateInfo(operator)
		if err := tx.Create(&bb).Error; err != nil {
			return passage, err
		}
	}
	return passage, nil
}

func (h *Handlers) handleUserClozeListPassages(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	level := strings.TrimSpace(c.Query("level"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit < 1 || limit > 100 {
		limit = 20
	}

	// 游标格式: "sortOrder,id" (排序为 sort_order ASC, id DESC)
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

	q := db.Model(&models.UserClozePassage{}).
		Where("user_id = ? AND status = ?", user.ID, models.UserClozeStatusActive)
	if level != "" {
		q = q.Where("level = ?", level)
	}
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("title LIKE ? OR summary LIKE ?", like, like)
	}
	if cursorID > 0 {
		q = q.Where("(sort_order > ? OR (sort_order = ? AND id < ?))", cursorSO, cursorSO, cursorID)
	}

	var list []models.UserClozePassage
	q.Order("sort_order ASC, id DESC").
		Limit(limit + 1).Find(&list)

	hasMore := len(list) > limit
	if hasMore {
		list = list[:limit]
	}

	var nextCursor string
	if hasMore && len(list) > 0 {
		last := list[len(list)-1]
		nextCursor = strconv.Itoa(last.SortOrder) + "," + strconv.FormatUint(uint64(last.ID), 10)
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"list":       userClozePassageListItem(db, user.ID, list),
		"nextCursor": nextCursor,
		"hasMore":    hasMore,
		"limit":      limit,
	})
}

func (h *Handlers) handleUserClozeCreatePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	var body userClozePassageInput
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Blanks) == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	var passage models.UserClozePassage
	err := db.Transaction(func(tx *gorm.DB) error {
		var err error
		passage, err = createUserClozePassageTx(tx, user.ID, user.Username, body, models.UserClozeSourceForm)
		return err
	})
	if err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.created", gin.H{"id": passage.ID})
}

func (h *Handlers) handleUserClozeGetPassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var passage models.UserClozePassage
	if err := db.Where("id = ? AND user_id = ? AND status = ?", id, user.ID, models.UserClozeStatusActive).
		First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	var blanks []models.UserClozeBlank
	db.Where("passage_id = ?", passage.ID).Order("blank_no ASC, id ASC").Find(&blanks)
	bs := make([]gin.H, 0, len(blanks))
	for _, b := range blanks {
		bs = append(bs, gin.H{
			"id": b.ID, "blankNo": b.BlankNo, "options": parseClozeOptions(b.Options),
		})
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"id": passage.ID, "title": passage.Title, "level": passage.Level,
		"content": passage.Content, "summary": passage.Summary,
		"blankCount": passage.BlankCount, "estimatedMinutes": passage.EstimatedMinutes,
		"blanks": bs, "isCustom": true,
	})
}

func (h *Handlers) handleUserClozeUpdatePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var passage models.UserClozePassage
	if err := db.Where("id = ? AND user_id = ?", id, user.ID).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	var body userClozePassageInput
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Blanks) == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	err := db.Transaction(func(tx *gorm.DB) error {
		passage.Title = strings.TrimSpace(body.Title)
		if body.Level != "" {
			passage.Level = body.Level
		}
		passage.Content = body.Content
		passage.Summary = strings.TrimSpace(body.Summary)
		passage.BlankCount = len(body.Blanks)
		if body.EstimatedMinutes > 0 {
			passage.EstimatedMinutes = body.EstimatedMinutes
		}
		passage.SetUpdateInfo(user.Username)
		if err := tx.Save(&passage).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("passage_id = ?", passage.ID).Delete(&models.UserClozeBlank{}).Error; err != nil {
			return err
		}
		for _, b := range body.Blanks {
			opts, err := json.Marshal(b.Options)
			if err != nil {
				return err
			}
			bb := models.UserClozeBlank{
				PassageID: passage.ID, BlankNo: b.BlankNo, Options: string(opts),
				Answer: strings.ToUpper(strings.TrimSpace(b.Answer)), Explanation: b.Explanation,
			}
			bb.SetCreateInfo(user.Username)
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
	response.SuccessI18n(c, "common.updated", gin.H{"id": passage.ID})
}

func (h *Handlers) handleUserClozeDeletePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var passage models.UserClozePassage
	if err := db.Where("id = ? AND user_id = ?", id, user.ID).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}
	passage.Status = models.UserClozeStatusArchived
	passage.SetUpdateInfo(user.Username)
	if err := db.Save(&passage).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.deleted", nil)
}

func (h *Handlers) handleUserClozeSubmit(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var body struct {
		Answers []struct {
			BlankID uint   `json:"blankId"`
			Answer  string `json:"answer"`
		} `json:"answers" binding:"required"`
		DurationSec int `json:"durationSec"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Answers) == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	var passage models.UserClozePassage
	if err := db.Where("id = ? AND user_id = ? AND status = ?", id, user.ID, models.UserClozeStatusActive).
		First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}

	var blanks []models.UserClozeBlank
	db.Where("passage_id = ?", passage.ID).Order("blank_no ASC, id ASC").Find(&blanks)
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
			BlankID: b.ID, BlankNo: b.BlankNo, Answer: userAns, Correct: ok,
			RightAnswer: right, Explanation: b.Explanation,
		})
	}

	total := len(blanks)
	score := 0
	if total > 0 {
		score = correctCount * 100 / total
	}

	answersJSON, _ := json.Marshal(details)
	now := time.Now()
	var record models.UserClozeRecord
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.UserClozeRecord{}).
			Where("user_id = ? AND passage_id = ? AND is_latest = ?", user.ID, passage.ID, true).
			Update("is_latest", false).Error; err != nil {
			return err
		}
		record = models.UserClozeRecord{
			UserID: user.ID, PassageID: passage.ID, Answers: string(answersJSON),
			BlankCount: total, CorrectCount: correctCount, Score: score,
			DurationSec: body.DurationSec, IsLatest: true, CompletedAt: &now,
		}
		return tx.Create(&record).Error
	})
	if err != nil {
		response.FailI18n(c, "reading.save_record_failed", err)
		return
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"recordId": record.ID, "passageId": passage.ID, "title": passage.Title,
		"level": passage.Level, "blankCount": total, "correctCount": correctCount,
		"score": score, "durationSec": body.DurationSec, "completedAt": now, "details": details,
	})
}

func (h *Handlers) handleUserClozeListRecords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := db.Model(&models.UserClozeRecord{}).Where("user_id = ?", user.ID)
	var total int64
	q.Count(&total)
	var records []models.UserClozeRecord
	q.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&records)

	titleMap := map[uint]string{}
	levelMap := map[uint]string{}
	ids := make([]uint, 0, len(records))
	for _, r := range records {
		ids = append(ids, r.PassageID)
	}
	if len(ids) > 0 {
		var passages []models.UserClozePassage
		db.Select("id, title, level").Where("id IN ?", ids).Find(&passages)
		for _, p := range passages {
			titleMap[p.ID] = p.Title
			levelMap[p.ID] = p.Level
		}
	}

	list := make([]gin.H, 0, len(records))
	for _, r := range records {
		list = append(list, gin.H{
			"id": r.ID, "passageId": r.PassageID, "title": titleMap[r.PassageID],
			"level": levelMap[r.PassageID], "blankCount": r.BlankCount,
			"correctCount": r.CorrectCount, "score": r.Score, "durationSec": r.DurationSec,
			"isLatest": r.IsLatest, "completedAt": r.CompletedAt,
		})
	}
	response.SuccessI18n(c, "common.success", gin.H{"list": list, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Handlers) handleAdminUserClozeListPassages(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := db.Model(&models.UserClozePassage{}).Where("status = ?", models.UserClozeStatusActive)
	if uid := strings.TrimSpace(c.Query("userId")); uid != "" {
		if id, err := strconv.ParseUint(uid, 10, 64); err == nil && id > 0 {
			q = q.Where("user_id = ?", id)
		}
	}
	if kw := strings.TrimSpace(c.Query("keyword")); kw != "" {
		q = q.Where("title LIKE ?", "%"+kw+"%")
	}

	var total int64
	q.Count(&total)
	var list []models.UserClozePassage
	q.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&list)

	userIDs := make([]uint, 0, len(list))
	for _, p := range list {
		userIDs = append(userIDs, p.UserID)
	}
	userMap := loadUserNames(db, userIDs)

	items := make([]gin.H, 0, len(list))
	for _, p := range list {
		u := userMap[p.UserID]
		items = append(items, gin.H{
			"id": p.ID, "userId": p.UserID, "username": u.Username, "email": u.Email,
			"title": p.Title, "level": p.Level, "summary": p.Summary,
			"blankCount": p.BlankCount, "estimatedMinutes": p.EstimatedMinutes, "source": p.Source,
		})
	}
	response.SuccessI18n(c, "common.success", gin.H{"list": items, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Handlers) handleAdminUserClozeGetPassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var passage models.UserClozePassage
	if err := db.Where("id = ?", id).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}
	var user models.User
	db.Select("id, username, email").First(&user, passage.UserID)

	var blanks []models.UserClozeBlank
	db.Where("passage_id = ?", passage.ID).Order("blank_no ASC, id ASC").Find(&blanks)
	bs := make([]gin.H, 0, len(blanks))
	for _, b := range blanks {
		bs = append(bs, gin.H{
			"id": b.ID, "blankNo": b.BlankNo, "options": parseClozeOptions(b.Options),
			"answer": b.Answer, "explanation": b.Explanation,
		})
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"passage": passage, "blanks": bs,
		"username": user.Username, "email": user.Email,
	})
}

func (h *Handlers) handleAdminUserClozeDeletePassage(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var passage models.UserClozePassage
	if err := db.Where("id = ?", id).First(&passage).Error; err != nil {
		response.FailI18n(c, "reading.not_found", nil)
		return
	}
	op := ""
	if user != nil {
		op = user.Username
	}
	passage.Status = models.UserClozeStatusArchived
	passage.SetUpdateInfo(op)
	if err := db.Save(&passage).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.deleted", nil)
}

func (h *Handlers) handleAdminListUserClozeRecords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := adminReadingRecordQuery(db.Model(&models.UserClozeRecord{}), c)
	var total int64
	q.Count(&total)
	var records []models.UserClozeRecord
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
		var passages []models.UserClozePassage
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
			"durationSec": r.DurationSec, "isLatest": r.IsLatest, "completedAt": r.CompletedAt, "source": "custom",
		})
	}
	response.SuccessI18n(c, "common.success", gin.H{"list": list, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Handlers) handleAdminGetUserClozeRecord(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var record models.UserClozeRecord
	if err := db.Where("id = ?", id).First(&record).Error; err != nil {
		response.FailI18n(c, "common.record_not_found", nil)
		return
	}
	var passage models.UserClozePassage
	db.Select("id, title, level, content").First(&passage, record.PassageID)
	var user models.User
	db.Select("id, username, email").First(&user, record.UserID)

	response.SuccessI18n(c, "common.success", gin.H{
		"id": record.ID, "userId": record.UserID, "username": user.Username, "email": user.Email,
		"passageId": record.PassageID, "title": passage.Title, "level": passage.Level,
		"content": passage.Content, "blankCount": record.BlankCount, "correctCount": record.CorrectCount,
		"score": record.Score, "durationSec": record.DurationSec, "isLatest": record.IsLatest,
		"completedAt": record.CompletedAt, "answers": record.Answers, "source": "custom",
	})
}
