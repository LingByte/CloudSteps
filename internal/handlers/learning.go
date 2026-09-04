package handlers

import (
	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/ling-base/apidocs/humax"
	lbconstants "github.com/LingByte/ling-base/common/constants"

	"strconv"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (h *Handlers) registerLearningRoutes(r *humax.Group) {
	learning := r.Group("learning")
	learning.Use(auth.Required)
	{
		learning.POST("/learned", h.handleMarkLearnedWords)
	}

	study := r.Group("study")
	study.Use(auth.Required)
	{
		study.GET("/words", h.handleStudyWords)
		study.GET("/lighthouse", h.handleStudyLighthouse)
		study.GET("/lighthouse/words", h.handleStudyLighthouseWords)
		study.GET("/lighthouse/review-words", h.handleLighthouseReviewWords)
		study.POST("/lighthouse/review-submit", h.handleLighthouseReviewSubmit)
		study.GET("/sessions", h.handleStudySessionsList)
		study.GET("/sessions/export-words", h.handleStudySessionsExportWords)
		study.PUT("/sessions/practice-time", h.handleStudySessionsPracticeTime)
		study.POST("/session/start", h.handleStudySessionStart)
		study.POST("/session/:id/complete", h.handleStudySessionComplete)
		study.GET("/session/:id/report", h.handleStudySessionReport)
		study.GET("/session/:id/report/stream", h.handleStudySessionReportStream)
		study.GET("/session/:id", h.handleStudySessionGet)
	}

	review := r.Group("review")
	review.Use(auth.Required)
	{
		review.GET("/today", h.handleReviewToday)
		review.GET("/books", h.handleReviewBooks)
		review.GET("/books-by-date", h.handleReviewBooksByDate)
		review.GET("/curve", h.handleReviewCurve)
		review.POST("/session/start", h.handleReviewSessionStart)
		review.POST("/session/:id/complete", h.handleReviewSessionComplete)
		review.GET("/session/:id", h.handleReviewSessionGet)

		review.GET("/due", h.handleReviewDue)
		review.POST("/submit", h.handleReviewSubmit)
	}
}

// handleMarkLearnedWords POST /learning/learned
// body: { wordBookId: number, wordIds: number[] }
func (h *Handlers) handleMarkLearnedWords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	var body struct {
		WordBookID uint   `json:"wordBookId" binding:"required"`
		WordIDs    []uint `json:"wordIds" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	if len(body.WordIDs) == 0 {
		response.FailI18n(c, "vocab.word_ids_required", nil)
		return
	}

	now := time.Now().UTC()
	loc := models.UserReviewLocation(user)
	firstDue := models.FirstReviewDueAt(loc)

	// Ensure user selected this wordbook (idempotent)
	uwb := models.UserWordBook{UserID: user.ID, WordBookID: body.WordBookID}
	_ = db.Where(models.UserWordBook{UserID: user.ID, WordBookID: body.WordBookID}).
		Attrs(models.UserWordBook{Status: "active", StartedAt: &now}).
		FirstOrCreate(&uwb).Error

	states := make([]models.UserWordState, 0, len(body.WordIDs))
	queueItems := make([]models.ReviewQueue, 0, len(body.WordIDs))
	for _, wid := range body.WordIDs {
		states = append(states, models.UserWordState{
			UserID:         user.ID,
			WordID:         wid,
			WordBookID:     body.WordBookID,
			LearnStatus:    "learned",
			ReviewStage:    0,
			FirstLearnedAt: &now,
			NextReviewAt:   &firstDue,
		})
		queueItems = append(queueItems, models.ReviewQueue{
			UserID:     user.ID,
			WordID:     wid,
			WordBookID: body.WordBookID,
			DueAt:      firstDue,
			Stage:      0,
			Status:     "pending",
		})
	}

	if err := db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "word_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"word_book_id", "learn_status", "review_stage", "first_learned_at", "next_review_at", "deleted_at"}),
	}).Create(&states).Error; err != nil {
		response.FailI18n(c, "study.save_state_failed", err)
		return
	}

	if err := db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "word_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"word_book_id", "due_at", "stage", "status", "deleted_at"}),
	}).Create(&queueItems).Error; err != nil {
		response.FailI18n(c, "study.write_queue_failed", err)
		return
	}

	response.SuccessI18n(c, "common.success", gin.H{"queued": len(body.WordIDs)})
}

// handleReviewDue GET /review/due?wordBookId=1&limit=20
func (h *Handlers) handleReviewDue(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}
	wordBookID, _ := strconv.Atoi(c.DefaultQuery("wordBookId", "0"))

	now := time.Now().UTC()
	q := db.Model(&models.ReviewQueue{}).
		Where("user_id = ? AND status = ? AND due_at <= ?", user.ID, "pending", now)
	if wordBookID > 0 {
		q = q.Where("word_book_id = ?", wordBookID)
	}

	var items []models.ReviewQueue
	if err := q.Order("due_at ASC, id ASC").Limit(limit).Find(&items).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}

	wordIDs := make([]uint, 0, len(items))
	order := make(map[uint]int, len(items))
	for i, it := range items {
		wordIDs = append(wordIDs, it.WordID)
		order[it.WordID] = i
	}

	var words []models.WordLite
	if len(wordIDs) > 0 {
		if err := db.Where("id IN ?", wordIDs).Find(&words).Error; err != nil {
			response.FailI18n(c, "wordbook.query_word_failed", err)
			return
		}
	}
	models.OverlayWordLites(db, user.ID, words)

	// preserve queue order
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
	})
}

// handleReviewSubmit POST /review/submit
// body: { results: [{ wordId: number, remembered: bool }] }
func (h *Handlers) handleReviewSubmit(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	var body struct {
		Results []struct {
			WordID     uint `json:"wordId" binding:"required"`
			Remembered bool `json:"remembered"`
		} `json:"results" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Results) == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}

	wordIDs := make([]uint, 0, len(body.Results))
	resMap := make(map[uint]bool, len(body.Results))
	for _, r := range body.Results {
		wordIDs = append(wordIDs, r.WordID)
		resMap[r.WordID] = r.Remembered
	}

	now := time.Now().UTC()
	loc := models.UserReviewLocation(user)

	err := db.Transaction(func(tx *gorm.DB) error {
		var items []models.ReviewQueue
		if err := tx.Where("user_id = ? AND word_id IN ? AND status IN ?", user.ID, wordIDs, []string{"pending", "in_session"}).Find(&items).Error; err != nil {
			return err
		}
		itemByWord := make(map[uint]models.ReviewQueue, len(items))
		for _, it := range items {
			itemByWord[it.WordID] = it
		}

		var states []models.UserWordState
		if err := tx.Where("user_id = ? AND word_id IN ?", user.ID, wordIDs).Find(&states).Error; err != nil {
			return err
		}
		stateByWord := make(map[uint]models.UserWordState, len(states))
		for _, s := range states {
			stateByWord[s.WordID] = s
		}

		schedule := models.ReviewScheduleDaysForUser(user)

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
						Where("user_id = ? AND word_id = ?", user.ID, wid).
						Updates(map[string]any{"learn_status": "mastered", "mastered_at": &now, "last_reviewed_at": &now, "next_review_at": nil, "review_stage": newStage}).Error; err != nil {
						return err
					}
					continue
				}

				due, newStage := models.ReviewDueAfterSuccess(now, it.Stage, user.ReviewCurvePreset, anchor, loc)
				if err := tx.Model(&models.ReviewQueue{}).Where("id = ?", it.ID).
					Updates(map[string]any{"due_at": due, "stage": newStage, "status": "pending"}).Error; err != nil {
					return err
				}
				if err := tx.Model(&models.UserWordState{}).
					Where("user_id = ? AND word_id = ?", user.ID, wid).
					Updates(map[string]any{"last_reviewed_at": &now, "next_review_at": &due, "review_stage": newStage}).Error; err != nil {
					return err
				}
			} else {
				due, newStage := models.ReviewDueAfterFail(now, it.Stage, user.ReviewCurvePreset, anchor, loc)
				if err := tx.Model(&models.ReviewQueue{}).Where("id = ?", it.ID).
					Updates(map[string]any{"due_at": due, "stage": newStage, "status": "pending"}).Error; err != nil {
					return err
				}
				if err := tx.Model(&models.UserWordState{}).
					Where("user_id = ? AND word_id = ?", user.ID, wid).
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

	invalidateLighthouseCacheForUser(user.ID)
	response.SuccessI18n(c, "common.success", gin.H{"submitted": len(body.Results)})
}
