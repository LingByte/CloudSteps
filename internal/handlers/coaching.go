package handlers

import (
	"errors"

	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/ling-base/apidocs/humax"
	lbconstants "github.com/LingByte/ling-base/common/constants"

	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/utils"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (h *Handlers) registerCoachingRoutes(r *humax.Group) {
	adminG := r.Group("coaching")
	adminG.Use(auth.Required, auth.AdminRequired)
	{
		adminG.GET("/appointments", h.coachingAdminListAppointments)
		adminG.GET("/appointments/:id", h.coachingAdminGetAppointment)
		adminG.POST("/appointments", h.coachingAdminCreateAppointment)
		adminG.PUT("/appointments/:id", h.coachingAdminUpdateAppointment)
		adminG.DELETE("/appointments/:id", h.coachingAdminDeleteAppointment)
		adminG.GET("/quotas", h.coachingAdminListQuotas)
		adminG.PUT("/quotas", h.coachingAdminUpsertQuota)
		adminG.GET("/teacher-pools", h.coachingAdminListTeacherPools)
		adminG.PUT("/teacher-pools", h.coachingAdminUpsertTeacherPool)
		adminG.GET("/usage-periods", h.coachingAdminListUsagePeriods)
		adminG.PUT("/usage-periods", h.coachingAdminPutUsagePeriod)
		adminG.GET("/audit-logs", h.coachingAdminListAuditLogs)
		adminG.GET("/subscriptions", h.coachingAdminListSubscriptions)
		adminG.PUT("/subscriptions", h.coachingAdminUpsertSubscription)
		adminG.DELETE("/subscriptions/:id", h.coachingAdminCancelSubscription)
	}

	t := r.Group("teacher/coaching")
	t.Use(auth.Required, h.requireTeacherOrAdmin)
	{
		t.GET("/week", h.coachingTeacherWeek)
		t.GET("/completed", h.coachingTeacherCompleted)
		t.GET("/quotas", h.coachingTeacherListQuotas)
		t.GET("/teacher-pool", h.coachingTeacherGetMyPool)
		t.POST("/quotas", h.coachingTeacherUpsertQuota)
		t.POST("/students", h.coachingTeacherCreateStudent)
		t.DELETE("/students/:studentId", h.coachingTeacherRemoveStudent)
		t.POST("/students/:studentId/password", h.coachingTeacherSetStudentPassword)
		t.PUT("/students/:studentId/review-curve", h.coachingTeacherSetStudentReviewCurve)
		t.GET("/students/search", h.coachingTeacherSearchStudents)
		t.POST("/appointments", h.coachingTeacherCreateAppointment)
		t.PUT("/appointments/:id", h.coachingTeacherUpdateAppointment)
		t.DELETE("/appointments/:id", h.coachingTeacherDeleteAppointment)
		t.GET("/students/:studentId/coaching-sessions/:sessionId", h.coachingTeacherStudentCoachingSessionDetail)
		t.GET("/students/:studentId/study-sessions/:sessionId", h.coachingTeacherStudentStudySessionDetail)
		t.GET("/students/:studentId/vocab-records/:recordId", h.coachingTeacherStudentVocabRecordDetail)
		t.GET("/students/:studentId/vocab-records", h.coachingTeacherStudentVocabRecords)
		t.GET("/students/:studentId/wordbooks", h.coachingTeacherListStudentWordBooks)
		t.POST("/students/:studentId/wordbooks", h.coachingTeacherAddStudentWordBook)
		t.DELETE("/students/:studentId/wordbooks/:wordBookId", h.coachingTeacherRemoveStudentWordBook)
		t.POST("/appointments/:id/start", h.coachingTeacherStart)
		t.POST("/appointments/:id/end", h.coachingTeacherEnd)
		t.POST("/appointments/:id/consume-lesson", h.coachingTeacherConsumeLesson)
		// 无排课练习：按所选学员开课计时；下课只扣老师时长，不扣学员课时
		t.POST("/practice/start", h.coachingTeacherStartPractice)
	}

	s := r.Group("student/coaching")
	s.Use(auth.Required, h.requireStudentOrAdmin)
	{
		s.GET("/week", h.coachingStudentWeek)
	}
}

// coachingIsTeacherRole 老师：role=teacher，或与后台一致的 user（陪练）
func coachingIsTeacherRole(u *models.User) bool {
	if u == nil {
		return false
	}
	return u.IsTeacher() || u.Role == "user"
}

func (h *Handlers) requireTeacherOrAdmin(c *gin.Context) {
	u := auth.CurrentUser(c)
	if u == nil || (!coachingIsTeacherRole(u) && !u.IsAdmin()) {
		response.FailI18n(c, "coaching.teacher_or_admin_required", nil)
		return
	}
	c.Next()
}

func (h *Handlers) requireStudentOrAdmin(c *gin.Context) {
	u := auth.CurrentUser(c)
	if u == nil || (!u.IsStudent() && !u.IsAdmin()) {
		response.FailI18n(c, "coaching.student_or_admin_required", nil)
		return
	}
	c.Next()
}

func coachingDateOnly(t time.Time) time.Time {
	y, m, d := t.In(time.Local).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.Local)
}

func coachingGetQuota(db *gorm.DB, teacherID, studentID uint) (models.StudentTeacherCoachingQuota, error) {
	var q models.StudentTeacherCoachingQuota
	err := db.Where("teacher_id = ? AND student_id = ?", teacherID, studentID).First(&q).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return models.StudentTeacherCoachingQuota{TeacherID: teacherID, StudentID: studentID, RemainingLessons: 1}, gorm.ErrRecordNotFound
	}
	return q, err
}

func coachingGetOrCreateUsagePeriod(tx *gorm.DB, teacherID uint, ref time.Time) (*models.TeacherCoachingUsagePeriod, error) {
	loc := time.Local
	ref = ref.In(loc)
	y, m, _ := ref.Date()
	periodStart := time.Date(y, m, 1, 0, 0, 0, 0, loc)
	periodEnd := periodStart.AddDate(0, 1, 0)

	var p models.TeacherCoachingUsagePeriod
	err := tx.Where("teacher_id = ? AND period_start = ?", teacherID, periodStart).First(&p).Error
	if err == nil {
		return &p, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	p = models.TeacherCoachingUsagePeriod{
		TeacherID: teacherID, PeriodStart: periodStart, PeriodEnd: periodEnd, UsedMinutes: 0, CapMinutes: 0,
	}
	if err := tx.Create(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func coachingAppointmentConflicts(db *gorm.DB, ap *models.CoachingAppointment, excludeID uint) error {
	date := coachingDateOnly(ap.ScheduledDate)
	base := db.Model(&models.CoachingAppointment{}).
		Where("status NOT IN ?", []string{models.CoachingStatusCancelled}).
		Where("scheduled_date = ?", date)
	if excludeID > 0 {
		base = base.Where("id <> ?", excludeID)
	}

	var tList []models.CoachingAppointment
	if err := base.Session(&gorm.Session{NewDB: true}).Where("teacher_id = ?", ap.TeacherID).Find(&tList).Error; err != nil {
		return err
	}
	for _, o := range tList {
		ov, err := models.CoachingSlotOverlap(o.ScheduledDate, ap.ScheduledDate, o.StartTime, o.EndTime, ap.StartTime, ap.EndTime)
		if err != nil {
			return err
		}
		if ov {
			return errors.New("老师在该时段已有排课")
		}
	}

	var sList []models.CoachingAppointment
	if err := base.Session(&gorm.Session{NewDB: true}).Where("student_id = ?", ap.StudentID).Find(&sList).Error; err != nil {
		return err
	}
	for _, o := range sList {
		ov, err := models.CoachingSlotOverlap(o.ScheduledDate, ap.ScheduledDate, o.StartTime, o.EndTime, ap.StartTime, ap.EndTime)
		if err != nil {
			return err
		}
		if ov {
			return errors.New("学员在该时段已有排课")
		}
	}
	return nil
}

func coachingLoadUserRoles(db *gorm.DB, id uint, want string) error {
	var u models.User
	if err := db.Select("id", "role").Where("id = ?", id).First(&u).Error; err != nil {
		return err
	}
	if want == "teacher" && !coachingIsTeacherRole(&u) {
		return errors.New("用户不是老师角色")
	}
	if want == "student" && !u.IsStudent() {
		return errors.New("用户不是学员角色")
	}
	return nil
}

// --- Admin ---

func (h *Handlers) coachingAdminListAppointments(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	from := c.Query("from")
	to := c.Query("to")
	if from == "" || to == "" {
		response.FailI18n(c, "coaching.need_range", nil)
		return
	}
	tFrom, err := time.ParseInLocation("2006-01-02", from, time.Local)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_from_date", nil)
		return
	}
	tTo, err := time.ParseInLocation("2006-01-02", to, time.Local)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_to_date", nil)
		return
	}

	page := 1
	pageSize := 20
	if p := c.Query("page"); p != "" {
		if v, _ := strconv.Atoi(p); v > 0 {
			page = v
		}
	}
	if ps := c.Query("pageSize"); ps != "" {
		if v, _ := strconv.Atoi(ps); v > 0 && v <= 100 {
			pageSize = v
		}
	}

	base := db.Model(&models.CoachingAppointment{}).
		Where("scheduled_date >= ? AND scheduled_date <= ?", coachingDateOnly(tFrom), coachingDateOnly(tTo))
	if tid := c.Query("teacherId"); tid != "" {
		if v, _ := strconv.Atoi(tid); v > 0 {
			base = base.Where("teacher_id = ?", v)
		}
	}
	if sid := c.Query("studentId"); sid != "" {
		if v, _ := strconv.Atoi(sid); v > 0 {
			base = base.Where("student_id = ?", v)
		}
	}
	if st := strings.TrimSpace(c.Query("status")); st != "" && st != "all" {
		base = base.Where("status = ?", st)
	}

	var total int64
	if err := base.Count(&total).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	var list []models.CoachingAppointment
	if err := base.
		Preload("Teacher").Preload("Student").Preload("Session").
		Order("scheduled_date DESC, start_time DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&list).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	response.SuccessI18n(c, "common.ok", gin.H{
		"list":     list,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (h *Handlers) coachingAdminGetAppointment(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		response.FailI18n(c, "coaching.invalid_id", nil)
		return
	}
	var ap models.CoachingAppointment
	if err := db.Where("id = ?", id).
		Preload("Teacher").Preload("Student").Preload("Session").
		First(&ap).Error; err != nil {
		response.FailI18n(c, "coaching.not_found", nil)
		return
	}
	response.SuccessI18n(c, "common.ok", ap)
}

type coachingAdminApptBody struct {
	TeacherID     uint   `json:"teacherId" binding:"required"`
	StudentID     uint   `json:"studentId" binding:"required"`
	ScheduledDate string `json:"scheduledDate" binding:"required"`
	StartTime     string `json:"startTime" binding:"required"`
	EndTime       string `json:"endTime" binding:"required"`
	Title         string `json:"title"`
	Notes         string `json:"notes"`
}

func (h *Handlers) coachingAdminCreateAppointment(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	var body coachingAdminApptBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	sd, err := time.ParseInLocation("2006-01-02", body.ScheduledDate, time.Local)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_date", nil)
		return
	}
	dur, err := models.CoachingDurationMinutes(body.StartTime, body.EndTime)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_time", nil)
		return
	}
	if err := coachingLoadUserRoles(db, body.TeacherID, "teacher"); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	if err := coachingLoadUserRoles(db, body.StudentID, "student"); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	ap := models.CoachingAppointment{
		TeacherID: body.TeacherID, StudentID: body.StudentID,
		ScheduledDate: coachingDateOnly(sd), StartTime: body.StartTime, EndTime: body.EndTime,
		DurationMinutes: dur, Status: models.CoachingStatusScheduled, Title: body.Title, Notes: body.Notes,
	}
	if err := coachingAppointmentConflicts(db, &ap, 0); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	if err := db.Create(&ap).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	_ = db.Preload("Teacher").Preload("Student").First(&ap, ap.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditAppointmentCreate, "appointment", ap.ID, ap.ID, "创建排课", map[string]any{
		"teacherId": ap.TeacherID, "studentId": ap.StudentID,
		"scheduledDate": ap.ScheduledDate.Format("2006-01-02"),
		"startTime":     ap.StartTime, "endTime": ap.EndTime,
	})
	response.SuccessI18n(c, "common.ok", ap)
}

func (h *Handlers) coachingAdminUpdateAppointment(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		response.FailI18n(c, "coaching.invalid_id", nil)
		return
	}
	var ap models.CoachingAppointment
	if err := db.Where("id = ?", id).First(&ap).Error; err != nil {
		response.FailI18n(c, "coaching.not_found", nil)
		return
	}
	if ap.Status == models.CoachingStatusCompleted || ap.Status == models.CoachingStatusInProgress {
		response.FailI18n(c, "coaching.cannot_edit_active", nil)
		return
	}
	var body coachingAdminApptBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	sd, err := time.ParseInLocation("2006-01-02", body.ScheduledDate, time.Local)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_date", nil)
		return
	}
	dur, err := models.CoachingDurationMinutes(body.StartTime, body.EndTime)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_time", nil)
		return
	}
	if err := coachingLoadUserRoles(db, body.TeacherID, "teacher"); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	if err := coachingLoadUserRoles(db, body.StudentID, "student"); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	ap.TeacherID = body.TeacherID
	ap.StudentID = body.StudentID
	ap.ScheduledDate = coachingDateOnly(sd)
	ap.StartTime = body.StartTime
	ap.EndTime = body.EndTime
	ap.DurationMinutes = dur
	ap.Title = body.Title
	ap.Notes = body.Notes
	if err := coachingAppointmentConflicts(db, &ap, ap.ID); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	if err := db.Save(&ap).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	_ = db.Preload("Teacher").Preload("Student").Preload("Session").First(&ap, ap.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditAppointmentUpdate, "appointment", ap.ID, ap.ID, "更新排课", map[string]any{
		"teacherId": ap.TeacherID, "studentId": ap.StudentID,
		"scheduledDate": ap.ScheduledDate.Format("2006-01-02"),
		"startTime":     ap.StartTime, "endTime": ap.EndTime,
	})
	response.SuccessI18n(c, "common.ok", ap)
}

func (h *Handlers) coachingAdminDeleteAppointment(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, _ := strconv.Atoi(c.Param("id"))
	if err := db.Delete(&models.CoachingAppointment{}, id).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	uid := uint(id)
	coachingWriteCoachingAudit(db, c, coachingAuditAppointmentDelete, "appointment", uid, uid, "删除排课", map[string]any{"appointmentId": id})
	response.SuccessI18n(c, "common.ok", gin.H{"id": id})
}

func (h *Handlers) coachingAdminListQuotas(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	var list []models.StudentTeacherCoachingQuota
	tx := db.Where("student_id <> teacher_id").
		Preload("Teacher").Preload("Student").Order("teacher_id, student_id")
	if tid := c.Query("teacherId"); tid != "" {
		if v, _ := strconv.Atoi(tid); v > 0 {
			tx = tx.Where("teacher_id = ?", v)
		}
	}
	if sid := c.Query("studentId"); sid != "" {
		if v, _ := strconv.Atoi(sid); v > 0 {
			tx = tx.Where("student_id = ?", v)
		}
	}
	if err := tx.Find(&list).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	response.SuccessI18n(c, "common.ok", list)
}

type coachingQuotaBody struct {
	TeacherID        uint `json:"teacherId" binding:"required"`
	StudentID        uint `json:"studentId" binding:"required"`
	RemainingLessons int  `json:"remainingLessons"`
}

func (h *Handlers) coachingAdminUpsertQuota(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	var body coachingQuotaBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	if body.RemainingLessons < 0 {
		response.FailI18n(c, "coaching.quota_negative", nil)
		return
	}
	if err := coachingLoadUserRoles(db, body.TeacherID, "teacher"); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	if err := coachingLoadUserRoles(db, body.StudentID, "student"); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}

	var q models.StudentTeacherCoachingQuota
	err := db.Unscoped().Where("teacher_id = ? AND student_id = ?", body.TeacherID, body.StudentID).First(&q).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		q = models.StudentTeacherCoachingQuota{
			TeacherID: body.TeacherID, StudentID: body.StudentID,
			RemainingLessons: body.RemainingLessons, TotalAllocatedLessons: body.RemainingLessons, Version: 0,
		}
		if err := db.Create(&q).Error; err != nil {
			response.FailI18n(c, "common.operation_failed", err.Error())
			return
		}
		coachingWriteCoachingAudit(db, c, coachingAuditQuotaUpsert, "quota", q.ID, 0, "新建师生额度", map[string]any{
			"teacherId": body.TeacherID, "studentId": body.StudentID, "remainingLessons": body.RemainingLessons,
		})
		response.SuccessI18n(c, "common.ok", q)
		return
	}
	if err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	// 恢复可能被软删的额度行，避免唯一索引冲突
	if q.DeletedAt.Valid {
		q.Restore("")
	}
	if body.RemainingLessons > q.RemainingLessons {
		q.TotalAllocatedLessons += body.RemainingLessons - q.RemainingLessons
	}
	q.RemainingLessons = body.RemainingLessons
	if err := db.Save(&q).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	coachingWriteCoachingAudit(db, c, coachingAuditQuotaUpsert, "quota", q.ID, 0, "更新师生额度", map[string]any{
		"teacherId": body.TeacherID, "studentId": body.StudentID, "remainingLessons": body.RemainingLessons,
	})
	response.SuccessI18n(c, "common.ok", q)
}

func (h *Handlers) coachingAdminListTeacherPools(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tx := db.Model(&models.TeacherTeachingPool{}).Preload("Teacher").Order("teacher_id")
	if tid := c.Query("teacherId"); tid != "" {
		if v, _ := strconv.Atoi(tid); v > 0 {
			tx = tx.Where("teacher_id = ?", v)
		}
	}
	var list []models.TeacherTeachingPool
	if err := tx.Find(&list).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	response.SuccessI18n(c, "common.ok", list)
}

type coachingTeacherPoolBody struct {
	TeacherID        uint `json:"teacherId" binding:"required"`
	RemainingMinutes int  `json:"remainingMinutes"`
}

func (h *Handlers) coachingAdminUpsertTeacherPool(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	var body coachingTeacherPoolBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	if body.RemainingMinutes < 0 {
		response.FailI18n(c, "coaching.quota_negative", nil)
		return
	}
	if err := coachingLoadUserRoles(db, body.TeacherID, "teacher"); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}

	row, err := models.EnsureTeacherTeachingPool(db, body.TeacherID)
	if err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	if body.RemainingMinutes > row.RemainingMinutes {
		row.TotalAllocatedMinutes += body.RemainingMinutes - row.RemainingMinutes
	}
	row.RemainingMinutes = body.RemainingMinutes
	if err := db.Model(row).Updates(map[string]any{
		"remaining_minutes":       row.RemainingMinutes,
		"total_allocated_minutes": row.TotalAllocatedMinutes,
	}).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	_ = db.Preload("Teacher").First(row, row.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditQuotaUpsert, "teacher_pool", row.ID, 0, "更新老师授课池", map[string]any{
		"teacherId": body.TeacherID, "remainingMinutes": body.RemainingMinutes,
	})
	response.SuccessI18n(c, "common.ok", row)
}

func (h *Handlers) coachingAdminListUsagePeriods(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	limit := 50
	if l := c.Query("limit"); l != "" {
		if v, _ := strconv.Atoi(l); v > 0 && v <= 200 {
			limit = v
		}
	}
	tx := db.Model(&models.TeacherCoachingUsagePeriod{}).Preload("Teacher").Order("period_start DESC")
	if tidStr := c.Query("teacherId"); tidStr != "" {
		if tid, _ := strconv.Atoi(tidStr); tid > 0 {
			tx = tx.Where("teacher_id = ?", tid)
		}
	}
	var rows []models.TeacherCoachingUsagePeriod
	if err := tx.Limit(limit).Find(&rows).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	response.SuccessI18n(c, "common.ok", rows)
}

type coachingUsagePeriodBody struct {
	TeacherID   uint   `json:"teacherId" binding:"required"`
	Month       string `json:"month" binding:"required"` // YYYY-MM
	CapMinutes  *int   `json:"capMinutes"`
	UsedMinutes *int   `json:"usedMinutes"`
}

func (h *Handlers) coachingAdminPutUsagePeriod(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	var body coachingUsagePeriodBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	var coachUser models.User
	if err := db.Select("id", "role").Where("id = ?", body.TeacherID).First(&coachUser).Error; err != nil {
		response.FailI18n(c, "auth.user_not_found", nil)
		return
	}
	if !coachingIsTeacherRole(&coachUser) {
		response.FailI18n(c, "coaching.not_teacher_role", nil)
		return
	}
	t, err := time.ParseInLocation("2006-01", body.Month, time.Local)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_month", nil)
		return
	}
	y, m, _ := t.Date()
	periodStart := time.Date(y, m, 1, 0, 0, 0, 0, time.Local)
	periodEnd := periodStart.AddDate(0, 1, 0)

	var row models.TeacherCoachingUsagePeriod
	err = db.Where("teacher_id = ? AND period_start = ?", body.TeacherID, periodStart).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = models.TeacherCoachingUsagePeriod{
			TeacherID: body.TeacherID, PeriodStart: periodStart, PeriodEnd: periodEnd,
			UsedMinutes: 0, CapMinutes: 0,
		}
		if body.CapMinutes != nil {
			row.CapMinutes = *body.CapMinutes
		}
		if body.UsedMinutes != nil {
			row.UsedMinutes = *body.UsedMinutes
		}
		if row.CapMinutes < 0 || row.UsedMinutes < 0 {
			response.FailI18n(c, "coaching.minutes_negative", nil)
			return
		}
		if err := db.Create(&row).Error; err != nil {
			response.FailI18n(c, "common.operation_failed", err.Error())
			return
		}
		coachingWriteCoachingAudit(db, c, coachingAuditUsagePeriodPut, "usage_period", row.ID, 0, "创建老师计量周期", map[string]any{
			"teacherId": body.TeacherID, "month": body.Month, "capMinutes": row.CapMinutes, "usedMinutes": row.UsedMinutes,
		})
		response.SuccessI18n(c, "common.ok", row)
		return
	}
	if err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	updates := map[string]any{}
	if body.CapMinutes != nil {
		if *body.CapMinutes < 0 {
			response.FailI18n(c, "coaching.cap_negative", nil)
			return
		}
		updates["cap_minutes"] = *body.CapMinutes
	}
	if body.UsedMinutes != nil {
		if *body.UsedMinutes < 0 {
			response.FailI18n(c, "coaching.used_negative", nil)
			return
		}
		updates["used_minutes"] = *body.UsedMinutes
	}
	if len(updates) == 0 {
		response.FailI18n(c, "coaching.need_cap_or_used", nil)
		return
	}
	if err := db.Model(&row).Updates(updates).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	_ = db.Preload("Teacher").First(&row, row.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditUsagePeriodPut, "usage_period", row.ID, 0, "更新老师计量周期", map[string]any{
		"teacherId": body.TeacherID, "month": body.Month, "updates": updates,
	})
	response.SuccessI18n(c, "common.ok", row)
}

// --- Teacher week / start / end ---

func coachingWeekItems(db *gorm.DB, teacherID, studentID uint, weekRef string) ([]models.CoachingAppointment, error) {
	d, err := time.ParseInLocation("2006-01-02", weekRef, time.Local)
	if err != nil {
		return nil, err
	}
	mon, sun := models.CoachingWeekMondaySunday(d, time.Local)

	var list []models.CoachingAppointment
	tx := db.Where("scheduled_date >= ? AND scheduled_date <= ?", coachingDateOnly(mon), coachingDateOnly(sun)).
		Preload("Teacher").Preload("Student").Preload("Session").
		Order("scheduled_date, start_time")
	if teacherID > 0 {
		tx = tx.Where("teacher_id = ?", teacherID)
	}
	if studentID > 0 {
		tx = tx.Where("student_id = ?", studentID)
	}
	if err := tx.Find(&list).Error; err != nil {
		return nil, err
	}
	return list, nil
}

func (h *Handlers) coachingTeacherWeek(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	date := c.Query("date")
	if date == "" {
		date = time.Now().In(time.Local).Format("2006-01-02")
	}
	var tid uint
	if user.IsAdmin() {
		if q := c.Query("teacherId"); q != "" {
			if v, _ := strconv.Atoi(q); v > 0 {
				tid = uint(v)
			}
		}
		if tid == 0 {
			response.FailI18n(c, "coaching.admin_needs_teacher_id", nil)
			return
		}
	} else {
		tid = user.ID
	}
	list, err := coachingWeekItems(db, tid, 0, date)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_date", nil)
		return
	}
	response.SuccessI18n(c, "common.ok", gin.H{"schedules": coachingToWeekDTO(list)})
}

func (h *Handlers) coachingTeacherListQuotas(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	_ = models.RepairTeacherCoachingRelations(db, tid)

	limit := 20
	if ps := c.Query("limit"); ps != "" {
		if v, err := strconv.Atoi(ps); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	q := strings.TrimSpace(c.Query("q"))
	var cursorID uint
	if raw := strings.TrimSpace(c.Query("cursor")); raw != "" {
		if v, err := strconv.ParseUint(raw, 10, 64); err == nil {
			cursorID = uint(v)
		}
	}

	includeSelf := strings.TrimSpace(c.Query("includeSelf")) == "1" ||
		strings.EqualFold(strings.TrimSpace(c.Query("includeSelf")), "true")
	tx := db.Model(&models.StudentTeacherCoachingQuota{}).
		Joins("INNER JOIN users ON users.id = student_teacher_coaching_quotas.student_id AND users.deleted_at IS NULL").
		Where("student_teacher_coaching_quotas.teacher_id = ?", tid)
	if !includeSelf {
		tx = tx.Where("student_teacher_coaching_quotas.student_id != ?", tid)
	}
	if cursorID > 0 {
		tx = tx.Where("student_teacher_coaching_quotas.id < ?", cursorID)
	}
	if q != "" {
		like := "%" + q + "%"
		tx = tx.Where(
			"users.display_name LIKE ? OR users.username LIKE ? OR users.phone LIKE ? OR CAST(student_teacher_coaching_quotas.student_id AS CHAR) LIKE ?",
			like, like, like, like,
		)
	}

	var list []models.StudentTeacherCoachingQuota
	if err := tx.Preload("Student").
		Order("student_teacher_coaching_quotas.id DESC").
		Limit(limit + 1).
		Find(&list).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}

	hasMore := len(list) > limit
	if hasMore {
		list = list[:limit]
	}
	var nextCursor string
	if hasMore && len(list) > 0 {
		nextCursor = strconv.FormatUint(uint64(list[len(list)-1].ID), 10)
	}

	items, err := coachingEnrichTeacherQuotaList(db, tid, list)
	if err != nil {
		response.FailI18n(c, "coaching.summarize_test_failed", err.Error())
		return
	}
	response.SuccessI18n(c, "common.ok", gin.H{
		"list":       items,
		"nextCursor": nextCursor,
		"hasMore":    hasMore,
		"limit":      limit,
	})
}

func (h *Handlers) coachingTeacherGetMyPool(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	_ = models.RepairTeacherCoachingRelations(db, tid)
	pool, err := models.EnsureTeacherTeachingPool(db, tid)
	if err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	remaining, total := 0, 0
	if pool != nil {
		remaining = pool.RemainingMinutes
		total = pool.TotalAllocatedMinutes
	}
	sub, _ := models.GetActiveSubscription(db, tid)
	response.SuccessI18n(c, "common.ok", gin.H{
		"remainingMinutes":      remaining,
		"totalAllocatedMinutes": total,
		"subscription":          sub,
	})
}

func (h *Handlers) coachingStudentWeek(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	date := c.Query("date")
	if date == "" {
		date = time.Now().In(time.Local).Format("2006-01-02")
	}
	var sid uint
	if user.IsAdmin() {
		if q := c.Query("studentId"); q != "" {
			if v, _ := strconv.Atoi(q); v > 0 {
				sid = uint(v)
			}
		}
		if sid == 0 {
			response.FailI18n(c, "coaching.admin_needs_student_id", nil)
			return
		}
	} else {
		sid = user.ID
	}
	list, err := coachingWeekItems(db, 0, sid, date)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_date", nil)
		return
	}
	response.SuccessI18n(c, "common.ok", gin.H{"schedules": coachingToWeekDTO(list)})
}

type coachingWeekScheduleDTO struct {
	ID            uint     `json:"id"`
	Title         string   `json:"title"`
	ScheduledDate string   `json:"scheduledDate"`
	StartTime     string   `json:"startTime"`
	EndTime       string   `json:"endTime"`
	TeacherID     uint     `json:"teacherId"`
	StudentID     uint     `json:"studentId"`
	Status        string   `json:"status"`
	Notes         string   `json:"notes,omitempty"`
	// source: practice=无排课练习开课；scheduled=正式排课
	Source   string   `json:"source"`
	Students []string `json:"students,omitempty"`
	Session  any      `json:"session,omitempty"`
}

func coachingToWeekDTO(list []models.CoachingAppointment) []coachingWeekScheduleDTO {
	out := make([]coachingWeekScheduleDTO, 0, len(list))
	for _, a := range list {
		title := a.Title
		if title == "" && a.Student != nil {
			title = displayNameOrEmail(a.Student)
		}
		students := []string{}
		if a.Student != nil {
			students = append(students, displayNameOrEmail(a.Student))
		}
		var sess any
		if a.Session != nil && a.Session.ID > 0 {
			sess = gin.H{
				"status":                 a.Session.Status,
				"startedAt":              a.Session.StartedAt,
				"endedAt":                a.Session.EndedAt,
				"actualMinutes":          a.Session.ActualMinutes,
				"billedMinutes":          a.Session.BilledMinutes,
				"teacherCreditedMinutes": a.Session.TeacherCreditedMinutes,
				"studentLessonsBilled":   a.Session.StudentLessonsBilled,
			}
		} else if a.Status == models.CoachingStatusInProgress && a.ActualStartedAt != nil {
			loc := time.Local
			_, slotEnd, planned, _ := models.CoachingAppointmentSlotBounds(&a, loc)
			sess = gin.H{
				"status":         "in_progress",
				"startedAt":      *a.ActualStartedAt,
				"scheduledEndAt": slotEnd,
				"plannedMinutes": planned,
			}
		}
		source := "scheduled"
		if strings.EqualFold(strings.TrimSpace(a.Notes), "practice") {
			source = "practice"
		}
		out = append(out, coachingWeekScheduleDTO{
			ID:            a.ID,
			Title:         title,
			ScheduledDate: a.ScheduledDate.Format("2006-01-02"),
			StartTime:     a.StartTime,
			EndTime:       a.EndTime,
			TeacherID:     a.TeacherID,
			StudentID:     a.StudentID,
			Status:        a.Status,
			Notes:         a.Notes,
			Source:        source,
			Students:      students,
			Session:       sess,
		})
	}
	return out
}

func displayNameOrEmail(u *models.User) string {
	if u == nil {
		return ""
	}
	if u.DisplayName != "" {
		return u.DisplayName
	}
	return u.Username
}

type coachingTeacherApptBody struct {
	StudentID     utils.JSONUint `json:"studentId" binding:"required"`
	ScheduledDate string         `json:"scheduledDate" binding:"required"`
	StartTime     string         `json:"startTime" binding:"required"`
	EndTime       string         `json:"endTime" binding:"required"`
	Title         string         `json:"title"`
	Notes         string         `json:"notes"`
}

type coachingTeacherQuotaBody struct {
	StudentID        utils.JSONUint `json:"studentId" binding:"required"`
	RemainingLessons int            `json:"remainingLessons"`
}

const coachingDefaultStudentPassword = "student123"

type coachingTeacherCreateStudentBody struct {
	DisplayName string `json:"displayName" binding:"required"`
	Password    string `json:"password"`   // 可选；默认 student123
	StudyHours  int    `json:"studyHours"` // 学时 = 课时数
}

type coachingTeacherSetStudentPasswordBody struct {
	Password string `json:"password"` // 空则重置为 student123
}

// coachingUsernameFromDisplayName 姓名（可含中文）+ 随机数字，生成可登录账号
func coachingUsernameFromDisplayName(db *gorm.DB, displayName string) (string, error) {
	base := strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return -1
		}
		return r
	}, strings.TrimSpace(displayName))
	if base == "" {
		base = "学员"
	}
	runes := []rune(base)
	if len(runes) > 16 {
		base = string(runes[:16])
	}
	for i := 0; i < 12; i++ {
		suffix := strconv.FormatInt(time.Now().UnixNano()%10000, 10)
		for len(suffix) < 4 {
			suffix = "0" + suffix
		}
		cand := base + suffix
		if err := utils.ValidateUserName(cand); err != nil {
			// 极端非法字符时退回英文前缀
			cand = "st" + strconv.FormatInt(time.Now().UnixNano()%1e8, 10)
		}
		if !models.IsExistsByUsername(db, cand) {
			return cand, nil
		}
		time.Sleep(time.Millisecond)
	}
	return "", errors.New("生成账号失败")
}

func (h *Handlers) coachingTeacherCreateStudent(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	var body coachingTeacherCreateStudentBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	name := strings.TrimSpace(body.DisplayName)
	if name == "" {
		response.FailI18n(c, "coaching.student_name_required", nil)
		return
	}
	if body.StudyHours < 0 {
		response.FailI18n(c, "coaching.hours_negative", nil)
		return
	}

	remaining := body.StudyHours
	username, err := coachingUsernameFromDisplayName(db, name)
	if err != nil {
		response.FailI18n(c, "auth.generate_account_failed", nil)
		return
	}

	pwd := strings.TrimSpace(body.Password)
	if pwd == "" {
		pwd = coachingDefaultStudentPassword
	}
	if len(pwd) < 6 {
		response.FailI18n(c, "common.password_too_short", nil)
		return
	}
	student := models.User{
		Username:    username,
		Password:    models.HashPassword(pwd),
		DisplayName: name,
		Role:        models.RoleStudent,
		Source:      "teacher_create",
	}
	runes := []rune(name)
	if len(runes) > 0 {
		student.FirstName = string(runes[0])
	}
	if len(runes) > 1 {
		student.LastName = string(runes[1:])
	}

	var quota models.StudentTeacherCoachingQuota
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&student).Error; err != nil {
			return err
		}
		quota = models.StudentTeacherCoachingQuota{
			TeacherID:             tid,
			StudentID:             student.ID,
			RemainingLessons:      remaining,
			TotalAllocatedLessons: remaining,
		}
		return tx.Create(&quota).Error
	})
	if err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	_ = db.Preload("Student").First(&quota, quota.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditQuotaUpsert, "quota", quota.ID, 0, "老师新建学员", map[string]any{
		"teacherId": tid, "studentId": student.ID, "displayName": name,
		"remainingLessons": remaining, "username": username,
	})
	response.SuccessI18n(c, "common.ok", gin.H{
		"quota":           quota,
		"student":         student,
		"username":        username,
		"initialPassword": pwd,
	})
}

func (h *Handlers) coachingTeacherSetStudentPassword(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	sid, err := strconv.ParseUint(c.Param("studentId"), 10, 64)
	if err != nil || sid == 0 {
		response.FailI18n(c, "coaching.invalid_student_id", nil)
		return
	}
	var body coachingTeacherSetStudentPasswordBody
	_ = c.ShouldBindJSON(&body)

	var quota models.StudentTeacherCoachingQuota
	if err := db.Where("teacher_id = ? AND student_id = ?", tid, sid).First(&quota).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailI18n(c, "coaching.student_not_yours", nil)
			return
		}
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}

	var user models.User
	if err := db.First(&user, sid).Error; err != nil {
		response.FailI18n(c, "coaching.student_not_found", nil)
		return
	}

	pwd := strings.TrimSpace(body.Password)
	if pwd == "" {
		pwd = coachingDefaultStudentPassword
	}
	if len(pwd) < 6 {
		response.FailI18n(c, "common.password_too_short", nil)
		return
	}
	if err := models.ResetPassword(db, &user, pwd); err != nil {
		response.FailI18n(c, "auth.set_password_failed", err.Error())
		return
	}
	coachingWriteCoachingAudit(db, c, "student_password_set", "student", user.ID, 0, "老师设置学员密码", map[string]any{
		"teacherId": tid, "studentId": user.ID, "resetToDefault": strings.TrimSpace(body.Password) == "",
	})
	response.SuccessI18n(c, "common.ok", gin.H{
		"studentId": user.ID,
		"username":  user.Username,
		"password":  pwd,
	})
}

type coachingTeacherSetStudentReviewCurveBody struct {
	ReviewCurvePreset string `json:"reviewCurvePreset" binding:"required"`
}

func (h *Handlers) coachingTeacherSetStudentReviewCurve(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	sid, err := strconv.ParseUint(c.Param("studentId"), 10, 64)
	if err != nil || sid == 0 {
		response.FailI18n(c, "coaching.invalid_student_id", nil)
		return
	}
	var body coachingTeacherSetStudentReviewCurveBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	preset := string(models.NormalizeReviewCurvePreset(body.ReviewCurvePreset))

	if err := coachingTeacherHasStudentPair(db, tid, uint(sid)); err != nil {
		response.AbortWithStatusJSON(c, http.StatusForbidden, err)
		return
	}

	var user models.User
	if err := db.First(&user, sid).Error; err != nil {
		response.FailI18n(c, "coaching.student_not_found", nil)
		return
	}
	if err := models.UpdateUser(db, &user, map[string]any{"review_curve_preset": preset}); err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	user.ReviewCurvePreset = preset
	coachingWriteCoachingAudit(db, c, "student_review_curve_set", "student", user.ID, 0, "老师设置抗遗忘次数", map[string]any{
		"teacherId":         tid,
		"studentId":         user.ID,
		"reviewCurvePreset": preset,
		"reviewTimes":       models.ReviewTimesCount(preset),
	})
	response.SuccessI18n(c, "common.ok", gin.H{
		"studentId":         user.ID,
		"reviewCurvePreset": preset,
		"reviewTimes":       models.ReviewTimesCount(preset),
		"presetLabel":       models.ReviewCurvePresetLabel(preset),
	})
}

func (h *Handlers) coachingTeacherRemoveStudent(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	sid, err := strconv.ParseUint(c.Param("studentId"), 10, 64)
	if err != nil || sid == 0 {
		response.FailI18n(c, "coaching.invalid_student_id", nil)
		return
	}
	if models.IsSelfCoachingPair(tid, uint(sid)) {
		response.FailI18n(c, "coaching.cannot_remove_self_quota", nil)
		return
	}
	if err := coachingTeacherHasStudentPair(db, tid, uint(sid)); err != nil {
		response.AbortWithStatusJSON(c, http.StatusForbidden, err)
		return
	}

	var q models.StudentTeacherCoachingQuota
	if err := db.Where("teacher_id = ? AND student_id = ?", tid, sid).First(&q).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailI18n(c, "coaching.student_not_yours", nil)
			return
		}
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}

	op := ""
	if u := auth.CurrentUser(c); u != nil {
		op = u.Username
	}
	q.SoftDelete(op)
	if err := db.Save(&q).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}

	coachingWriteCoachingAudit(db, c, coachingAuditQuotaRemove, "quota", q.ID, 0, "老师移除学员", map[string]any{
		"teacherId": tid, "studentId": sid,
	})
	response.SuccessI18n(c, "common.ok", gin.H{"studentId": sid})
}

func (h *Handlers) coachingTeacherCompleted(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	from := c.Query("from")
	to := c.Query("to")
	if from == "" || to == "" {
		now := time.Now().In(time.Local)
		to = now.Format("2006-01-02")
		from = now.AddDate(0, 0, -90).Format("2006-01-02")
	}
	tFrom, err := time.ParseInLocation("2006-01-02", from, time.Local)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_from_date", nil)
		return
	}
	tTo, err := time.ParseInLocation("2006-01-02", to, time.Local)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_to_date", nil)
		return
	}
	page := 1
	pageSize := 20
	if p := c.Query("page"); p != "" {
		if v, _ := strconv.Atoi(p); v > 0 {
			page = v
		}
	}
	if ps := c.Query("pageSize"); ps != "" {
		if v, _ := strconv.Atoi(ps); v > 0 && v <= 100 {
			pageSize = v
		}
	}
	offset := (page - 1) * pageSize

	var total int64
	base := db.Model(&models.CoachingAppointment{}).
		Where("teacher_id = ? AND status = ?", tid, models.CoachingStatusCompleted).
		Where("scheduled_date >= ? AND scheduled_date <= ?", coachingDateOnly(tFrom), coachingDateOnly(tTo))
	if err := base.Count(&total).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	var list []models.CoachingAppointment
	if err := base.
		Preload("Teacher").Preload("Student").Preload("Session").
		Order("scheduled_date DESC, start_time DESC").
		Offset(offset).Limit(pageSize).
		Find(&list).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	response.SuccessI18n(c, "common.ok", gin.H{
		"schedules": coachingToWeekDTO(list),
		"total":     total,
		"page":      page,
		"pageSize":  pageSize,
	})
}

func (h *Handlers) coachingTeacherSearchStudents(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	q := strings.TrimSpace(c.Query("q"))
	if len(q) < 2 {
		response.FailI18n(c, "coaching.search_keyword_short", nil)
		return
	}
	like := "%" + q + "%"
	var users []models.User
	if err := db.Select("id", "username", "display_name", "phone", "role").
		Where("role = ?", "student").
		Where("username LIKE ? OR display_name LIKE ? OR phone LIKE ?", like, like, like).
		Order("display_name, username").
		Limit(20).
		Find(&users).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	items := make([]gin.H, 0, len(users))
	for _, u := range users {
		items = append(items, gin.H{
			"id":          u.ID,
			"username":    u.Username,
			"displayName": u.DisplayName,
			"phone":       u.Phone,
		})
	}
	response.SuccessI18n(c, "common.ok", items)
}

func (h *Handlers) coachingTeacherUpsertQuota(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	var body coachingTeacherQuotaBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	if body.RemainingLessons < 0 {
		response.FailI18n(c, "coaching.quota_negative", nil)
		return
	}
	studentID := body.StudentID.Uint()
	if studentID == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	if err := coachingLoadUserRoles(db, studentID, "student"); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}

	var q models.StudentTeacherCoachingQuota
	err := db.Unscoped().Where("teacher_id = ? AND student_id = ?", tid, studentID).First(&q).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		q = models.StudentTeacherCoachingQuota{
			TeacherID: tid, StudentID: studentID,
			RemainingLessons: body.RemainingLessons, TotalAllocatedLessons: body.RemainingLessons, Version: 0,
		}
		if err := db.Create(&q).Error; err != nil {
			response.FailI18n(c, "common.operation_failed", err.Error())
			return
		}
		_ = db.Preload("Student").First(&q, q.ID).Error
		coachingWriteCoachingAudit(db, c, coachingAuditQuotaUpsert, "quota", q.ID, 0, "老师添加学员", map[string]any{
			"teacherId": tid, "studentId": studentID, "remainingLessons": body.RemainingLessons,
		})
		response.SuccessI18n(c, "common.ok", q)
		return
	}
	if err != nil {
		response.FailI18n(c, "common.query_failed", err.Error())
		return
	}
	// 恢复可能被软删的额度行，避免唯一索引冲突
	if q.DeletedAt.Valid {
		q.Restore("")
	}
	if body.RemainingLessons > q.RemainingLessons {
		q.TotalAllocatedLessons += body.RemainingLessons - q.RemainingLessons
	}
	q.RemainingLessons = body.RemainingLessons
	if err := db.Save(&q).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	_ = db.Preload("Student").First(&q, q.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditQuotaUpsert, "quota", q.ID, 0, "老师更新学员课时", map[string]any{
		"teacherId": tid, "studentId": studentID, "remainingLessons": body.RemainingLessons,
	})
	response.SuccessI18n(c, "common.ok", q)
}

func (h *Handlers) coachingTeacherCreateAppointment(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	var body coachingTeacherApptBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	studentID := body.StudentID.Uint()
	if studentID == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	if err := coachingTeacherHasStudentPair(db, tid, studentID); err != nil {
		response.FailI18n(c, "coaching.add_student_first", nil)
		return
	}
	sd, err := time.ParseInLocation("2006-01-02", body.ScheduledDate, time.Local)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_date", nil)
		return
	}
	dur, err := models.CoachingDurationMinutes(body.StartTime, body.EndTime)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_time", nil)
		return
	}
	ap := models.CoachingAppointment{
		TeacherID: tid, StudentID: studentID,
		ScheduledDate: coachingDateOnly(sd), StartTime: body.StartTime, EndTime: body.EndTime,
		DurationMinutes: dur, Status: models.CoachingStatusScheduled, Title: body.Title, Notes: body.Notes,
	}
	if err := coachingAppointmentConflicts(db, &ap, 0); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	if err := db.Create(&ap).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	_ = db.Preload("Teacher").Preload("Student").First(&ap, ap.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditAppointmentCreate, "appointment", ap.ID, ap.ID, "老师创建排课", map[string]any{
		"teacherId": ap.TeacherID, "studentId": ap.StudentID,
		"scheduledDate": ap.ScheduledDate.Format("2006-01-02"),
		"startTime":     ap.StartTime, "endTime": ap.EndTime,
	})
	response.SuccessI18n(c, "common.ok", ap)
}

func (h *Handlers) coachingTeacherUpdateAppointment(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		response.FailI18n(c, "coaching.invalid_id", nil)
		return
	}
	var ap models.CoachingAppointment
	if err := db.Where("id = ? AND teacher_id = ?", id, tid).First(&ap).Error; err != nil {
		response.FailI18n(c, "coaching.not_found", nil)
		return
	}
	if ap.Status == models.CoachingStatusCompleted || ap.Status == models.CoachingStatusInProgress {
		response.FailI18n(c, "coaching.cannot_edit_active", nil)
		return
	}
	var body coachingTeacherApptBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	studentID := body.StudentID.Uint()
	if studentID == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	if err := coachingTeacherHasStudentPair(db, tid, studentID); err != nil {
		response.FailI18n(c, "coaching.add_student_first", nil)
		return
	}
	sd, err := time.ParseInLocation("2006-01-02", body.ScheduledDate, time.Local)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_date", nil)
		return
	}
	dur, err := models.CoachingDurationMinutes(body.StartTime, body.EndTime)
	if err != nil {
		response.FailI18n(c, "coaching.invalid_time", nil)
		return
	}
	ap.StudentID = studentID
	ap.ScheduledDate = coachingDateOnly(sd)
	ap.StartTime = body.StartTime
	ap.EndTime = body.EndTime
	ap.DurationMinutes = dur
	ap.Title = body.Title
	ap.Notes = body.Notes
	if err := coachingAppointmentConflicts(db, &ap, ap.ID); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	if err := db.Save(&ap).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	_ = db.Preload("Teacher").Preload("Student").Preload("Session").First(&ap, ap.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditAppointmentUpdate, "appointment", ap.ID, ap.ID, "老师更新排课", map[string]any{
		"teacherId": ap.TeacherID, "studentId": ap.StudentID,
		"scheduledDate": ap.ScheduledDate.Format("2006-01-02"),
		"startTime":     ap.StartTime, "endTime": ap.EndTime,
	})
	response.SuccessI18n(c, "common.ok", ap)
}

func (h *Handlers) coachingTeacherDeleteAppointment(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	var ap models.CoachingAppointment
	if err := db.Where("id = ? AND teacher_id = ?", id, tid).First(&ap).Error; err != nil {
		response.FailI18n(c, "coaching.not_found", nil)
		return
	}
	if ap.Status == models.CoachingStatusInProgress {
		response.FailI18n(c, "coaching.cannot_delete_active", nil)
		return
	}
	if err := db.Delete(&ap).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	uid := uint(id)
	coachingWriteCoachingAudit(db, c, coachingAuditAppointmentDelete, "appointment", uid, uid, "老师删除排课", map[string]any{"appointmentId": id})
	response.SuccessI18n(c, "common.ok", gin.H{"id": id})
}

func (h *Handlers) coachingTeacherStart(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var ap models.CoachingAppointment
	if err := db.Where("id = ?", id).First(&ap).Error; err != nil {
		response.FailI18n(c, "coaching.not_found", nil)
		return
	}
	if coachingIsTeacherRole(user) && !user.IsAdmin() && ap.TeacherID != user.ID {
		response.FailI18n(c, "coaching.no_appointment_access", nil)
		return
	}
	if ap.Status != models.CoachingStatusScheduled {
		if ap.Status == models.CoachingStatusInProgress {
			response.SuccessI18n(c, "common.ok", gin.H{"appointment": ap, "message": "已在上课中"})
			return
		}
		response.FailI18n(c, "coaching.cannot_start", nil)
		return
	}
	q, err := coachingGetQuota(db, ap.TeacherID, ap.StudentID)
	if errors.Is(err, gorm.ErrRecordNotFound) || q.RemainingLessons <= 0 {
		response.FailI18n(c, "coaching.quota_insufficient", nil)
		return
	}
	if err != nil {
		response.FailI18n(c, "coaching.query_quota_failed", err.Error())
		return
	}
	now := time.Now()
	if err := models.CoachingCanStartAt(&ap, now, time.Local); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	if err := coachingTeacherPoolAllowsStart(db, ap.TeacherID); err != nil {
		if errors.Is(err, errCoachingTeacherPoolEmpty) {
			// 有活跃订阅的老师跳过授课池检查
			if !models.TeacherHasActiveSubscription(db, ap.TeacherID) {
				response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
				return
			}
		} else {
			response.FailI18n(c, "coaching.query_teacher_metrics_failed", err.Error())
			return
		}
	}
	ap.Status = models.CoachingStatusInProgress
	ap.ActualStartedAt = &now
	if err := db.Model(&ap).Updates(map[string]any{
		"status": models.CoachingStatusInProgress, "actual_started_at": now,
	}).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err.Error())
		return
	}
	_ = db.First(&ap, ap.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditSessionStart, "appointment", uint(id), uint(id), "开始上课", map[string]any{
		"teacherId": ap.TeacherID, "studentId": ap.StudentID,
	})
	response.SuccessI18n(c, "common.ok", ap)
}

func (h *Handlers) coachingTeacherEnd(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id64 == 0 {
		response.FailI18n(c, "coaching.not_found", nil)
		return
	}
	id := uint(id64)

	var ap models.CoachingAppointment
	if err := db.Where("id = ?", id).First(&ap).Error; err != nil {
		response.FailI18n(c, "coaching.not_found", nil)
		return
	}
	if coachingIsTeacherRole(user) && !user.IsAdmin() && ap.TeacherID != user.ID {
		response.FailI18n(c, "coaching.no_appointment_access", nil)
		return
	}

	rec, apCompleted, err := coachingCompleteAppointment(db, id, time.Now(), c, false)
	if err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	response.SuccessI18n(c, "common.ok", gin.H{"session": rec, "appointment": apCompleted})
}

func (h *Handlers) coachingTeacherConsumeLesson(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id64 == 0 {
		response.FailI18n(c, "coaching.not_found", nil)
		return
	}
	id := uint(id64)

	var ap models.CoachingAppointment
	if err := db.Where("id = ?", id).First(&ap).Error; err != nil {
		response.FailI18n(c, "coaching.not_found", nil)
		return
	}
	if coachingIsTeacherRole(user) && !user.IsAdmin() && ap.TeacherID != user.ID {
		response.FailI18n(c, "coaching.no_appointment_access", nil)
		return
	}

	updated, err := coachingConsumeStudentLesson(db, id, c)
	if err != nil {
		if errors.Is(err, errCoachingLessonNotEligible) {
			response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
			return
		}
		if errors.Is(err, errCoachingLessonNoQuota) {
			response.FailI18n(c, "coaching.quota_insufficient", nil)
			return
		}
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	response.SuccessI18n(c, "common.ok", gin.H{"appointment": updated})
}

type coachingPracticeStartBody struct {
	StudentID      utils.JSONUint `json:"studentId" binding:"required"`
	PlannedMinutes int            `json:"plannedMinutes"` // 计划练习分钟，默认 45，范围 1–180
}

// coachingTeacherStartPractice 无排课练习开课：为所选学员创建临时课次并立即开始，结束时走普通下课扣额度。
func (h *Handlers) coachingTeacherStartPractice(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	var body coachingPracticeStartBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "coaching.select_student", nil)
		return
	}
	studentID := body.StudentID.Uint()
	if studentID == 0 {
		response.FailI18n(c, "coaching.select_student", nil)
		return
	}
	planned := body.PlannedMinutes
	if planned <= 0 {
		planned = 45
	}
	if planned > 180 {
		planned = 180
	}

	if err := coachingTeacherHasStudentPair(db, tid, studentID); err != nil {
		response.FailI18n(c, "coaching.add_student_first", nil)
		return
	}
	// 首页练习不扣学员课时，开课只校验老师教学池

	now := time.Now().In(time.Local)
	if err := coachingTeacherPoolAllowsStart(db, tid); err != nil {
		if errors.Is(err, errCoachingTeacherPoolEmpty) {
			// 有活跃订阅的老师跳过授课池检查
			if !models.TeacherHasActiveSubscription(db, tid) {
				response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
				return
			}
		} else {
			response.FailI18n(c, "coaching.query_teacher_metrics_failed", err.Error())
			return
		}
	}

	// 已有进行中课次：同学员复用；其他学员则提示先下课
	var inProgress []models.CoachingAppointment
	if err := db.Where("teacher_id = ? AND status = ?", tid, models.CoachingStatusInProgress).
		Find(&inProgress).Error; err != nil {
		response.FailI18n(c, "coaching.query_active_session_failed", err.Error())
		return
	}
	for i := range inProgress {
		ap := inProgress[i]
		if ap.StudentID == studentID {
			_ = db.Preload("Teacher").Preload("Student").First(&ap, ap.ID).Error
			dto := coachingToWeekDTO([]models.CoachingAppointment{ap})
			var out any
			if len(dto) > 0 {
				out = dto[0]
			} else {
				out = ap
			}
			// 练习开课（notes=practice）复用后仍由练习流下课；正式排课仅挂接、不自动下课
			practiceOwned := strings.EqualFold(strings.TrimSpace(ap.Notes), "practice")
			response.SuccessI18n(c, "common.ok", gin.H{
				"appointment":   out,
				"appointmentId": ap.ID,
				"studentId":     ap.StudentID,
				"owned":         practiceOwned,
				"reused":        true,
			})
			return
		}
		response.FailI18n(c, "coaching.session_busy", nil)
		return
	}

	endAt := now.Add(time.Duration(planned) * time.Minute)
	startHm := now.Format("15:04")
	endHm := endAt.Format("15:04")
	if endAt.Day() != now.Day() || endHm <= startHm {
		endHm = "23:59"
	}
	dur, err := models.CoachingDurationMinutes(startHm, endHm)
	if err != nil || dur < 1 {
		response.FailI18n(c, "coaching.invalid_time", nil)
		return
	}

	title := "单词练习"
	ap := models.CoachingAppointment{
		TeacherID: tid, StudentID: studentID,
		ScheduledDate:   coachingDateOnly(now),
		StartTime:       startHm,
		EndTime:         endHm,
		DurationMinutes: dur,
		Status:          models.CoachingStatusInProgress,
		Title:           title,
		Notes:           "practice",
		ActualStartedAt: &now,
	}
	// 练习课次不与已有「已排定」课表做冲突拦截（否则临近有排课就无法练习），
	// 仅上面已拦截「上课中」冲突。
	if err := db.Create(&ap).Error; err != nil {
		response.FailI18n(c, "coaching.create_session_failed", err.Error())
		return
	}
	_ = db.Preload("Teacher").Preload("Student").First(&ap, ap.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditSessionStart, "appointment", ap.ID, ap.ID, "无排课练习开课", map[string]any{
		"teacherId": ap.TeacherID, "studentId": ap.StudentID,
		"plannedMinutes": planned, "practice": true,
	})
	dto := coachingToWeekDTO([]models.CoachingAppointment{ap})
	var out any
	if len(dto) > 0 {
		out = dto[0]
	} else {
		out = ap
	}
	response.SuccessI18n(c, "common.ok", gin.H{
		"appointment":   out,
		"appointmentId": ap.ID,
		"studentId":     ap.StudentID,
		"owned":         true,
		"reused":        false,
	})
}

// ── 订阅管理（Admin） ──

func (h *Handlers) coachingAdminListSubscriptions(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	tx := db.Model(&models.UserSubscription{}).Preload("User").Order("created_at DESC")
	if uid := c.Query("userId"); uid != "" {
		if v, _ := strconv.Atoi(uid); v > 0 {
			tx = tx.Where("user_id = ?", v)
		}
	}
	if status := c.Query("status"); status != "" {
		tx = tx.Where("status = ?", status)
	}
	var list []models.UserSubscription
	if err := tx.Find(&list).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	response.SuccessI18n(c, "common.ok", list)
}

type subscriptionUpsertBody struct {
	UserID    uint   `json:"userId" binding:"required"`
	Type      string `json:"type" binding:"required"`     // monthly | yearly | lifetime
	StartedAt string `json:"startedAt"`                    // RFC3339，默认当前时间
	Duration  int    `json:"duration"`                     // 月数（monthly=1, yearly=12, lifetime 忽略）；若 >0 则覆盖
	Status    string `json:"status"`                       // 默认 active
}

func (h *Handlers) coachingAdminUpsertSubscription(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	var body subscriptionUpsertBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	validTypes := map[string]bool{
		models.SubscriptionTypeMonthly: true,
		models.SubscriptionTypeYearly:  true,
		models.SubscriptionTypeLifetime: true,
	}
	if !validTypes[body.Type] {
		response.FailI18n(c, "common.invalid_params", errors.New("invalid subscription type"))
		return
	}

	var user models.User
	if err := db.Where("id = ?", body.UserID).First(&user).Error; err != nil {
		response.FailI18n(c, "auth.user_not_found", err)
		return
	}

	startedAt := time.Now()
	if body.StartedAt != "" {
		if t, err := time.Parse(time.RFC3339, body.StartedAt); err == nil {
			startedAt = t
		}
	}

	var expiredAt *time.Time
	switch body.Type {
	case models.SubscriptionTypeMonthly:
		months := 1
		if body.Duration > 0 {
			months = body.Duration
		}
		e := startedAt.AddDate(0, months, 0)
		expiredAt = &e
	case models.SubscriptionTypeYearly:
		years := 1
		if body.Duration > 0 {
			years = body.Duration
		}
		e := startedAt.AddDate(years, 0, 0)
		expiredAt = &e
	case models.SubscriptionTypeLifetime:
		// nil = 永不过期
	}

	status := body.Status
	if status == "" {
		status = models.SubscriptionStatusActive
	}

	// 查找已有活跃订阅，有则更新
	var existing models.UserSubscription
	hasExisting := db.Where("user_id = ? AND status = ?", body.UserID, models.SubscriptionStatusActive).
		First(&existing).Error == nil

	if hasExisting {
		updates := map[string]any{
			"type":       body.Type,
			"started_at": startedAt,
			"status":     status,
		}
		if expiredAt != nil {
			updates["expired_at"] = *expiredAt
		} else {
			updates["expired_at"] = nil
		}
		if err := db.Model(&existing).Updates(updates).Error; err != nil {
			response.FailI18n(c, "common.operation_failed", err)
			return
		}
		db.First(&existing, existing.ID)
		response.SuccessI18n(c, "common.ok", existing)
		return
	}

	sub := models.UserSubscription{
		UserID:    body.UserID,
		Type:      body.Type,
		StartedAt: startedAt,
		ExpiredAt: expiredAt,
		Status:    status,
	}
	if err := db.Create(&sub).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	_ = db.Preload("User").First(&sub, sub.ID).Error
	response.SuccessI18n(c, "common.ok", sub)
}

func (h *Handlers) coachingAdminCancelSubscription(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	if err := db.Model(&models.UserSubscription{}).Where("id = ?", id).
		Update("status", models.SubscriptionStatusCancelled).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.ok", gin.H{"id": id})
}
