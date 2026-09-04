package handlers

import (
	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	lbconstants "github.com/LingByte/ling-base/common/constants"

	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/utils"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (h *Handlers) handleStudyLighthouse(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	wordBookID := parseQueryUintID(c.Query("wordBookId"))
	cacheKey := lighthouseCacheKey(user.ID, int(wordBookID))
	if cached, ok := getCachedLighthouse(cacheKey); ok {
		response.SuccessI18n(c, "common.success", cached)
		return
	}

	payload := computeStudyLighthouse(db, user.ID, int(wordBookID))
	setCachedLighthouse(cacheKey, payload)
	response.SuccessI18n(c, "common.success", payload)
}

// handleStudyLighthouseWords GET /study/lighthouse/words?wordBookId=N&step=01|pending|mastered
func (h *Handlers) handleStudyLighthouseWords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	wordBookID := parseQueryUintID(c.Query("wordBookId"))
	step := c.Query("step")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}

	// 构建状态过滤条件（不再 Pluck 全量 wordIDs，直接用 JOIN 分页查轻量字段）
	now := time.Now().UTC()
	startOfToday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	endOfToday := startOfToday.Add(24 * time.Hour)

	// 待学列表：以 words 为基表 LEFT JOIN user_word_states，列出词库中所有
	// 尚未进入学习流程的词（无 state 记录 或 learn_status = 'pending'），
	// 与九宫格 01 待学计数（词库总词数 - 已学词数）保持一致。
	if step == "pending" && wordBookID > 0 {
		joinClause := "FROM words w LEFT JOIN user_word_states uws ON uws.word_id = w.id AND uws.user_id = ? AND uws.deleted_at IS NULL"
		whereClause := "w.word_book_id = ? AND w.deleted_at IS NULL AND (uws.id IS NULL OR uws.learn_status = 'pending')"
		queryArgs := []any{user.ID, uint(wordBookID)}

		var total int64
		_ = db.Raw("SELECT COUNT(*) "+joinClause+" WHERE "+whereClause, queryArgs...).Scan(&total).Error
		if total == 0 {
			response.SuccessI18n(c, "common.success", gin.H{"words": []models.WordLite{}, "total": 0})
			return
		}

		offset := (page - 1) * pageSize
		dataSQL := `SELECT w.id, w.word_book_id, w.word, w.phonetic, w.phonetic_uk, w.phonetic_us,
			w.translation, w.translation_short, w.part_of_speech, w.definition, w.audio_url, w.sort_order ` +
			joinClause + " WHERE " + whereClause +
			" ORDER BY w.sort_order ASC, w.id ASC LIMIT ? OFFSET ?"
		dataArgs := append(append(queryArgs, pageSize), offset)

		var words []models.WordLite
		if err := db.Raw(dataSQL, dataArgs...).Scan(&words).Error; err != nil {
			response.FailI18n(c, "common.query_failed", err)
			return
		}
		models.OverlayWordLites(db, user.ID, words)

		response.SuccessI18n(c, "common.success", gin.H{"words": words, "total": total})
		return
	}

	var stateWhere string
	var stateArgs []any
	switch {
	case step == "today":
		stateWhere = "uws.user_id = ? AND uws.first_learned_at IS NOT NULL AND uws.first_learned_at >= ? AND uws.first_learned_at < ?"
		stateArgs = []any{user.ID, startOfToday, endOfToday}
	case step == "mastered":
		stateWhere = "uws.user_id = ? AND uws.learn_status = ?"
		stateArgs = []any{user.ID, "mastered"}
	default:
		stage, err := strconv.Atoi(step)
		if err != nil || stage < 1 || stage > 7 {
			response.FailI18n(c, "study.invalid_step", nil)
			return
		}
		stateWhere = "uws.user_id = ? AND uws.learn_status IN ? AND uws.review_stage = ?"
		stateArgs = []any{user.ID, []string{"learning", "learned", "mastered"}, stage - 1}
	}
	if wordBookID > 0 {
		stateWhere += " AND uws.word_book_id = ?"
		stateArgs = append(stateArgs, uint(wordBookID))
	}

	// 先 COUNT 总数
	var total int64
	countSQL := "SELECT COUNT(*) FROM user_word_states uws WHERE " + stateWhere
	_ = db.Raw(countSQL, stateArgs...).Scan(&total).Error
	if total == 0 {
		response.SuccessI18n(c, "common.success", gin.H{"words": []models.WordLite{}, "total": 0})
		return
	}

	// JOIN words 表分页查轻量字段（避免 Pluck 全量 ID + 二次查询）
	offset := (page - 1) * pageSize
	dataSQL := `SELECT w.id, w.word_book_id, w.word, w.phonetic, w.phonetic_uk, w.phonetic_us,
		w.translation, w.translation_short, w.part_of_speech, w.definition, w.audio_url, w.sort_order
		FROM user_word_states uws
		JOIN words w ON w.id = uws.word_id AND w.deleted_at IS NULL
		WHERE uws.deleted_at IS NULL AND ` + stateWhere + `
		ORDER BY w.sort_order ASC, w.id ASC
		LIMIT ? OFFSET ?`
	dataArgs := append(append(stateArgs, pageSize), offset)

	var words []models.WordLite
	if err := db.Raw(dataSQL, dataArgs...).Scan(&words).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	models.OverlayWordLites(db, user.ID, words)

	response.SuccessI18n(c, "common.success", gin.H{
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

// handleStudyWords GET /study/words?wordBookId=N&page=1&pageSize=20&shuffle=0&seed=0
func (h *Handlers) handleStudyWords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	wordBookID := parseQueryUintID(c.Query("wordBookId"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	shuffleQ := strings.ToLower(strings.TrimSpace(c.DefaultQuery("shuffle", "0")))
	shuffle := shuffleQ == "1" || shuffleQ == "true" || shuffleQ == "yes"
	seed, _ := strconv.ParseInt(c.DefaultQuery("seed", "0"), 10, 64)

	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}
	if wordBookID == 0 {
		response.FailI18n(c, "wordbook.id_required", nil)
		return
	}

	// 确保分页参数合理
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	if shuffle && seed == 0 {
		seed = time.Now().UnixNano()
	}

	words, total, err := models.ListStudyWordsLite(db, wordBookID, user.ID, page, pageSize, shuffle, seed)
	if err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	models.OverlayWordLites(db, user.ID, words)

	response.SuccessI18n(c, "common.success", gin.H{
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
		"shuffle":  shuffle,
		"seed":     seed,
		"words":    words,
	})
}

// handleStudySessionStart POST /study/session/start
// body: { wordBookId, unknownIds: number[], knownIds?: number[], wordIds?: number[] }
func (h *Handlers) handleStudySessionStart(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	var body struct {
		WordBookID uint   `json:"wordBookId" binding:"required"`
		UnknownIDs []uint `json:"unknownIds"`
		KnownIDs   []uint `json:"knownIds"`
		WordIDs    []uint `json:"wordIds"`
		StudentID  string `json:"studentId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	sessionStudentID := uint(0)
	if strings.TrimSpace(body.StudentID) != "" {
		targetUser, err := reviewResolveTargetUser(db, user, body.StudentID)
		if err != nil {
			response.AbortWithStatusJSON(c, http.StatusForbidden, err)
			return
		}
		if targetUser.ID != user.ID {
			sessionStudentID = targetUser.ID
		}
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
		response.FailI18n(c, "wordbook.not_selected", err)
		return
	}

	// known -> learned (no queue)
	if len(body.KnownIDs) > 0 {
		states := make([]models.UserWordState, 0, len(body.KnownIDs))
		for _, wid := range body.KnownIDs {
			states = append(states, models.UserWordState{
				UserID:         user.ID,
				WordID:         wid,
				WordBookID:     body.WordBookID,
				ScreenResult:   "known",
				ScreenAt:       &now,
				LearnStatus:    "learned",
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
			response.FailI18n(c, "reading.fetch_questions_failed", err)
			return
		}
		for _, s := range picked {
			selectedIDs = append(selectedIDs, s.WordID)
		}
	}

	if len(selectedIDs) == 0 {
		response.SuccessI18n(c, "study.no_study_today", gin.H{"finished": true})
		return
	}

	// Create session
	session := models.StudySession{
		UserID:               user.ID,
		StudentID:            sessionStudentID,
		WordBookID:           body.WordBookID,
		SessionType:          "learn",
		Status:               "in_progress",
		StartedAt:            now,
		WordCount:            len(selectedIDs),
		ScreenedKnownCount:   len(body.KnownIDs),
		ScreenedUnknownCount: len(unknownIDs),
	}
	if err := db.Create(&session).Error; err != nil {
		response.FailI18n(c, "coaching.create_session_failed", err)
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

	var words []models.WordLite
	_ = db.Where("id IN ?", selectedIDs).Find(&words).Error
	models.OverlayWordLites(db, user.ID, words)

	response.SuccessI18n(c, "common.success", gin.H{
		"sessionId": session.ID,
		"words":     words,
	})
}

// handleStudySessionComplete POST /study/session/:id/complete
// body: { results: [{wordId, remembered: bool}] }
func (h *Handlers) handleStudySessionComplete(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id64 == 0 {
		response.FailI18n(c, "coaching.session_not_found", nil)
		return
	}
	sessionID := uint(id64)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	var body struct {
		Results []struct {
			WordID     uint `json:"wordId"`
			Remembered bool `json:"remembered"`
		} `json:"results" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	var session models.StudySession
	if err := db.Where("id = ? AND user_id = ?", sessionID, user.ID).First(&session).Error; err != nil {
		response.FailI18n(c, "coaching.session_not_found", err)
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

	// remembered -> learned + enqueue stage=0 due=开课日（第1天）本地 0 点
	if len(rememberedIDs) > 0 {
		loc := models.UserReviewLocation(user)
		firstDue := models.FirstReviewDueAt(loc)
		queueItems := make([]models.ReviewQueue, 0, len(rememberedIDs))
		for _, wid := range rememberedIDs {
			queueItems = append(queueItems, models.ReviewQueue{
				UserID:          user.ID,
				WordID:          wid,
				WordBookID:      session.WordBookID,
				SourceSessionID: session.ID,
				DueAt:           firstDue,
				Stage:           0,
				Status:          "pending",
			})
		}
		if err := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "user_id"}, {Name: "word_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"word_book_id", "source_session_id", "due_at", "stage", "status", "deleted_at"}),
		}).Create(&queueItems).Error; err != nil {
			response.FailI18n(c, "study.write_queue_failed", err)
			return
		}

		due := firstDue
		if err := db.Model(&models.UserWordState{}).
			Where("user_id = ? AND word_id IN ?", user.ID, rememberedIDs).
			Updates(map[string]any{"learn_status": "learned", "first_learned_at": &now, "review_stage": 0, "next_review_at": &due}).Error; err != nil {
			response.FailI18n(c, "study.update_state_failed", err)
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
	invalidateLighthouseCacheForUser(user.ID)

	var remainCount int64
	_ = db.Model(&models.UserWordState{}).
		Where("user_id = ? AND word_book_id = ? AND screen_result = ? AND learn_status = ?", user.ID, session.WordBookID, "unknown", "pending").
		Count(&remainCount).Error

	response.SuccessI18n(c, "common.success", gin.H{
		"correctCount": correctCount,
		"totalCount":   len(body.Results),
		"hasMore":      remainCount > 0,
		"remainCount":  remainCount,
	})
}

// handleStudySessionGet GET /study/session/:id
func (h *Handlers) handleStudySessionGet(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id64 == 0 {
		response.FailI18n(c, "coaching.session_not_found", nil)
		return
	}
	sessionID := uint(id64)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	var session models.StudySession
	if err := db.Where("id = ?", sessionID).First(&session).Error; err != nil {
		response.FailI18n(c, "coaching.session_not_found", err)
		return
	}

	// 本人或绑定师生关系的老师可查看
	if session.UserID != user.ID {
		tid := coachingCoachingTeacherID(c)
		if tid == 0 || coachingTeacherHasStudentPair(db, tid, session.UserID) != nil {
			response.FailI18n(c, "coaching.no_session_access", nil)
			return
		}
	}

	var sessionWords []models.SessionWord
	_ = db.Where("session_id = ?", sessionID).Find(&sessionWords).Error

	wordIDs := make([]uint, 0, len(sessionWords))
	for _, sw := range sessionWords {
		wordIDs = append(wordIDs, sw.WordID)
	}
	var words []models.WordLite
	if len(wordIDs) > 0 {
		_ = db.Where("id IN ?", wordIDs).Find(&words).Error
	}
	models.OverlayWordLites(db, session.UserID, words)

	response.SuccessI18n(c, "common.success", gin.H{
		"session": session,
		"words":   words,
	})
}

// handleStudySessionsList GET /study/sessions
// query: page, pageSize, sessionType, studentId(老师查学员), date / dateFrom / dateTo (YYYY-MM-DD),
//
//	wordBookId, status(completed|in_progress), groupBy(bookDay=按词库+日聚合)
func (h *Handlers) handleStudySessionsList(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	sessionType := c.Query("sessionType") // "learn"|"study"(正课) | "review" | "" (all)
	if sessionType == "study" {
		sessionType = "learn" // 前端正课 tab 用 study，库里存 learn
	}

	targetUserID := user.ID
	var filterStudentID *uint
	if sidStr := strings.TrimSpace(c.Query("studentId")); sidStr != "" {
		sid64, err := strconv.ParseUint(sidStr, 10, 64)
		if err != nil || sid64 == 0 {
			response.FailI18n(c, "coaching.invalid_student_id", nil)
			return
		}
		sid := uint(sid64)
		tid := coachingCoachingTeacherID(c)
		if tid == 0 {
			response.FailI18n(c, "coaching.teacher_only_records", nil)
			return
		}
		if err := coachingTeacherHasStudentPair(db, tid, sid); err != nil {
			response.AbortWithStatusJSON(c, http.StatusForbidden, err)
			return
		}
		filterStudentID = &sid
		targetUserID = user.ID
	}

	q := db.Model(&models.StudySession{}).Where("user_id = ?", targetUserID)
	if filterStudentID != nil {
		q = q.Where("student_id = ?", *filterStudentID)
	}
	if sessionType != "" {
		q = q.Where("session_type = ?", sessionType)
	}
	if wbID, err := strconv.Atoi(c.Query("wordBookId")); err == nil && wbID > 0 {
		q = q.Where("word_book_id = ?", wbID)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}

	// 日期筛选：优先 date（单日），否则 dateFrom / dateTo
	dateOnly := strings.TrimSpace(c.Query("date"))
	dateFrom := strings.TrimSpace(c.Query("dateFrom"))
	dateTo := strings.TrimSpace(c.Query("dateTo"))
	if dateOnly != "" {
		dateFrom, dateTo = dateOnly, dateOnly
	}
	if dateFrom != "" {
		if t, err := time.ParseInLocation("2006-01-02", dateFrom, time.Local); err == nil {
			q = q.Where("started_at >= ?", t)
		}
	}
	if dateTo != "" {
		if t, err := time.ParseInLocation("2006-01-02", dateTo, time.Local); err == nil {
			q = q.Where("started_at < ?", t.Add(24*time.Hour))
		}
	}

	// 按「词库 + 上课日」聚合，避免同课多次开练刷屏
	if strings.TrimSpace(c.Query("groupBy")) == "bookDay" {
		type groupRow struct {
			WordBookID           uint      `gorm:"column:word_book_id"`
			Day                  string    `gorm:"column:day"`
			SessionCount         int64     `gorm:"column:session_count"`
			WordCount            int64     `gorm:"column:word_count"`
			CorrectCount         int64     `gorm:"column:correct_count"`
			ScreenedKnownCount   int64     `gorm:"column:screened_known_count"`
			ScreenedUnknownCount int64     `gorm:"column:screened_unknown_count"`
			LatestAt             time.Time `gorm:"column:latest_at"`
			SessionIDs           string    `gorm:"column:session_ids"`
		}

		countQ := q.Session(&gorm.Session{})
		var total int64
		_ = db.Table("(?) AS g", countQ.Select("word_book_id, DATE(started_at) AS d").Group("word_book_id, DATE(started_at)")).
			Count(&total).Error

		var rows []groupRow
		if err := q.Select(`
			word_book_id,
			DATE(started_at) AS day,
			COUNT(*) AS session_count,
			COALESCE(SUM(word_count), 0) AS word_count,
			COALESCE(SUM(correct_count), 0) AS correct_count,
			COALESCE(SUM(screened_known_count), 0) AS screened_known_count,
			COALESCE(SUM(screened_unknown_count), 0) AS screened_unknown_count,
			MAX(started_at) AS latest_at,
			GROUP_CONCAT(id ORDER BY started_at DESC, id DESC) AS session_ids
		`).Group("word_book_id, DATE(started_at)").
			Order("MAX(started_at) DESC").
			Offset((page - 1) * pageSize).
			Limit(pageSize).
			Scan(&rows).Error; err != nil {
			response.FailI18n(c, "common.query_failed", err)
			return
		}

		wbIDs := make([]uint, 0, len(rows))
		for _, r := range rows {
			if r.WordBookID > 0 {
				wbIDs = append(wbIDs, r.WordBookID)
			}
		}
		wbNames := make(map[uint]string, len(wbIDs))
		if len(wbIDs) > 0 {
			var books []models.WordBook
			_ = db.Where("id IN ?", wbIDs).Find(&books).Error
			for _, b := range books {
				wbNames[b.ID] = b.Name
			}
		}

		list := make([]gin.H, 0, len(rows))
		for _, r := range rows {
			ids := make([]string, 0)
			for _, p := range strings.Split(r.SessionIDs, ",") {
				p = strings.TrimSpace(p)
				if p == "" {
					continue
				}
				if id64, err := strconv.ParseUint(p, 10, 64); err == nil && id64 > 0 {
					// 字符串返回，避免前端 Number 丢雪花精度
					ids = append(ids, strconv.FormatUint(id64, 10))
				}
			}
			day := strings.TrimSpace(r.Day)
			if len(day) >= 10 {
				day = day[:10]
			}
			list = append(list, gin.H{
				"wordBookId":           strconv.FormatUint(uint64(r.WordBookID), 10),
				"wordBookName":         wbNames[r.WordBookID],
				"day":                  day,
				"sessionCount":         r.SessionCount,
				"wordCount":            r.WordCount,
				"correctCount":         r.CorrectCount,
				"screenedKnownCount":   r.ScreenedKnownCount,
				"screenedUnknownCount": r.ScreenedUnknownCount,
				"latestAt":             r.LatestAt,
				"sessionIds":           ids,
				"sessionType":          sessionType,
				"status":               "grouped",
			})
		}

		response.SuccessI18n(c, "common.success", gin.H{
			"list":     list,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
			"grouped":  true,
		})
		return
	}

	var total int64
	_ = q.Count(&total).Error

	var sessions []models.StudySession
	if err := q.Order("created_at DESC, id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&sessions).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}

	// 附上词书名
	wbIDs := make([]uint, 0, len(sessions))
	for _, s := range sessions {
		if s.WordBookID > 0 {
			wbIDs = append(wbIDs, s.WordBookID)
		}
	}
	wbNames := make(map[uint]string, len(wbIDs))
	if len(wbIDs) > 0 {
		var books []models.WordBook
		_ = db.Where("id IN ?", wbIDs).Find(&books).Error
		for _, b := range books {
			wbNames[b.ID] = b.Name
		}
	}

	list := make([]gin.H, 0, len(sessions))
	for _, s := range sessions {
		list = append(list, gin.H{
			"id":                   strconv.FormatUint(uint64(s.ID), 10),
			"sessionType":          s.SessionType,
			"status":               s.Status,
			"startedAt":            s.StartedAt,
			"completedAt":          s.CompletedAt,
			"wordCount":            s.WordCount,
			"correctCount":         s.CorrectCount,
			"screenedKnownCount":   s.ScreenedKnownCount,
			"screenedUnknownCount": s.ScreenedUnknownCount,
			"wordBookId":           strconv.FormatUint(uint64(s.WordBookID), 10),
			"wordBookName":         wbNames[s.WordBookID],
			"userId":               strconv.FormatUint(uint64(s.UserID), 10),
		})
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"list":     list,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// handleStudySessionsExportWords GET /study/sessions/export-words
// 一次返回筛选条件下去重后的单词（英文 / 音标 / 中文释义），供导出。
func (h *Handlers) handleStudySessionsExportWords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	sessionType := c.Query("sessionType")
	if sessionType == "study" {
		sessionType = "learn"
	}
	targetUserID := user.ID
	if sidStr := strings.TrimSpace(c.Query("studentId")); sidStr != "" {
		sid64, err := strconv.ParseUint(sidStr, 10, 64)
		if err != nil || sid64 == 0 {
			response.FailI18n(c, "coaching.invalid_student_id", nil)
			return
		}
		sid := uint(sid64)
		tid := coachingCoachingTeacherID(c)
		if tid == 0 {
			response.FailI18n(c, "coaching.teacher_only_records", nil)
			return
		}
		if err := coachingTeacherHasStudentPair(db, tid, sid); err != nil {
			response.AbortWithStatusJSON(c, http.StatusForbidden, err)
			return
		}
		// 正课会话目前记在老师账号；传 studentId 仅做权限校验，仍导出老师侧会话词
		_ = sid
		targetUserID = user.ID
	}

	q := db.Model(&models.StudySession{}).Where("user_id = ?", targetUserID)
	if sessionType != "" {
		q = q.Where("session_type = ?", sessionType)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if wbID, err := strconv.Atoi(c.Query("wordBookId")); err == nil && wbID > 0 {
		q = q.Where("word_book_id = ?", wbID)
	}

	dateOnly := strings.TrimSpace(c.Query("date"))
	dateFrom := strings.TrimSpace(c.Query("dateFrom"))
	dateTo := strings.TrimSpace(c.Query("dateTo"))
	if dateOnly != "" {
		dateFrom, dateTo = dateOnly, dateOnly
	}
	if dateFrom != "" {
		if t, err := time.ParseInLocation("2006-01-02", dateFrom, time.Local); err == nil {
			q = q.Where("started_at >= ?", t)
		}
	}
	if dateTo != "" {
		if t, err := time.ParseInLocation("2006-01-02", dateTo, time.Local); err == nil {
			q = q.Where("started_at < ?", t.Add(24*time.Hour))
		}
	}

	var sessionIDs []uint
	if err := q.Order("id DESC").Limit(500).Pluck("id", &sessionIDs).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	if len(sessionIDs) == 0 {
		response.SuccessI18n(c, "common.success", gin.H{"words": []any{}, "total": 0})
		return
	}

	type exportRow struct {
		ID           uint   `json:"id" gorm:"column:id"`
		Word         string `json:"word" gorm:"column:word"`
		Phonetic     string `json:"phonetic" gorm:"column:phonetic"`
		PhoneticUK   string `json:"phoneticUk" gorm:"column:phonetic_uk"`
		PhoneticUS   string `json:"phoneticUs" gorm:"column:phonetic_us"`
		Translation  string `json:"translation" gorm:"column:translation"`
		PartOfSpeech string `json:"partOfSpeech" gorm:"column:part_of_speech"`
		AudioURL     string `json:"audioUrl" gorm:"column:audio_url"`
	}

	var rows []exportRow
	err := db.Raw(`
		SELECT w.id, w.word, w.phonetic, w.phonetic_uk, w.phonetic_us, w.translation, w.part_of_speech, w.audio_url
		FROM session_words sw
		JOIN words w ON w.id = sw.word_id
		WHERE sw.session_id IN ?
		GROUP BY w.id, w.word, w.phonetic, w.phonetic_uk, w.phonetic_us, w.translation, w.part_of_speech, w.audio_url
		ORDER BY w.word ASC
	`, sessionIDs).Scan(&rows).Error
	if err != nil {
		response.FailI18n(c, "common.export_failed", err)
		return
	}
	if len(rows) > 0 {
		lites := make([]models.WordLite, len(rows))
		for i, row := range rows {
			lites[i] = models.WordLite{
				ID:           row.ID,
				Word:         row.Word,
				Phonetic:     row.Phonetic,
				PhoneticUK:   row.PhoneticUK,
				PhoneticUS:   row.PhoneticUS,
				Translation:  row.Translation,
				PartOfSpeech: row.PartOfSpeech,
				AudioURL:     row.AudioURL,
			}
		}
		models.OverlayWordLites(db, targetUserID, lites)
		for i, lite := range lites {
			rows[i].Word = lite.Word
			rows[i].Phonetic = lite.Phonetic
			rows[i].PhoneticUK = lite.PhoneticUK
			rows[i].PhoneticUS = lite.PhoneticUS
			rows[i].Translation = lite.Translation
			rows[i].PartOfSpeech = lite.PartOfSpeech
		}
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"words": rows,
		"total": len(rows),
	})
}

// lighthouseMasteredAfterStage 九宫格 02–08 对应 review_stage 0–6，通过后进入 09 已掌握。
const lighthouseMasteredAfterStage = 6

// handleLighthouseReviewWords GET /study/lighthouse/review-words?wordBookId=N
// 返回词库内所有已学、尚未掌握的单词（九宫格「开始复习」用）。
func (h *Handlers) handleLighthouseReviewWords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	wordBookID := parseQueryUintID(c.Query("wordBookId"))
	if wordBookID == 0 {
		response.FailI18n(c, "wordbook.id_required", nil)
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "200"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 500 {
		pageSize = 200
	}
	offset := (page - 1) * pageSize

	stateWhere := `uws.user_id = ? AND uws.word_book_id = ? AND uws.learn_status IN ?`
	stateArgs := []any{user.ID, uint(wordBookID), []string{"learning", "learned"}}

	var total int64
	countSQL := "SELECT COUNT(*) FROM user_word_states uws WHERE uws.deleted_at IS NULL AND " + stateWhere
	if err := db.Raw(countSQL, stateArgs...).Scan(&total).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	if total == 0 {
		response.SuccessI18n(c, "common.success", gin.H{"words": []models.WordLite{}, "total": 0})
		return
	}

	dataSQL := `SELECT w.id, w.word_book_id, w.word, w.phonetic, w.phonetic_uk, w.phonetic_us,
		w.translation, w.translation_short, w.part_of_speech, w.definition, w.audio_url, w.sort_order
		FROM user_word_states uws
		JOIN words w ON w.id = uws.word_id AND w.deleted_at IS NULL
		WHERE uws.deleted_at IS NULL AND ` + stateWhere + `
		ORDER BY w.sort_order ASC, w.id ASC
		LIMIT ? OFFSET ?`
	dataArgs := append(append(stateArgs, pageSize), offset)

	var words []models.WordLite
	if err := db.Raw(dataSQL, dataArgs...).Scan(&words).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	models.OverlayWordLites(db, user.ID, words)

	response.SuccessI18n(c, "common.success", gin.H{
		"words": words,
		"total": total,
	})
}

// handleLighthouseReviewSubmit POST /study/lighthouse/review-submit
// body: { wordBookId, results: [{ wordId, remembered }] }
// remembered=true → review_stage +1（满格后 mastered）；false → 不推进。
func (h *Handlers) handleLighthouseReviewSubmit(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	var body struct {
		WordBookID utils.JSONUint `json:"wordBookId" binding:"required"`
		Results    []struct {
			WordID     uint `json:"wordId"`
			Remembered bool `json:"remembered"`
		} `json:"results" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Results) == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	wbID := body.WordBookID.Uint()
	if wbID == 0 {
		response.FailI18n(c, "wordbook.id_required", nil)
		return
	}

	now := time.Now().UTC()
	wordIDs := make([]uint, 0, len(body.Results))
	resMap := make(map[uint]bool, len(body.Results))
	for _, r := range body.Results {
		if r.WordID == 0 {
			continue
		}
		wordIDs = append(wordIDs, r.WordID)
		resMap[r.WordID] = r.Remembered
	}
	if len(wordIDs) == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	var advanced, unchanged int
	err := db.Transaction(func(tx *gorm.DB) error {
		var states []models.UserWordState
		if err := tx.Where("user_id = ? AND word_book_id = ? AND word_id IN ? AND learn_status IN ?",
			user.ID, wbID, wordIDs, []string{"learning", "learned"}).
			Find(&states).Error; err != nil {
			return err
		}

		for _, st := range states {
			remembered, ok := resMap[st.WordID]
			if !ok {
				continue
			}
			if !remembered {
				_ = tx.Model(&st).Updates(map[string]any{
					"last_reviewed_at": &now,
					"learn_status":     "learning",
				}).Error
				unchanged++
				continue
			}

			newStage := st.ReviewStage + 1
			if newStage > lighthouseMasteredAfterStage {
				if err := tx.Model(&st).Updates(map[string]any{
					"learn_status":     "mastered",
					"mastered_at":      &now,
					"last_reviewed_at": &now,
					"next_review_at":   nil,
					"review_stage":     newStage,
				}).Error; err != nil {
					return err
				}
			} else {
				if err := tx.Model(&st).Updates(map[string]any{
					"review_stage":     newStage,
					"learn_status":     "learned",
					"last_reviewed_at": &now,
				}).Error; err != nil {
					return err
				}
			}
			advanced++
		}
		return nil
	})
	if err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}

	invalidateLighthouseCacheForUser(user.ID)

	response.SuccessI18n(c, "common.success", gin.H{
		"advanced":  advanced,
		"unchanged": unchanged,
	})
}

func parseLocalDateTime(dateYMD, hm string, loc *time.Location) (time.Time, error) {
	if loc == nil {
		loc = time.Local
	}
	day, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(dateYMD), loc)
	if err != nil {
		return time.Time{}, err
	}
	parts := strings.Split(strings.TrimSpace(hm), ":")
	if len(parts) != 2 {
		return time.Time{}, strconv.ErrSyntax
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return time.Time{}, strconv.ErrSyntax
	}
	return time.Date(day.Year(), day.Month(), day.Day(), h, m, 0, 0, loc), nil
}

// handleStudySessionsPracticeTime PUT /study/sessions/practice-time
// body: { date, startTime, endTime, studentId?, sessionIds? }
func (h *Handlers) handleStudySessionsPracticeTime(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	var body struct {
		Date       string           `json:"date" binding:"required"`
		StartTime  string           `json:"startTime" binding:"required"`
		EndTime    string           `json:"endTime" binding:"required"`
		StudentID  string           `json:"studentId"`
		SessionIDs []utils.JSONUint `json:"sessionIds"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	loc := models.UserReviewLocation(user)
	startLocal, err := parseLocalDateTime(body.Date, body.StartTime, loc)
	if err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	endLocal, err := parseLocalDateTime(body.Date, body.EndTime, loc)
	if err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	if !endLocal.After(startLocal) {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	startUTC := startLocal.UTC()
	endUTC := endLocal.UTC()

	q := db.Model(&models.StudySession{}).
		Where("user_id = ? AND session_type = ? AND status = ?", user.ID, "learn", "completed")

	if len(body.SessionIDs) > 0 {
		ids := make([]uint, 0, len(body.SessionIDs))
		for _, id := range body.SessionIDs {
			if v := id.Uint(); v > 0 {
				ids = append(ids, v)
			}
		}
		q = q.Where("id IN ?", ids)
	} else {
		dayStart, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(body.Date), loc)
		if err != nil {
			response.FailI18n(c, "common.invalid_params", nil)
			return
		}
		q = q.Where("started_at >= ? AND started_at < ?", dayStart.UTC(), dayStart.Add(24*time.Hour).UTC())
	}

	sidStr := strings.TrimSpace(body.StudentID)
	if sidStr != "" {
		sid64, err := strconv.ParseUint(sidStr, 10, 64)
		if err != nil || sid64 == 0 {
			response.FailI18n(c, "coaching.invalid_student_id", nil)
			return
		}
		if uint(sid64) != user.ID {
			if err := coachingTeacherHasStudentPair(db, user.ID, uint(sid64)); err != nil {
				response.AbortWithStatusJSON(c, http.StatusForbidden, err)
				return
			}
		}
		q = q.Where("student_id = ?", uint(sid64))
	} else {
		q = q.Where("student_id = 0")
	}

	var sessions []models.StudySession
	if err := q.Find(&sessions).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	if len(sessions) == 0 {
		response.FailI18n(c, "coaching.session_not_found", nil)
		return
	}

	ids := make([]uint, 0, len(sessions))
	for _, s := range sessions {
		ids = append(ids, s.ID)
	}
	res := db.Model(&models.StudySession{}).
		Where("id IN ?", ids).
		Updates(map[string]any{
			"started_at":   startUTC,
			"completed_at": endUTC,
		})
	if res.Error != nil {
		response.FailI18n(c, "common.operation_failed", res.Error.Error())
		return
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"updated": res.RowsAffected,
		"sessionIds": ids,
	})
}
