package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/constants"
	"github.com/LingByte/CloudStepsGo/pkg/response"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (h *Handlers) handleStudyLighthouse(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	wordBookID, _ := strconv.Atoi(c.Query("wordBookId"))

	now := time.Now().UTC()
	startOfToday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	endOfToday := startOfToday.Add(24 * time.Hour)

	type dayItem struct {
		ID    string `json:"id"`
		Count int64  `json:"count"`
		Label string `json:"label"`
	}
	days := make([]dayItem, 0, 7)

	// 艾宾浩斯阶段：第 1～7 格对应 review_stage 0～6（与复习推进一致，非“日历上的连续 7 天”）
	intervals := models.EbbinghausIntervals
	for i := 0; i < 7; i++ {
		q := db.Model(&models.UserWordState{}).
			Where("user_id = ? AND learn_status IN ?", user.ID, []string{"learning", "learned", "mastered"}).
			Where("review_stage = ?", i)
		if wordBookID > 0 {
			q = q.Where("word_book_id = ?", uint(wordBookID))
		}
		var cnt int64
		_ = q.Count(&cnt).Error

		label := fmt.Sprintf("第%d步", i+1)
		if i < len(intervals) {
			if i == 0 {
				label += "·初学"
			} else {
				label += fmt.Sprintf("·%d天后", intervals[i])
			}
		}
		days = append(days, dayItem{ID: pad2(i + 1), Count: cnt, Label: label})
	}

	// 今日新学：本日首次标记为已学的词数
	tq := db.Model(&models.UserWordState{}).
		Where("user_id = ? AND first_learned_at IS NOT NULL AND first_learned_at >= ? AND first_learned_at < ?", user.ID, startOfToday, endOfToday)
	if wordBookID > 0 {
		tq = tq.Where("word_book_id = ?", uint(wordBookID))
	}
	var todayNewLearned int64
	_ = tq.Count(&todayNewLearned).Error

	// 待学：unknown + pending
	st := db.Model(&models.UserWordState{}).
		Where("user_id = ? AND screen_result = ? AND learn_status = ?", user.ID, "unknown", "pending")
	if wordBookID > 0 {
		st = st.Where("word_book_id = ?", wordBookID)
	}
	var pendingCount int64
	_ = st.Count(&pendingCount).Error

	mt := db.Model(&models.UserWordState{}).
		Where("user_id = ? AND learn_status = ?", user.ID, "mastered")
	if wordBookID > 0 {
		mt = mt.Where("word_book_id = ?", wordBookID)
	}
	var masteredCount int64
	_ = mt.Count(&masteredCount).Error

	response.Success(c, "success", gin.H{
		"days":            days,
		"pendingCount":    pendingCount,
		"masteredCount":   masteredCount,
		"todayNewLearned": todayNewLearned,
	})
}

// handleStudyLighthouseWords GET /study/lighthouse/words?wordBookId=N&step=01|pending|mastered
func (h *Handlers) handleStudyLighthouseWords(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	wordBookID, _ := strconv.Atoi(c.Query("wordBookId"))
	step := c.Query("step")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}

	// 根据 step 查询对应的 word_id 列表
	var wordIDs []uint

	switch {
	case step == "today":
		// 今日新学：本日首次标记为已学的词
		now := time.Now().UTC()
		startOfToday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		endOfToday := startOfToday.Add(24 * time.Hour)
		q := db.Model(&models.UserWordState{}).
			Where("user_id = ? AND first_learned_at IS NOT NULL AND first_learned_at >= ? AND first_learned_at < ?", user.ID, startOfToday, endOfToday)
		if wordBookID > 0 {
			q = q.Where("word_book_id = ?", wordBookID)
		}
		_ = q.Pluck("word_id", &wordIDs).Error

	case step == "pending":
		// 待学：screen_result=unknown, learn_status=pending
		q := db.Model(&models.UserWordState{}).
			Where("user_id = ? AND screen_result = ? AND learn_status = ?", user.ID, "unknown", "pending")
		if wordBookID > 0 {
			q = q.Where("word_book_id = ?", wordBookID)
		}
		_ = q.Pluck("word_id", &wordIDs).Error

	case step == "mastered":
		// 掌握：learn_status=mastered
		q := db.Model(&models.UserWordState{}).
			Where("user_id = ? AND learn_status = ?", user.ID, "mastered")
		if wordBookID > 0 {
			q = q.Where("word_book_id = ?", wordBookID)
		}
		_ = q.Pluck("word_id", &wordIDs).Error

	default:
		// 步骤 01-07：对应 review_stage 0-6，learn_status IN (learning, learned, mastered)
		stage, err := strconv.Atoi(step)
		if err != nil || stage < 1 || stage > 7 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "step 参数无效，应为 today、01-07、pending 或 mastered"})
			return
		}
		q := db.Model(&models.UserWordState{}).
			Where("user_id = ? AND learn_status IN ? AND review_stage = ?", user.ID, []string{"learning", "learned", "mastered"}, stage-1)
		if wordBookID > 0 {
			q = q.Where("word_book_id = ?", wordBookID)
		}
		_ = q.Pluck("word_id", &wordIDs).Error
	}

	var total int64 = int64(len(wordIDs))
	if total == 0 {
		response.Success(c, "success", gin.H{"words": []models.Word{}, "total": 0})
		return
	}

	// 分页截取 wordIDs
	offset := (page - 1) * pageSize
	end := offset + pageSize
	if offset > len(wordIDs) {
		offset = len(wordIDs)
	}
	if end > len(wordIDs) {
		end = len(wordIDs)
	}
	pageIDs := wordIDs[offset:end]

	var words []models.Word
	_ = db.Where("id IN ?", pageIDs).Order("sort_order ASC, id ASC").Find(&words).Error

	response.Success(c, "success", gin.H{
		"words": words,
		"total": total,
	})
}

func pad2(n int) string {
	if n < 10 {
		return "0" + strconv.Itoa(n)
	}
	return strconv.Itoa(n)
}

// handleStudyWords GET /study/words?wordBookId=N&page=1&pageSize=20
func (h *Handlers) handleStudyWords(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	wordBookID, _ := strconv.Atoi(c.Query("wordBookId"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}
	if wordBookID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "wordBookId 必填"})
		return
	}
	
	// 确保分页参数合理
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	var processedIDs []uint
	_ = db.Model(&models.UserWordState{}).
		Where("user_id = ? AND word_book_id = ? AND learn_status IN ?", user.ID, wordBookID, []string{"learned", "mastered"}).
		Pluck("word_id", &processedIDs).Error

	// 先获取总数
	var total int64
	countQuery := db.Model(&models.Word{}).Where("word_book_id = ?", wordBookID)
	if len(processedIDs) > 0 {
		countQuery = countQuery.Where("id NOT IN ?", processedIDs)
	}
	countQuery.Count(&total)

	// 分页查询
	q := db.Model(&models.Word{}).Where("word_book_id = ?", wordBookID).Order("sort_order ASC, id ASC")
	if len(processedIDs) > 0 {
		q = q.Where("id NOT IN ?", processedIDs)
	}

	var words []models.Word
	offset := (page - 1) * pageSize
	_ = q.Offset(offset).Limit(pageSize).Find(&words).Error

	response.Success(c, "success", gin.H{
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
		"words":    words,
	})
}

// handleStudySessionStart POST /study/session/start
// body: { wordBookId, unknownIds: number[], knownIds?: number[], wordIds?: number[] }
func (h *Handlers) handleStudySessionStart(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	var body struct {
		WordBookID uint   `json:"wordBookId" binding:"required"`
		UnknownIDs []uint `json:"unknownIds"`
		KnownIDs   []uint `json:"knownIds"`
		WordIDs    []uint `json:"wordIds"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误"})
		return
	}

	unknownIDs := body.UnknownIDs
	if len(unknownIDs) == 0 && len(body.WordIDs) > 0 {
		unknownIDs = body.WordIDs
	}

	batchSize, _ := strconv.Atoi(c.DefaultQuery("batchSize", "20"))
	if batchSize <= 0 {
		batchSize = 20
	}
	if batchSize > 50 {
		batchSize = 50
	}

	// Ensure user selected wordbook
	now := time.Now().UTC()
	uwb := models.UserWordBook{UserID: user.ID, WordBookID: body.WordBookID}
	if err := db.Where(models.UserWordBook{UserID: user.ID, WordBookID: body.WordBookID}).
		Attrs(models.UserWordBook{Status: "active", StartedAt: &now}).
		FirstOrCreate(&uwb).Error; err != nil {
		response.Fail(c, "未选择该词库", err)
		return
	}

	// known -> learned (no queue)
	if len(body.KnownIDs) > 0 {
		states := make([]models.UserWordState, 0, len(body.KnownIDs))
		for _, wid := range body.KnownIDs {
			states = append(states, models.UserWordState{
				UserID:        user.ID,
				WordID:        wid,
				WordBookID:    body.WordBookID,
				ScreenResult:  "known",
				ScreenAt:      &now,
				LearnStatus:   "learned",
				FirstLearnedAt: &now,
			})
		}
		_ = db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "user_id"}, {Name: "word_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"word_book_id", "screen_result", "screen_at", "learn_status", "first_learned_at"}),
		}).Create(&states).Error
	}

	// unknown -> pending (if client specified)
	if len(unknownIDs) > 0 {
		states := make([]models.UserWordState, 0, len(unknownIDs))
		for _, wid := range unknownIDs {
			states = append(states, models.UserWordState{
				UserID:       user.ID,
				WordID:       wid,
				WordBookID:   body.WordBookID,
				ScreenResult: "unknown",
				ScreenAt:     &now,
				LearnStatus:  "pending",
			})
		}
		_ = db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "user_id"}, {Name: "word_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"word_book_id", "screen_result", "screen_at", "learn_status"}),
		}).Create(&states).Error
	}

	// Auto pick next batch if client did not specify IDs
	selectedIDs := unknownIDs
	if len(selectedIDs) == 0 {
		_ = db.Model(&models.UserWordState{}).
			Where("user_id = ? AND word_book_id = ? AND learn_status = ?", user.ID, body.WordBookID, "learning").
			Update("learn_status", "pending").Error

		var picked []models.UserWordState
		if err := db.Transaction(func(tx *gorm.DB) error {
			q := tx.Model(&models.UserWordState{}).
				Joins("JOIN words w ON w.id = user_word_states.word_id").
				Where("user_word_states.user_id = ? AND user_word_states.word_book_id = ? AND user_word_states.screen_result = ? AND user_word_states.learn_status = ?",
					user.ID, body.WordBookID, "unknown", "pending").
				Order("w.sort_order ASC, w.id ASC").
				Limit(batchSize)
			if err := q.Clauses(clause.Locking{Strength: "UPDATE"}).Find(&picked).Error; err != nil {
				return err
			}
			if len(picked) == 0 {
				return nil
			}
			ids := make([]uint, 0, len(picked))
			for _, s := range picked {
				ids = append(ids, s.WordID)
			}
			return tx.Model(&models.UserWordState{}).
				Where("user_id = ? AND word_id IN ?", user.ID, ids).
				Update("learn_status", "learning").Error
		}); err != nil {
			response.Fail(c, "取题失败", err)
			return
		}
		for _, s := range picked {
			selectedIDs = append(selectedIDs, s.WordID)
		}
	}

	if len(selectedIDs) == 0 {
		response.Success(c, "今日无待背单词", gin.H{"finished": true})
		return
	}

	// Create session
	session := models.StudySession{
		UserID:      user.ID,
		WordBookID:  body.WordBookID,
		SessionType: "learn",
		Status:      "in_progress",
		StartedAt:   now,
		WordCount:   len(selectedIDs),
	}
	if err := db.Create(&session).Error; err != nil {
		response.Fail(c, "创建会话失败", err)
		return
	}

	// session_words
	sw := make([]models.SessionWord, 0, len(selectedIDs))
	for _, wid := range selectedIDs {
		sw = append(sw, models.SessionWord{SessionID: session.ID, WordID: wid})
	}
	_ = db.Create(&sw).Error

	// If client explicitly provided ids, mark them learning now
	if len(unknownIDs) > 0 {
		_ = db.Model(&models.UserWordState{}).
			Where("user_id = ? AND word_id IN ?", user.ID, selectedIDs).
			Update("learn_status", "learning").Error
	}

	var words []models.Word
	_ = db.Where("id IN ?", selectedIDs).Find(&words).Error

	response.Success(c, "success", gin.H{
		"sessionId": session.ID,
		"words":     words,
	})
}

// handleStudySessionComplete POST /study/session/:id/complete
// body: { results: [{wordId, remembered: bool}] }
func (h *Handlers) handleStudySessionComplete(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	sessionID, _ := strconv.Atoi(c.Param("id"))
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	var body struct {
		Results []struct {
			WordID     uint `json:"wordId"`
			Remembered bool `json:"remembered"`
		} `json:"results" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误"})
		return
	}

	var session models.StudySession
	if err := db.Where("id = ? AND user_id = ?", sessionID, user.ID).First(&session).Error; err != nil {
		response.Fail(c, "会话不存在", err)
		return
	}

	now := time.Now().UTC()
	rememberedIDs := make([]uint, 0)
	forgotIDs := make([]uint, 0)
	for _, r := range body.Results {
		if r.Remembered {
			rememberedIDs = append(rememberedIDs, r.WordID)
		} else {
			forgotIDs = append(forgotIDs, r.WordID)
		}
	}

	if len(rememberedIDs) > 0 {
		t := true
		_ = db.Model(&models.SessionWord{}).
			Where("session_id = ? AND word_id IN ?", sessionID, rememberedIDs).
			Updates(map[string]any{"remembered": &t, "answered_at": &now}).Error
	}
	if len(forgotIDs) > 0 {
		f := false
		_ = db.Model(&models.SessionWord{}).
			Where("session_id = ? AND word_id IN ?", sessionID, forgotIDs).
			Updates(map[string]any{"remembered": &f, "answered_at": &now}).Error
	}

	// remembered -> learned + enqueue stage=0 due=now
	if len(rememberedIDs) > 0 {
		queueItems := make([]models.ReviewQueue, 0, len(rememberedIDs))
		for _, wid := range rememberedIDs {
			queueItems = append(queueItems, models.ReviewQueue{
				UserID:     user.ID,
				WordID:     wid,
				WordBookID: session.WordBookID,
				DueAt:      now,
				Stage:      0,
				Status:     "pending",
			})
		}
		if err := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "user_id"}, {Name: "word_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"word_book_id", "due_at", "stage", "status"}),
		}).Create(&queueItems).Error; err != nil {
			response.Fail(c, "写入复习队列失败", err)
			return
		}

		due := now
		if err := db.Model(&models.UserWordState{}).
			Where("user_id = ? AND word_id IN ?", user.ID, rememberedIDs).
			Updates(map[string]any{"learn_status": "learned", "first_learned_at": &now, "review_stage": 0, "next_review_at": &due}).Error; err != nil {
			response.Fail(c, "更新学习状态失败", err)
			return
		}
	}

	// forgot -> pending
	if len(forgotIDs) > 0 {
		_ = db.Model(&models.UserWordState{}).
			Where("user_id = ? AND word_id IN ?", user.ID, forgotIDs).
			Update("learn_status", "pending").Error
	}

	correctCount := len(rememberedIDs)
	_ = db.Model(&session).Updates(map[string]any{"status": "completed", "completed_at": &now, "correct_count": correctCount}).Error

	var remainCount int64
	_ = db.Model(&models.UserWordState{}).
		Where("user_id = ? AND word_book_id = ? AND screen_result = ? AND learn_status = ?", user.ID, session.WordBookID, "unknown", "pending").
		Count(&remainCount).Error

	response.Success(c, "success", gin.H{
		"correctCount": correctCount,
		"totalCount":   len(body.Results),
		"hasMore":      remainCount > 0,
		"remainCount":  remainCount,
	})
}

// handleStudySessionGet GET /study/session/:id
func (h *Handlers) handleStudySessionGet(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	sessionID, _ := strconv.Atoi(c.Param("id"))
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	var session models.StudySession
	if err := db.Where("id = ? AND user_id = ?", sessionID, user.ID).First(&session).Error; err != nil {
		response.Fail(c, "会话不存在", err)
		return
	}

	var sessionWords []models.SessionWord
	_ = db.Where("session_id = ?", sessionID).Find(&sessionWords).Error

	wordIDs := make([]uint, 0, len(sessionWords))
	for _, sw := range sessionWords {
		wordIDs = append(wordIDs, sw.WordID)
	}
	var words []models.Word
	if len(wordIDs) > 0 {
		_ = db.Where("id IN ?", wordIDs).Find(&words).Error
	}

	response.Success(c, "success", gin.H{
		"session": session,
		"words":   words,
	})
}
