package handlers

import (
	"errors"
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

// handleReviewToday GET /review/today?wordBookId=1
func (h *Handlers) handleReviewToday(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	now := time.Now().UTC()
	wordBookID, _ := strconv.Atoi(c.Query("wordBookId"))

	q := db.Model(&models.ReviewQueue{}).
		Where("user_id = ? AND status = ? AND due_at <= ?", user.ID, "pending", now)
	if wordBookID > 0 {
		q = q.Where("word_book_id = ?", wordBookID)
	}

	var items []models.ReviewQueue
	if err := q.Order("due_at ASC, id ASC").Find(&items).Error; err != nil {
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
		_ = db.Where("id IN ?", wordIDs).Find(&words).Error
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

// handleReviewBooks GET /review/books
func (h *Handlers) handleReviewBooks(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
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
		response.Fail(c, "查询失败", err)
		return
	}
	response.Success(c, "success", stats)
}

// handleReviewCurve GET /review/curve
func (h *Handlers) handleReviewCurve(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	type stageCount struct {
		ReviewStage int   `gorm:"column:review_stage"`
		Count      int64 `gorm:"column:cnt"`
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

	stages := make([]gin.H, 0, len(models.EbbinghausIntervals))
	for i, days := range models.EbbinghausIntervals {
		label := ""
		switch i {
		case 0:
			label = "学习"
		default:
			label = strconv.Itoa(days) + "天"
		}
		stages = append(stages, gin.H{"index": i, "days": days, "label": label, "count": countMap[i]})
	}

	response.Success(c, "success", gin.H{
		"stages":   stages,
		"mastered": mastered,
	})
}

// handleReviewSessionStart POST /review/session/start
// body: { wordBookId?: number, wordIds?: number[] }
func (h *Handlers) handleReviewSessionStart(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	now := time.Now().UTC()

	var body struct {
		WordBookID uint   `json:"wordBookId"`
		WordIDs    []uint `json:"wordIds"`
	}
	_ = c.ShouldBindJSON(&body)

	wordIDs := make([]uint, 0)
	var session models.StudySession
	if err := db.Transaction(func(tx *gorm.DB) error {
		if len(body.WordIDs) > 0 {
			// validate + reserve those queue items too
			var items []models.ReviewQueue
			q := tx.Model(&models.ReviewQueue{}).
				Where("user_id = ? AND word_id IN ? AND status = ? AND due_at <= ?", user.ID, body.WordIDs, "pending", now)
			if body.WordBookID > 0 {
				q = q.Where("word_book_id = ?", body.WordBookID)
			}
			if err := q.Clauses(clause.Locking{Strength: "UPDATE"}).Find(&items).Error; err != nil {
				return err
			}
			if len(items) != len(body.WordIDs) {
				return errors.New("存在未到期或不可用的复习单词")
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
		q := tx.Model(&models.ReviewQueue{}).
			Where("user_id = ? AND status = ? AND due_at <= ?", user.ID, "pending", now)
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
		response.Fail(c, "取题失败", err)
		return
	}

	if len(wordIDs) == 0 {
		response.Success(c, "今日无待复习单词", gin.H{"finished": true})
		return
	}

	var words []models.Word
	_ = db.Where("id IN ?", wordIDs).Find(&words).Error

	session = models.StudySession{
		UserID:      user.ID,
		WordBookID:  body.WordBookID,
		SessionType: "review",
		Status:      "in_progress",
		StartedAt:   now,
		WordCount:   len(wordIDs),
	}
	if err := db.Create(&session).Error; err != nil {
		response.Fail(c, "创建复习会话失败", err)
		return
	}

	sw := make([]models.SessionWord, 0, len(wordIDs))
	for _, wid := range wordIDs {
		sw = append(sw, models.SessionWord{SessionID: session.ID, WordID: wid})
	}
	_ = db.Create(&sw).Error

	response.Success(c, "success", gin.H{"sessionId": session.ID, "words": words})
}

// handleReviewSessionComplete POST /review/session/:id/complete
func (h *Handlers) handleReviewSessionComplete(c *gin.Context) {
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
	correct := 0

	// write session_words and reuse queue logic (S1)
	for _, r := range body.Results {
		remembered := r.Remembered
		answeredAt := now
		_ = db.Model(&models.SessionWord{}).
			Where("session_id = ? AND word_id = ?", sessionID, r.WordID).
			Updates(map[string]any{"remembered": &remembered, "answered_at": &answeredAt}).Error

		if remembered {
			correct++
		}
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
				continue
			}
			remembered := resMap[wid]
			if remembered {
				newStage := it.Stage + 1
				if newStage >= len(models.EbbinghausIntervals) {
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
				// If not passed, keep it due today so user can continue reviewing it today.
				due := now
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

	_ = db.Model(&session).Updates(map[string]any{"status": "completed", "completed_at": &now, "correct_count": correct}).Error

	response.Success(c, "success", gin.H{"correctCount": correct, "totalCount": len(body.Results)})
}

// handleReviewSessionGet GET /review/session/:id
func (h *Handlers) handleReviewSessionGet(c *gin.Context) {
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

	response.Success(c, "success", gin.H{"session": session, "words": words})
}
