package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/constants"
	"github.com/LingByte/CloudStepsGo/pkg/response"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const studentActivityMergeCap = 3000

// coachingTeacherQuotaItem 老师端学员额度 + 活动摘要
type coachingTeacherQuotaItem struct {
	models.StudentTeacherCoachingQuota
	VocabTestCount         int64 `json:"vocabTestCount"`
	CoachingSessionCount   int64 `json:"coachingSessionCount"`
	StudySessionCount      int64 `json:"studySessionCount"`
	LatestVocabLevel       string     `json:"latestVocabLevel,omitempty"`
	LatestVocabTestAt      *time.Time `json:"latestVocabTestAt,omitempty"`
	LatestEstimatedVocab   int        `json:"latestEstimatedVocab,omitempty"`
}

// studentActivityListItem 学员活动时间线（词汇测评 + 陪练完课 + 单词训练会话）
type studentActivityListItem struct {
	Kind            string    `json:"kind"` // vocab_test | coaching_session | study_session
	ID              uint      `json:"id"`
	Time            time.Time `json:"time"`
	Title           string    `json:"title"`
	Summary         string    `json:"summary"`
	WordBookName    string    `json:"wordBookName,omitempty"`
	VocabTest       *models.VocabTestRecord       `json:"vocabTest,omitempty"`
	CoachingSession *models.CoachingSessionRecord   `json:"coachingSession,omitempty"`
	StudySession    *models.StudySession            `json:"studySession,omitempty"`
}

func coachingCoachingTeacherID(c *gin.Context) uint {
	u := models.CurrentUser(c)
	if u == nil {
		return 0
	}
	tid := u.ID
	if u.IsAdmin() {
		if q := c.Query("teacherId"); q != "" {
			if v, _ := strconv.Atoi(q); v > 0 {
				tid = uint(v)
			}
		}
	}
	return tid
}

func coachingTeacherHasStudentPair(db *gorm.DB, teacherID, studentID uint) error {
	var n int64
	if err := db.Model(&models.StudentTeacherCoachingQuota{}).
		Where("teacher_id = ? AND student_id = ? AND is_deleted = 0", teacherID, studentID).
		Count(&n).Error; err != nil {
		return err
	}
	if n == 0 {
		return errors.New("无权查看该学员或尚未建立陪练关系")
	}
	return nil
}

func coachingEnrichTeacherQuotaList(db *gorm.DB, teacherID uint, list []models.StudentTeacherCoachingQuota) ([]coachingTeacherQuotaItem, error) {
	out := make([]coachingTeacherQuotaItem, 0, len(list))
	if len(list) == 0 {
		return out, nil
	}
	studentIDs := make([]uint, 0, len(list))
	for _, q := range list {
		studentIDs = append(studentIDs, q.StudentID)
	}

	type cntRow struct {
		UserID uint  `gorm:"column:user_id"`
		N      int64 `gorm:"column:n"`
	}
	var cnts []cntRow
	if err := db.Model(&models.VocabTestRecord{}).
		Select("user_id, count(*) as n").
		Where("user_id IN ?", studentIDs).
		Group("user_id").
		Find(&cnts).Error; err != nil {
		return nil, err
	}
	countMap := make(map[uint]int64, len(cnts))
	for _, r := range cnts {
		countMap[r.UserID] = r.N
	}

	type coachCntRow struct {
		StudentID uint  `gorm:"column:student_id"`
		N         int64 `gorm:"column:n"`
	}
	var coachCnts []coachCntRow
	if err := db.Model(&models.CoachingSessionRecord{}).
		Select("student_id, count(*) as n").
		Where("teacher_id = ? AND student_id IN ?", teacherID, studentIDs).
		Group("student_id").
		Find(&coachCnts).Error; err != nil {
		return nil, err
	}
	coachMap := make(map[uint]int64, len(coachCnts))
	for _, r := range coachCnts {
		coachMap[r.StudentID] = r.N
	}

	type studyCntRow struct {
		UserID uint  `gorm:"column:user_id"`
		N      int64 `gorm:"column:n"`
	}
	var studyCnts []studyCntRow
	if err := db.Model(&models.StudySession{}).
		Select("user_id, count(*) as n").
		Where("user_id IN ?", studentIDs).
		Group("user_id").
		Find(&studyCnts).Error; err != nil {
		return nil, err
	}
	studyMap := make(map[uint]int64, len(studyCnts))
	for _, r := range studyCnts {
		studyMap[r.UserID] = r.N
	}

	type maxIDRow struct {
		Mid uint `gorm:"column:mid"`
	}
	var maxRows []maxIDRow
	if err := db.Raw(`
		SELECT MAX(id) AS mid FROM vocab_test_records WHERE user_id IN ? GROUP BY user_id
	`, studentIDs).Scan(&maxRows).Error; err != nil {
		return nil, err
	}
	maxIDs := make([]uint, 0, len(maxRows))
	for _, r := range maxRows {
		if r.Mid > 0 {
			maxIDs = append(maxIDs, r.Mid)
		}
	}
	latestByUser := make(map[uint]models.VocabTestRecord)
	if len(maxIDs) > 0 {
		var recs []models.VocabTestRecord
		if err := db.Where("id IN ?", maxIDs).Find(&recs).Error; err != nil {
			return nil, err
		}
		for _, rec := range recs {
			latestByUser[rec.UserID] = rec
		}
	}

	for _, q := range list {
		item := coachingTeacherQuotaItem{
			StudentTeacherCoachingQuota: q,
			VocabTestCount:              countMap[q.StudentID],
			CoachingSessionCount:        coachMap[q.StudentID],
			StudySessionCount:           studyMap[q.StudentID],
		}
		if rec, ok := latestByUser[q.StudentID]; ok {
			item.LatestVocabLevel = rec.EstimatedLevel
			item.LatestEstimatedVocab = rec.EstimatedVocab
			if rec.CompletedAt != nil {
				t := *rec.CompletedAt
				item.LatestVocabTestAt = &t
			} else {
				t := rec.CreatedAt
				item.LatestVocabTestAt = &t
			}
		}
		out = append(out, item)
	}
	return out, nil
}

func coachingBuildStudentActivityFeed(db *gorm.DB, teacherID, studentID uint) ([]studentActivityListItem, error) {
	var coaching []models.CoachingSessionRecord
	if err := db.Where("student_id = ? AND teacher_id = ?", studentID, teacherID).
		Preload("Appointment").
		Order("ended_at DESC").
		Limit(studentActivityMergeCap).
		Find(&coaching).Error; err != nil {
		return nil, err
	}

	var vocab []models.VocabTestRecord
	if err := db.Where("user_id = ?", studentID).
		Order("created_at DESC").
		Limit(studentActivityMergeCap).
		Find(&vocab).Error; err != nil {
		return nil, err
	}

	var studies []models.StudySession
	if err := db.Where("user_id = ?", studentID).
		Order("started_at DESC").
		Limit(studentActivityMergeCap).
		Find(&studies).Error; err != nil {
		return nil, err
	}

	bookIDs := make([]uint, 0)
	seenBook := make(map[uint]struct{})
	for _, s := range studies {
		if s.WordBookID == 0 {
			continue
		}
		if _, ok := seenBook[s.WordBookID]; ok {
			continue
		}
		seenBook[s.WordBookID] = struct{}{}
		bookIDs = append(bookIDs, s.WordBookID)
	}
	bookName := make(map[uint]string)
	if len(bookIDs) > 0 {
		var books []models.WordBook
		if err := db.Select("id", "name").Where("id IN ?", bookIDs).Find(&books).Error; err != nil {
			return nil, err
		}
		for _, b := range books {
			bookName[b.ID] = b.Name
		}
	}

	items := make([]studentActivityListItem, 0, len(coaching)+len(vocab)+len(studies))

	for i := range coaching {
		c := coaching[i]
		apTitle := ""
		if c.Appointment != nil && c.Appointment.Title != "" {
			apTitle = c.Appointment.Title
		}
		title := "陪练完课"
		if apTitle != "" {
			title = "陪练完课 · " + apTitle
		}
		summary := fmt.Sprintf("实际 %d 分钟 · 学员扣减 %d 分钟 · 计入老师 %d 分钟",
			c.ActualMinutes, c.BilledMinutes, c.TeacherCreditedMinutes)
		items = append(items, studentActivityListItem{
			Kind:            "coaching_session",
			ID:              c.ID,
			Time:            c.EndedAt,
			Title:           title,
			Summary:         summary,
			CoachingSession: &coaching[i],
		})
	}

	for i := range vocab {
		v := vocab[i]
		vCopy := v
		vCopy.Answers = ""
		t := v.CreatedAt
		if v.CompletedAt != nil {
			t = *v.CompletedAt
		}
		summary := fmt.Sprintf("等级 %s · 估算词汇量 %d · 正确 %d/%d",
			v.EstimatedLevel, v.EstimatedVocab, v.CorrectCount, v.QuestionCount)
		items = append(items, studentActivityListItem{
			Kind:      "vocab_test",
			ID:        v.ID,
			Time:      t,
			Title:     "词汇量测评",
			Summary:   summary,
			VocabTest: &vCopy,
		})
	}

	for i := range studies {
		s := studies[i]
		wname := bookName[s.WordBookID]
		title := "单词训练"
		if wname != "" {
			title = "单词训练 · " + wname
		}
		summary := fmt.Sprintf("类型 %s · %d 词 · 答对 %d · 状态 %s",
			s.SessionType, s.WordCount, s.CorrectCount, s.Status)
		t := s.StartedAt
		if s.CompletedAt != nil {
			t = *s.CompletedAt
		}
		items = append(items, studentActivityListItem{
			Kind:         "study_session",
			ID:           s.ID,
			Time:         t,
			Title:        title,
			Summary:      summary,
			WordBookName: wname,
			StudySession: &studies[i],
		})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].Time.After(items[j].Time)
	})
	return items, nil
}

func (h *Handlers) coachingTeacherStudentVocabRecords(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "未登录"})
		return
	}
	sid64, err := strconv.ParseUint(c.Param("studentId"), 10, 64)
	if err != nil || sid64 == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "学员 ID 无效"})
		return
	}
	sid := uint(sid64)
	if err := coachingTeacherHasStudentPair(db, tid, sid); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 403, "msg": err.Error()})
		return
	}

	feed, err := coachingBuildStudentActivityFeed(db, tid, sid)
	if err != nil {
		response.Fail(c, "查询失败", err.Error())
		return
	}
	// 一次返回完整时间线（各来源已 Limit），由前端按月份筛选与分页
	n := len(feed)
	response.Success(c, "ok", gin.H{
		"list":     feed,
		"total":    int64(n),
		"page":     1,
		"pageSize": n,
	})
}

func (h *Handlers) coachingTeacherStudentVocabRecordDetail(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "未登录"})
		return
	}
	sid64, err := strconv.ParseUint(c.Param("studentId"), 10, 64)
	if err != nil || sid64 == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "学员 ID 无效"})
		return
	}
	sid := uint(sid64)
	if err := coachingTeacherHasStudentPair(db, tid, sid); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 403, "msg": err.Error()})
		return
	}
	rid, err := strconv.Atoi(c.Param("recordId"))
	if err != nil || rid <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "记录 ID 无效"})
		return
	}
	var record models.VocabTestRecord
	if err := db.Where("id = ? AND user_id = ?", rid, sid).First(&record).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "记录不存在"})
		return
	}
	response.Success(c, "ok", record)
}

func (h *Handlers) coachingTeacherStudentCoachingSessionDetail(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "未登录"})
		return
	}
	sid64, err := strconv.ParseUint(c.Param("studentId"), 10, 64)
	if err != nil || sid64 == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "学员 ID 无效"})
		return
	}
	sid := uint(sid64)
	if err := coachingTeacherHasStudentPair(db, tid, sid); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 403, "msg": err.Error()})
		return
	}
	sessID, err := strconv.Atoi(c.Param("sessionId"))
	if err != nil || sessID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "会话 ID 无效"})
		return
	}
	var rec models.CoachingSessionRecord
	if err := db.Preload("Appointment").
		Where("id = ? AND student_id = ? AND teacher_id = ?", sessID, sid, tid).
		First(&rec).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "记录不存在"})
		return
	}
	response.Success(c, "ok", rec)
}

func (h *Handlers) coachingTeacherStudentStudySessionDetail(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "未登录"})
		return
	}
	sid64, err := strconv.ParseUint(c.Param("studentId"), 10, 64)
	if err != nil || sid64 == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "学员 ID 无效"})
		return
	}
	sid := uint(sid64)
	if err := coachingTeacherHasStudentPair(db, tid, sid); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 403, "msg": err.Error()})
		return
	}
	sessID, err := strconv.Atoi(c.Param("sessionId"))
	if err != nil || sessID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "会话 ID 无效"})
		return
	}
	var rec models.StudySession
	if err := db.Where("id = ? AND user_id = ?", sessID, sid).First(&rec).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "记录不存在"})
		return
	}
	var wb models.WordBook
	wbName := ""
	if rec.WordBookID > 0 && db.Select("name").Where("id = ?", rec.WordBookID).First(&wb).Error == nil {
		wbName = wb.Name
	}
	response.Success(c, "ok", gin.H{"session": rec, "wordBookName": wbName})
}
