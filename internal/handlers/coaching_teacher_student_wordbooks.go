package handlers

import (
	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	lbconstants "github.com/LingByte/ling-base/common/constants"

	"net/http"
	"strconv"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/utils"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type teacherStudentWordBookItem struct {
	ID        uint   `json:"id"` // word book id
	Name      string `json:"name"`
	WordCount int    `json:"wordCount"`
}

func coachingParseStudentID(c *gin.Context) (uint, bool) {
	sid64, err := strconv.ParseUint(c.Param("studentId"), 10, 64)
	if err != nil || sid64 == 0 {
		response.FailI18n(c, "coaching.invalid_student_id", nil)
		return 0, false
	}
	return uint(sid64), true
}

func (h *Handlers) coachingTeacherListStudentWordBooks(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	sid, ok := coachingParseStudentID(c)
	if !ok {
		return
	}
	if err := coachingTeacherHasStudentPair(db, tid, sid); err != nil {
		response.AbortWithStatusJSON(c, http.StatusForbidden, err)
		return
	}

	var links []models.UserWordBook
	if err := db.Where("user_id = ?", sid).
		Order("id ASC").
		Find(&links).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	if len(links) == 0 {
		response.SuccessI18n(c, "common.ok", gin.H{"list": []teacherStudentWordBookItem{}})
		return
	}

	ids := make([]uint, 0, len(links))
	for _, l := range links {
		ids = append(ids, l.WordBookID)
	}
	var books []models.WordBook
	_ = db.Select("id", "name", "word_count").
		Where("id IN ?", ids).
		Find(&books).Error
	byID := make(map[uint]models.WordBook, len(books))
	for _, b := range books {
		byID[b.ID] = b
	}

	out := make([]teacherStudentWordBookItem, 0, len(links))
	for _, l := range links {
		b, ok := byID[l.WordBookID]
		name := ""
		wc := 0
		if ok {
			name = b.Name
			wc = b.WordCount
		} else {
			name = "词库 #" + strconv.FormatUint(uint64(l.WordBookID), 10)
		}
		out = append(out, teacherStudentWordBookItem{
			ID:        l.WordBookID,
			Name:      name,
			WordCount: wc,
		})
	}
	response.SuccessI18n(c, "common.ok", gin.H{"list": out})
}

func (h *Handlers) coachingTeacherAddStudentWordBook(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	sid, ok := coachingParseStudentID(c)
	if !ok {
		return
	}
	if err := coachingTeacherHasStudentPair(db, tid, sid); err != nil {
		response.AbortWithStatusJSON(c, http.StatusForbidden, err)
		return
	}

	var body struct {
		WordBookID utils.JSONUint `json:"wordBookId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.WordBookID == 0 {
		response.FailI18n(c, "wordbook.invalid_id", nil)
		return
	}
	wbID := body.WordBookID.Uint()
	book, err := models.GetWordBookByID(db, wbID)
	if err != nil {
		response.FailI18n(c, "wordbook.not_found", err.Error())
		return
	}
	if book.OwnerUserID > 0 && book.OwnerUserID != tid {
		response.FailI18n(c, "wordbook.no_access", nil)
		return
	}

	now := time.Now().UTC()
	var uwb models.UserWordBook
	err = db.Where("user_id = ? AND word_book_id = ?", sid, wbID).First(&uwb).Error
	if err == gorm.ErrRecordNotFound {
		uwb = models.UserWordBook{
			UserID:     sid,
			WordBookID: wbID,
			Status:     "active",
			StartedAt:  &now,
		}
		if err := db.Create(&uwb).Error; err != nil {
			response.FailI18n(c, "wordbook.add_failed", err.Error())
			return
		}
	} else if err != nil {
		response.FailI18n(c, "wordbook.add_failed", err.Error())
		return
	} else {
		uwb.Restore("")
		updates := map[string]interface{}{
			"status":     "active",
			"updated_at": now,
		}
		if uwb.StartedAt == nil {
			updates["started_at"] = now
		}
		if err := db.Model(&uwb).Updates(updates).Error; err != nil {
			response.FailI18n(c, "wordbook.add_failed", err.Error())
			return
		}
	}

	wb, _ := models.GetWordBookByID(db, wbID)
	item := teacherStudentWordBookItem{
		ID:        wbID,
		Name:      "",
		WordCount: 0,
	}
	if wb != nil {
		item.Name = wb.Name
		item.WordCount = wb.WordCount
	}
	response.SuccessI18n(c, "common.ok", item)
}

func (h *Handlers) coachingTeacherRemoveStudentWordBook(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	sid, ok := coachingParseStudentID(c)
	if !ok {
		return
	}
	if err := coachingTeacherHasStudentPair(db, tid, sid); err != nil {
		response.AbortWithStatusJSON(c, http.StatusForbidden, err)
		return
	}
	wbID64, err := strconv.ParseUint(c.Param("wordBookId"), 10, 64)
	if err != nil || wbID64 == 0 {
		response.FailI18n(c, "wordbook.invalid_id", nil)
		return
	}
	wbID := uint(wbID64)

	var uwb models.UserWordBook
	if err := db.Where("user_id = ? AND word_book_id = ?", sid, wbID).
		First(&uwb).Error; err != nil {
		response.FailI18n(c, "msg.25ea3554", nil)
		return
	}
	op := ""
	if u := auth.CurrentUser(c); u != nil {
		op = u.Username
	}
	uwb.SoftDelete(op)
	uwb.Status = "removed"
	if err := db.Save(&uwb).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	response.SuccessI18n(c, "common.ok", gin.H{"studentId": sid, "wordBookId": wbID})
}
