package handlers

import (
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

func (h *Handlers) registerLearningRoutes(r *gin.RouterGroup) {
	learning := r.Group("learning")
	learning.Use(models.AuthRequired)
	{
		learning.POST("/learned", h.handleMarkLearnedWords)
	}

	study := r.Group("study")
	study.Use(models.AuthRequired)
	{
		study.GET("/words", h.handleStudyWords)
		study.GET("/lighthouse", h.handleStudyLighthouse)
		study.GET("/lighthouse/words", h.handleStudyLighthouseWords)
		study.POST("/session/start", h.handleStudySessionStart)
		study.POST("/session/:id/complete", h.handleStudySessionComplete)
		study.GET("/session/:id", h.handleStudySessionGet)
	}

	review := r.Group("review")
	review.Use(models.AuthRequired)
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
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	var body struct {
		WordBookID uint   `json:"wordBookId" binding:"required"`
		WordIDs    []uint `json:"wordIds" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误"})
		return
	}
	if len(body.WordIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "wordIds 不能为空"})
		return
	}

	now := time.Now().UTC()

	// Ensure user selected this wordbook (idempotent)
	uwb := models.UserWordBook{UserID: user.ID, WordBookID: body.WordBookID}
	_ = db.Where(models.UserWordBook{UserID: user.ID, WordBookID: body.WordBookID}).
		Attrs(models.UserWordBook{Status: "active", StartedAt: &now}).
		FirstOrCreate(&uwb).Error

	states := make([]models.UserWordState, 0, len(body.WordIDs))
	queueItems := make([]models.ReviewQueue, 0, len(body.WordIDs))
	for _, wid := range body.WordIDs {
		states = append(states, models.UserWordState{
			UserID:        user.ID,
			WordID:        wid,
			WordBookID:    body.WordBookID,
			LearnStatus:   "learned",
			ReviewStage:   0,
			FirstLearnedAt: &now,
			NextReviewAt:   &now,
		})
		queueItems = append(queueItems, models.ReviewQueue{
			UserID:     user.ID,
			WordID:     wid,
			WordBookID: body.WordBookID,
			DueAt:      now,
			Stage:      0,
			Status:     "pending",
		})
	}

	if err := db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "word_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"word_book_id", "learn_status", "review_stage", "first_learned_at", "next_review_at"}),
	}).Create(&states).Error; err != nil {
		response.Fail(c, "保存学习状态失败", err)
		return
	}

	if err := db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "word_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"word_book_id", "due_at", "stage", "status"}),
	}).Create(&queueItems).Error; err != nil {
		response.Fail(c, "写入复习队列失败", err)
		return
	}

	response.Success(c, "success", gin.H{"queued": len(body.WordIDs)})
}

// handleReviewDue GET /review/due?wordBookId=1&limit=20
func (h *Handlers) handleReviewDue(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
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
		response.Fail(c, "查询失败", err)
		return
	}

	wordIDs := make([]uint, 0, len(items))
	order := make(map[uint]int, len(items))
	for i, it := range items {
		wordIDs = append(wordIDs, it.WordID)
		order[it.WordID] = i
	}

	var words []models.Word
	if len(wordIDs) > 0 {
		if err := db.Where("id IN ?", wordIDs).Find(&words).Error; err != nil {
			response.Fail(c, "查询单词失败", err)
			return
		}
	}

	// preserve queue order
	sorted := make([]models.Word, 0, len(words))
	tmp := make([]*models.Word, len(items))
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

	response.Success(c, "success", gin.H{
		"total": len(sorted),
		"words": sorted,
	})
}

// handleReviewSubmit POST /review/submit
// body: { results: [{ wordId: number, remembered: bool }] }
func (h *Handlers) handleReviewSubmit(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	var body struct {
		Results []struct {
			WordID     uint `json:"wordId" binding:"required"`
			Remembered bool `json:"remembered"`
		} `json:"results" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Results) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误"})
		return
	}

	wordIDs := make([]uint, 0, len(body.Results))
	resMap := make(map[uint]bool, len(body.Results))
	for _, r := range body.Results {
		wordIDs = append(wordIDs, r.WordID)
		resMap[r.WordID] = r.Remembered
	}

	now := time.Now().UTC()

	err := db.Transaction(func(tx *gorm.DB) error {
		var items []models.ReviewQueue
		if err := tx.Where("user_id = ? AND word_id IN ? AND status IN ?", user.ID, wordIDs, []string{"pending", "in_session"}).Find(&items).Error; err != nil {
			return err
		}
		itemByWord := make(map[uint]models.ReviewQueue, len(items))
		for _, it := range items {
			itemByWord[it.WordID] = it
		}

		for _, wid := range wordIDs {
			it, ok := itemByWord[wid]
			if !ok {
				// no queue item, ignore
				continue
			}
			remembered := resMap[wid]
			if remembered {
				newStage := it.Stage + 1
				if newStage >= len(models.EbbinghausIntervals) {
					// mastered: remove queue
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

				due := now.AddDate(0, 0, models.EbbinghausIntervals[newStage])
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
				// S1: fixed retry tomorrow, stage unchanged
				due := now.AddDate(0, 0, 1)
				if err := tx.Model(&models.ReviewQueue{}).Where("id = ?", it.ID).
					Updates(map[string]any{"due_at": due, "status": "pending"}).Error; err != nil {
					return err
				}
				if err := tx.Model(&models.UserWordState{}).
					Where("user_id = ? AND word_id = ?", user.ID, wid).
					Updates(map[string]any{"last_reviewed_at": &now, "next_review_at": &due}).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})

	if err != nil {
		response.Fail(c, "提交失败", err)
		return
	}

	response.Success(c, "success", gin.H{"submitted": len(body.Results)})
}
