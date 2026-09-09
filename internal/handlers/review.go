package handlers

import (
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	lbconstants "github.com/LingByte/ling-base/common/constants"

	"github.com/LingByte/CloudStepsGo/internal/models"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type reviewBookStat struct {
	StudentID         uint       `gorm:"column:student_id" json:"studentId"`
	StudentName       string     `gorm:"column:student_name" json:"studentName"`
	SessionID         uint       `gorm:"column:session_id" json:"sessionId"`
	WordBookID        uint       `gorm:"column:word_book_id" json:"wordBookId"`
	Count             int64      `gorm:"column:cnt" json:"cnt"`
	BookName          string     `gorm:"column:name" json:"name"`
	Level             string     `gorm:"column:level" json:"level"`
	PracticeStartedAt *time.Time `gorm:"column:practice_started_at" json:"practiceStartedAt"`
	PracticeEndedAt   *time.Time `gorm:"column:practice_ended_at" json:"practiceEndedAt"`
}

const reviewSessionJoin = `
		LEFT JOIN study_sessions ss ON ss.id = CASE
			WHEN rq.source_session_id > 0 THEN rq.source_session_id
			ELSE (
				SELECT ss2.id FROM study_sessions ss2
				INNER JOIN session_words sw2 ON sw2.session_id = ss2.id AND sw2.word_id = rq.word_id AND sw2.remembered = 1
				WHERE ss2.user_id = rq.user_id AND ss2.word_book_id = rq.word_book_id
				ORDER BY COALESCE(ss2.completed_at, ss2.started_at) DESC, ss2.id DESC
				LIMIT 1
			)
		END
	`

// 抗遗忘列表的「复习对象」必须是 review_queue.user_id（队列真正归属）。
// 不能用 study_sessions.student_id：代练课次上的 student_id 只表示「给谁上课」，
// 若历史数据把词写进了老师队列，按 student_id 挂名会导致列表有词、/today?studentId=学员 → 0 词。
const reviewQueueStudentIDSQL = `rq.user_id`

func coachingStudentIDsForTeacher(db *gorm.DB, teacherID uint) ([]uint, error) {
	var ids []uint
	err := db.Model(&models.StudentTeacherCoachingQuota{}).
		Where("teacher_id = ?", teacherID).
		Pluck("student_id", &ids).Error
	return ids, err
}

func mergeUintIDs(parts ...[]uint) []uint {
	seen := make(map[uint]struct{})
	out := make([]uint, 0)
	for _, part := range parts {
		for _, id := range part {
			if id == 0 {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			out = append(out, id)
		}
	}
	return out
}

func reviewResolveTargetUser(db *gorm.DB, actor *models.User, studentIDRaw string) (*models.User, error) {
	if actor == nil {
		return nil, errors.New("未登录")
	}
	sidStr := strings.TrimSpace(studentIDRaw)
	if sidStr == "" {
		return actor, nil
	}
	sid64, err := strconv.ParseUint(sidStr, 10, 64)
	if err != nil || sid64 == 0 {
		return nil, errors.New("invalid student")
	}
	if uint(sid64) == actor.ID {
		return actor, nil
	}
	if !coachingIsTeacherRole(actor) && !actor.IsAdmin() {
		return nil, errors.New("无权查看该学员或尚未建立陪练关系")
	}
	if err := coachingTeacherHasStudentPair(db, actor.ID, uint(sid64)); err != nil {
		return nil, err
	}
	var student models.User
	if err := db.First(&student, sid64).Error; err != nil {
		return nil, err
	}
	return &student, nil
}

func reviewBooksByDateForUsers(db *gorm.DB, userIDs []uint, dayStart, dayEnd time.Time, loc *time.Location, isSelectedToday bool) ([]reviewBookStat, error) {
	if len(userIDs) == 0 {
		return []reviewBookStat{}, nil
	}
	if loc == nil {
		loc = time.FixedZone("CST", 8*3600)
	}

	type pendingRow struct {
		UserID            uint       `gorm:"column:user_id"`
		WordID            uint       `gorm:"column:word_id"`
		WordBookID        uint       `gorm:"column:word_book_id"`
		Stage             int        `gorm:"column:stage"`
		DueAt             time.Time  `gorm:"column:due_at"`
		StudentID         uint       `gorm:"column:student_id"`
		StudentName       string     `gorm:"column:student_name"`
		SessionID         uint       `gorm:"column:session_id"`
		BookName          string     `gorm:"column:name"`
		Level             string     `gorm:"column:level"`
		PracticeStartedAt *time.Time `gorm:"column:practice_started_at"`
		PracticeEndedAt   *time.Time `gorm:"column:practice_ended_at"`
		FirstLearnedAt    *time.Time `gorm:"column:first_learned_at"`
	}

	studentIDExpr := reviewQueueStudentIDSQL
	q := `
		SELECT rq.user_id, rq.word_id, rq.word_book_id, rq.stage, rq.due_at,
			` + studentIDExpr + ` AS student_id,
			COALESCE(NULLIF(TRIM(u.display_name), ''), u.username, u.email, '') AS student_name,
			COALESCE(ss.id, 0) AS session_id,
			wb.name, wb.level,
			ss.started_at AS practice_started_at,
			ss.completed_at AS practice_ended_at,
			uws.first_learned_at
		FROM review_queue rq
		JOIN word_books wb ON wb.id = rq.word_book_id
		` + reviewSessionJoin + `
		JOIN users u ON u.id = ` + studentIDExpr + `
		LEFT JOIN user_word_states uws ON uws.user_id = rq.user_id AND uws.word_id = rq.word_id
		WHERE rq.user_id IN ? AND rq.status = 'pending'
	`
	var rows []pendingRow
	if err := db.Raw(q, userIDs).Scan(&rows).Error; err != nil {
		return nil, err
	}

	presetIDs := make([]uint, 0, len(rows))
	seenPreset := map[uint]struct{}{}
	for _, r := range rows {
		id := r.StudentID
		if id == 0 {
			id = r.UserID
		}
		if _, ok := seenPreset[id]; ok {
			continue
		}
		seenPreset[id] = struct{}{}
		presetIDs = append(presetIDs, id)
	}
	presetByUser := map[uint]string{}
	if len(presetIDs) > 0 {
		var users []models.User
		if err := db.Select("id, review_curve_preset").Where("id IN ?", presetIDs).Find(&users).Error; err != nil {
			return nil, err
		}
		for _, u := range users {
			presetByUser[u.ID] = string(models.NormalizeReviewCurvePreset(u.ReviewCurvePreset))
		}
	}

	type aggKey struct {
		StudentID  uint
		WordBookID uint
	}
	type aggVal struct {
		stat  reviewBookStat
		words map[uint]struct{}
	}
	aggs := map[aggKey]*aggVal{}

	dayEndUTC := dayEnd.In(loc)
	_ = dayEndUTC
	for _, r := range rows {
		presetOwner := r.StudentID
		if presetOwner == 0 {
			presetOwner = r.UserID
		}
		preset := presetByUser[presetOwner]
		if preset == "" {
			preset = string(models.ReviewCurveTimes5)
		}

		anchor := r.DueAt
		if r.FirstLearnedAt != nil && !r.FirstLearnedAt.IsZero() {
			anchor = *r.FirstLearnedAt
		} else if r.PracticeStartedAt != nil && !r.PracticeStartedAt.IsZero() {
			anchor = *r.PracticeStartedAt
		}

		onPlan := models.ReviewRemainingDueFallsOnDay(anchor, r.Stage, preset, dayStart, loc)
		// 今天：额外纳入已到期/逾期（due_at < 明日 0 点），与可开始复习口径一致
		overdueToday := isSelectedToday && r.DueAt.Before(dayEnd)
		if !onPlan && !overdueToday {
			continue
		}

		key := aggKey{StudentID: r.StudentID, WordBookID: r.WordBookID}
		cur, ok := aggs[key]
		if !ok {
			cur = &aggVal{
				stat: reviewBookStat{
					StudentID:         r.StudentID,
					StudentName:       r.StudentName,
					SessionID:         r.SessionID,
					WordBookID:        r.WordBookID,
					BookName:          r.BookName,
					Level:             r.Level,
					PracticeStartedAt: r.PracticeStartedAt,
					PracticeEndedAt:   r.PracticeEndedAt,
				},
				words: map[uint]struct{}{},
			}
			aggs[key] = cur
		}
		// 合并同一学员同词库的多节课：取最早开始、最晚结束
		if r.PracticeStartedAt != nil {
			if cur.stat.PracticeStartedAt == nil || r.PracticeStartedAt.Before(*cur.stat.PracticeStartedAt) {
				cur.stat.PracticeStartedAt = r.PracticeStartedAt
			}
		}
		if r.PracticeEndedAt != nil {
			if cur.stat.PracticeEndedAt == nil || r.PracticeEndedAt.After(*cur.stat.PracticeEndedAt) {
				cur.stat.PracticeEndedAt = r.PracticeEndedAt
			}
		}
		cur.words[r.WordID] = struct{}{}
	}

	stats := make([]reviewBookStat, 0, len(aggs))
	for _, v := range aggs {
		v.stat.Count = int64(len(v.words))
		stats = append(stats, v.stat)
	}
	sort.Slice(stats, func(i, j int) bool {
		a, b := stats[i], stats[j]
		if a.StudentName != b.StudentName {
			return a.StudentName < b.StudentName
		}
		at, bt := time.Time{}, time.Time{}
		if a.PracticeStartedAt != nil {
			at = *a.PracticeStartedAt
		}
		if b.PracticeStartedAt != nil {
			bt = *b.PracticeStartedAt
		}
		if !at.Equal(bt) {
			return at.After(bt)
		}
		return a.WordBookID < b.WordBookID
	})

	if stats == nil {
		stats = []reviewBookStat{}
	}
	return stats, nil
}

// handleReviewToday GET /review/today?wordBookId=1&date=YYYY-MM-DD&timeZone=Asia/Shanghai&all=true
// 取词口径与 /review/books-by-date 对齐：今日含逾期至本地明日 0 点前；其它日仅该日 due。
// all=true 时忽略日期，返回所有已学待复习单词（不限 due_at）。
func (h *Handlers) handleReviewToday(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}
	targetUser, err := reviewResolveTargetUser(db, user, c.Query("studentId"))
	if err != nil {
		response.AbortWithStatusJSON(c, http.StatusForbidden, err)
		return
	}

	wordBookID := parseQueryUintID(c.Query("wordBookId"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if limit <= 0 || limit > 500 {
		limit = 100
	}

	// all=true：返回所有已学待复习单词（不限 due_at）
	allMode := c.Query("all") == "true"

	tzName := c.DefaultQuery("timeZone", "Asia/Shanghai")
	loc, err := time.LoadLocation(tzName)
	if err != nil {
		loc = time.FixedZone("CST", 8*3600)
	}

	nowLocal := time.Now().In(loc)
	todayStart := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day(), 0, 0, 0, 0, loc)

	dateStr := strings.TrimSpace(c.Query("date"))
	dayStart := todayStart
	if dateStr != "" {
		parsed, perr := time.ParseInLocation("2006-01-02", dateStr, loc)
		if perr != nil {
			response.FailI18n(c, "coaching.invalid_date", nil)
			return
		}
		dayStart = time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, loc)
	}
	dayEnd := dayStart.Add(24 * time.Hour)
	isSelectedToday := dayStart.Equal(todayStart)

	studySessionID := parseQueryUintID(c.Query("studySessionId"))

	q := db.Model(&models.ReviewQueue{}).
		Where("user_id = ? AND status = ?", targetUser.ID, "pending")
	if wordBookID > 0 {
		q = q.Where("word_book_id = ?", wordBookID)
	}
	if studySessionID > 0 {
		q = q.Where(
			"source_session_id = ? OR (source_session_id = 0 AND word_id IN (SELECT word_id FROM session_words WHERE session_id = ? AND remembered = 1))",
			studySessionID, studySessionID,
		)
	}
	if !allMode && isSelectedToday {
		// 今天：可开始复习 = 已到期/逾期
		q = q.Where("due_at < ?", dayEnd)
	}

	var items []models.ReviewQueue
	fetchLimit := limit
	if !allMode && !isSelectedToday {
		fetchLimit = 2000 // 非今日：先拉 pending 再按曲线投影过滤
	}
	if err := q.Order("due_at ASC, id ASC").Limit(fetchLimit).Find(&items).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}

	if !allMode && !isSelectedToday && len(items) > 0 {
		preset := string(models.NormalizeReviewCurvePreset(targetUser.ReviewCurvePreset))
		wordIDsAll := make([]uint, 0, len(items))
		for _, it := range items {
			wordIDsAll = append(wordIDsAll, it.WordID)
		}
		type learnedAtRow struct {
			WordID         uint       `gorm:"column:word_id"`
			FirstLearnedAt *time.Time `gorm:"column:first_learned_at"`
		}
		var learned []learnedAtRow
		_ = db.Model(&models.UserWordState{}).
			Select("word_id, first_learned_at").
			Where("user_id = ? AND word_id IN ?", targetUser.ID, wordIDsAll).
			Scan(&learned).Error
		learnedMap := map[uint]*time.Time{}
		for _, r := range learned {
			learnedMap[r.WordID] = r.FirstLearnedAt
		}
		filtered := make([]models.ReviewQueue, 0, len(items))
		for _, it := range items {
			anchor := it.DueAt
			if t := learnedMap[it.WordID]; t != nil && !t.IsZero() {
				anchor = *t
			}
			if models.ReviewRemainingDueFallsOnDay(anchor, it.Stage, preset, dayStart, loc) {
				filtered = append(filtered, it)
			}
		}
		if len(filtered) > limit {
			filtered = filtered[:limit]
		}
		items = filtered
	}

	wordIDs := make([]uint, 0, len(items))
	order := make(map[uint]int, len(items))
	for i, it := range items {
		wordIDs = append(wordIDs, it.WordID)
		order[it.WordID] = i
	}

	var words []models.WordLite
	if len(wordIDs) > 0 {
		_ = db.Where("id IN ?", wordIDs).Find(&words).Error
	}
	models.OverlayWordLites(db, targetUser.ID, words)

	sorted := make([]models.WordLite, 0, len(words))
	tmp := make([]*models.WordLite, len(items))
	for i := range words {
		w := words[i]
		idx, ok := order[w.ID]
		if !ok {
			continue
		}
		ww := w
		tmp[idx] = &ww
	}
	for _, p := range tmp {
		if p != nil {
			sorted = append(sorted, *p)
		}
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"total": len(sorted),
		"words": sorted,
		"date":  dayStart.Format("2006-01-02"),
	})
}

// handleReviewBooks GET /review/books
func (h *Handlers) handleReviewBooks(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	now := time.Now().UTC()

	type bookStat struct {
		WordBookID uint   `gorm:"column:word_book_id" json:"wordBookId"`
		Count      int64  `gorm:"column:cnt" json:"cnt"`
		BookName   string `gorm:"column:name" json:"name"`
		Level      string `gorm:"column:level" json:"level"`
	}
	var stats []bookStat

	err := db.Raw(`
		SELECT rq.word_book_id, COUNT(*) as cnt, wb.name, wb.level
		FROM review_queue rq
		JOIN word_books wb ON wb.id = rq.word_book_id
		WHERE rq.user_id = ? AND rq.status = 'pending' AND rq.due_at <= ?
		GROUP BY rq.word_book_id, wb.name, wb.level
	`, user.ID, now).Scan(&stats).Error
	if err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	response.SuccessI18n(c, "common.success", stats)
}

// handleReviewBooksByDate GET /review/books-by-date?date=2006-01-02&timeZone=Asia/Shanghai
// 按「用户时区下的自然日」统计该日复习计划（按词库分组）。
// 以开课日锚点 + 抗遗忘曲线投影剩余次数；今天额外包含已到期/逾期项。
func (h *Handlers) handleReviewBooksByDate(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	dateStr := c.Query("date")
	if dateStr == "" {
		response.FailI18n(c, "coaching.date_required", nil)
		return
	}

	tzName := c.DefaultQuery("timeZone", "Asia/Shanghai")
	loc, err := time.LoadLocation(tzName)
	if err != nil {
		loc = time.FixedZone("CST", 8*3600)
	}

	dayStart, err := time.ParseInLocation("2006-01-02", dateStr, loc)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_date", nil)
		return
	}
	dayStart = time.Date(dayStart.Year(), dayStart.Month(), dayStart.Day(), 0, 0, 0, 0, loc)
	dayEnd := dayStart.Add(24 * time.Hour)

	now := time.Now().In(loc)
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	isSelectedToday := dayStart.Equal(todayStart)

	userIDs := []uint{user.ID}
	if coachingIsTeacherRole(user) {
		studentIDs, err := coachingStudentIDsForTeacher(db, user.ID)
		if err != nil {
			response.FailI18n(c, "common.query_failed", err)
			return
		}
		userIDs = mergeUintIDs([]uint{user.ID}, studentIDs)
	}

	stats, err := reviewBooksByDateForUsers(db, userIDs, dayStart, dayEnd, loc, isSelectedToday)
	if err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	if stats == nil {
		stats = []reviewBookStat{}
	}
	response.SuccessI18n(c, "common.success", stats)
}

// handleReviewCurve GET /review/curve
func (h *Handlers) handleReviewCurve(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	type stageCount struct {
		ReviewStage int   `gorm:"column:review_stage"`
		Count       int64 `gorm:"column:cnt"`
	}
	var rows []stageCount
	_ = db.Model(&models.UserWordState{}).
		Select("review_stage, COUNT(*) as cnt").
		Where("user_id = ? AND learn_status IN ?", user.ID, []string{"learning", "learned", "mastered"}).
		Group("review_stage").
		Scan(&rows).Error

	countMap := map[int]int64{}
	for _, r := range rows {
		countMap[r.ReviewStage] = r.Count
	}

	var mastered int64
	_ = db.Model(&models.UserWordState{}).Where("user_id = ? AND learn_status = ?", user.ID, "mastered").Count(&mastered).Error

	stages := make([]gin.H, 0)
	schedule := models.ReviewScheduleDaysForUser(user)
	for i, dayNum := range schedule {
		stages = append(stages, gin.H{
			"index": i,
			"days":  dayNum,
			"label": models.ReviewDayLabel(dayNum),
			"count": countMap[i],
		})
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"stages":            stages,
		"mastered":          mastered,
		"reviewCurvePreset": models.NormalizeReviewCurvePreset(user.ReviewCurvePreset),
		"presetLabel":       models.ReviewCurvePresetLabel(user.ReviewCurvePreset),
		"intervals":         schedule,
		"scheduleDays":      schedule,
	})
}

// handleReviewSessionStart POST /review/session/start
// body: { wordBookId?: number, wordIds?: number[] }
func (h *Handlers) handleReviewSessionStart(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	now := time.Now().UTC()

	var body struct {
		WordBookID uint   `json:"wordBookId"`
		WordIDs    []uint `json:"wordIds"`
		StudentID  string `json:"studentId"`
	}
	_ = c.ShouldBindJSON(&body)

	targetUser, err := reviewResolveTargetUser(db, user, body.StudentID)
	if err != nil {
		response.AbortWithStatusJSON(c, http.StatusForbidden, err)
		return
	}

	wordIDs := make([]uint, 0)
	var session models.StudySession
	if err := db.Transaction(func(tx *gorm.DB) error {
		if len(body.WordIDs) > 0 {
			// 显式 wordIds：只校验 pending，不再卡 due_at<=now（与抗遗忘列表日期口径一致）
			var items []models.ReviewQueue
			q := tx.Model(&models.ReviewQueue{}).
				Where("user_id = ? AND word_id IN ? AND status = ?", targetUser.ID, body.WordIDs, "pending")
			if body.WordBookID > 0 {
				q = q.Where("word_book_id = ?", body.WordBookID)
			}
			if err := q.Clauses(clause.Locking{Strength: "UPDATE"}).Find(&items).Error; err != nil {
				return err
			}
			if len(items) != len(body.WordIDs) {
				return errors.New("存在不可用的复习单词（可能已完成或不在队列）")
			}
			ids := make([]uint, 0, len(items))
			for _, it := range items {
				ids = append(ids, it.ID)
				wordIDs = append(wordIDs, it.WordID)
			}
			if err := tx.Model(&models.ReviewQueue{}).
				Where("id IN ?", ids).
				Update("status", "in_session").Error; err != nil {
				return err
			}

			// IMPORTANT: when wordIds are explicitly provided, we only start a session with those.
			// Do NOT auto-pick extra due words.
			return nil
		}
		// 未指定词：取「本地今日应复习」（含逾期），与 books-by-date /today 对齐
		loc := time.Local
		nowLocal := time.Now().In(loc)
		dayEnd := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day(), 0, 0, 0, 0, loc).Add(24 * time.Hour)
		q := tx.Model(&models.ReviewQueue{}).
			Where("user_id = ? AND status = ? AND due_at < ?", targetUser.ID, "pending", dayEnd)
		if body.WordBookID > 0 {
			q = q.Where("word_book_id = ?", body.WordBookID)
		}
		var items []models.ReviewQueue
		if err := q.Clauses(clause.Locking{Strength: "UPDATE"}).
			Order("due_at ASC, id ASC").Limit(20).Find(&items).Error; err != nil {
			return err
		}
		if len(items) == 0 {
			return nil
		}
		ids := make([]uint, 0, len(items))
		for _, it := range items {
			ids = append(ids, it.ID)
			wordIDs = append(wordIDs, it.WordID)
		}
		if err := tx.Model(&models.ReviewQueue{}).
			Where("id IN ?", ids).
			Update("status", "in_session").Error; err != nil {
			return err
		}
		return nil
	}); err != nil {
		response.FailI18n(c, "reading.fetch_questions_failed", err)
		return
	}

	if len(wordIDs) == 0 {
		response.SuccessI18n(c, "study.no_review_today", gin.H{"finished": true})
		return
	}

	var words []models.WordLite
	_ = db.Where("id IN ?", wordIDs).Find(&words).Error
	models.OverlayWordLites(db, targetUser.ID, words)

	sessionStudentID := uint(0)
	if targetUser.ID != user.ID {
		sessionStudentID = targetUser.ID
	}
	session = models.StudySession{
		UserID:      targetUser.ID,
		StudentID:   sessionStudentID,
		WordBookID:  body.WordBookID,
		SessionType: "review",
		Status:      "in_progress",
		StartedAt:   now,
		WordCount:   len(wordIDs),
	}
	if err := db.Create(&session).Error; err != nil {
		response.FailI18n(c, "study.create_session_failed", err)
		return
	}

	sw := make([]models.SessionWord, 0, len(wordIDs))
	for _, wid := range wordIDs {
		sw = append(sw, models.SessionWord{SessionID: session.ID, WordID: wid})
	}
	_ = db.Create(&sw).Error

	response.SuccessI18n(c, "common.success", gin.H{"sessionId": session.ID, "words": words})
}

// handleReviewSessionComplete POST /review/session/:id/complete
func (h *Handlers) handleReviewSessionComplete(c *gin.Context) {
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
	if err := db.First(&session, sessionID).Error; err != nil {
		response.FailI18n(c, "coaching.session_not_found", err)
		return
	}
	if session.UserID != user.ID {
		if !coachingIsTeacherRole(user) && !user.IsAdmin() {
			response.FailI18n(c, "coaching.session_not_found", nil)
			return
		}
		if err := coachingTeacherHasStudentPair(db, user.ID, session.UserID); err != nil {
			response.AbortWithStatusJSON(c, http.StatusForbidden, err)
			return
		}
	}
	targetUser := user
	if session.UserID != user.ID {
		var owner models.User
		if err := db.First(&owner, session.UserID).Error; err != nil {
			response.FailI18n(c, "coaching.session_not_found", err)
			return
		}
		targetUser = &owner
	}

	now := time.Now().UTC()
	correct := 0

	// 批量更新 session_words（替代逐行循环 UPDATE）
	rememberedIDs := make([]uint, 0, len(body.Results))
	forgotIDs := make([]uint, 0, len(body.Results))
	for _, r := range body.Results {
		if r.Remembered {
			rememberedIDs = append(rememberedIDs, r.WordID)
			correct++
		} else {
			forgotIDs = append(forgotIDs, r.WordID)
		}
	}
	t := true
	if len(rememberedIDs) > 0 {
		_ = db.Model(&models.SessionWord{}).
			Where("session_id = ? AND word_id IN ?", sessionID, rememberedIDs).
			Updates(map[string]any{"remembered": &t, "answered_at": &now}).Error
	}
	f := false
	if len(forgotIDs) > 0 {
		_ = db.Model(&models.SessionWord{}).
			Where("session_id = ? AND word_id IN ?", sessionID, forgotIDs).
			Updates(map[string]any{"remembered": &f, "answered_at": &now}).Error
	}

	// Use existing /review/submit logic for queue+state update
	// Build request and call handler function directly would require copying context;
	// so we re-run the core logic here by updating queue/state per word.
	//
	wordIDs := make([]uint, 0, len(body.Results))
	resMap := make(map[uint]bool, len(body.Results))
	for _, r := range body.Results {
		wordIDs = append(wordIDs, r.WordID)
		resMap[r.WordID] = r.Remembered
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		var items []models.ReviewQueue
		if err := tx.Where("user_id = ? AND word_id IN ? AND status IN ?", targetUser.ID, wordIDs, []string{"pending", "in_session"}).Find(&items).Error; err != nil {
			return err
		}
		itemByWord := make(map[uint]models.ReviewQueue, len(items))
		for _, it := range items {
			itemByWord[it.WordID] = it
		}

		var states []models.UserWordState
		if err := tx.Where("user_id = ? AND word_id IN ?", targetUser.ID, wordIDs).Find(&states).Error; err != nil {
			return err
		}
		stateByWord := make(map[uint]models.UserWordState, len(states))
		for _, s := range states {
			stateByWord[s.WordID] = s
		}

		loc := models.UserReviewLocation(targetUser)
		schedule := models.ReviewScheduleDaysForUser(targetUser)

		for _, wid := range wordIDs {
			it, ok := itemByWord[wid]
			if !ok {
				continue
			}
			st := stateByWord[wid]
			anchor := models.ReviewAnchorFromState(&st, now)
			remembered := resMap[wid]
			if remembered {
				newStage := it.Stage + 1
				if newStage >= len(schedule) {
					if err := tx.Where("id = ?", it.ID).Delete(&models.ReviewQueue{}).Error; err != nil {
						return err
					}
					if err := tx.Model(&models.UserWordState{}).
						Where("user_id = ? AND word_id = ?", targetUser.ID, wid).
						Updates(map[string]any{"learn_status": "mastered", "mastered_at": &now, "last_reviewed_at": &now, "next_review_at": nil, "review_stage": newStage}).Error; err != nil {
						return err
					}
					continue
				}

				due, newStage := models.ReviewDueAfterSuccess(now, it.Stage, targetUser.ReviewCurvePreset, anchor, loc)
				if err := tx.Model(&models.ReviewQueue{}).Where("id = ?", it.ID).
					Updates(map[string]any{"due_at": due, "stage": newStage, "status": "pending"}).Error; err != nil {
					return err
				}
				if err := tx.Model(&models.UserWordState{}).
					Where("user_id = ? AND word_id = ?", targetUser.ID, wid).
					Updates(map[string]any{"last_reviewed_at": &now, "next_review_at": &due, "review_stage": newStage}).Error; err != nil {
					return err
				}
			} else {
				due, newStage := models.ReviewDueAfterFail(now, it.Stage, targetUser.ReviewCurvePreset, anchor, loc)
				if err := tx.Model(&models.ReviewQueue{}).Where("id = ?", it.ID).
					Updates(map[string]any{"due_at": due, "stage": newStage, "status": "pending"}).Error; err != nil {
					return err
				}
				if err := tx.Model(&models.UserWordState{}).
					Where("user_id = ? AND word_id = ?", targetUser.ID, wid).
					Updates(map[string]any{"last_reviewed_at": &now, "next_review_at": &due, "review_stage": newStage, "learn_status": "learning"}).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}

	// 未提交的会话单词释放回 pending，当天仍可继续复习
	var sessionWordIDs []uint
	_ = db.Model(&models.SessionWord{}).Where("session_id = ?", sessionID).Pluck("word_id", &sessionWordIDs).Error
	if len(sessionWordIDs) > 0 {
		submitted := make(map[uint]bool, len(wordIDs))
		for _, id := range wordIDs {
			submitted[id] = true
		}
		releaseIDs := make([]uint, 0)
		for _, id := range sessionWordIDs {
			if !submitted[id] {
				releaseIDs = append(releaseIDs, id)
			}
		}
		if len(releaseIDs) > 0 {
			_ = db.Model(&models.ReviewQueue{}).
				Where("user_id = ? AND word_id IN ? AND status = ?", targetUser.ID, releaseIDs, "in_session").
				Update("status", "pending").Error
		}
	}

	_ = db.Model(&session).Updates(map[string]any{"status": "completed", "completed_at": &now, "correct_count": correct}).Error
	invalidateLighthouseCacheForUser(targetUser.ID)

	response.SuccessI18n(c, "common.success", gin.H{"correctCount": correct, "totalCount": len(body.Results)})
}

// handleReviewSessionGet GET /review/session/:id
func (h *Handlers) handleReviewSessionGet(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	sessionID, _ := strconv.Atoi(c.Param("id"))
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	var session models.StudySession
	if err := db.Where("id = ? AND user_id = ?", sessionID, user.ID).First(&session).Error; err != nil {
		response.FailI18n(c, "coaching.session_not_found", err)
		return
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
	models.OverlayWordLites(db, user.ID, words)

	response.SuccessI18n(c, "common.success", gin.H{"session": session, "words": words})
}
