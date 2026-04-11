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

func (h *Handlers) registerCoachingRoutes(r *gin.RouterGroup) {
	adminG := r.Group("coaching")
	adminG.Use(models.AuthRequired, h.requireAdmin)
	{
		adminG.GET("/appointments", h.coachingAdminListAppointments)
		adminG.POST("/appointments", h.coachingAdminCreateAppointment)
		adminG.PUT("/appointments/:id", h.coachingAdminUpdateAppointment)
		adminG.DELETE("/appointments/:id", h.coachingAdminDeleteAppointment)
		adminG.GET("/quotas", h.coachingAdminListQuotas)
		adminG.PUT("/quotas", h.coachingAdminUpsertQuota)
		adminG.GET("/usage-periods", h.coachingAdminListUsagePeriods)
		adminG.PUT("/usage-periods", h.coachingAdminPutUsagePeriod)
		adminG.GET("/audit-logs", h.coachingAdminListAuditLogs)
	}

	t := r.Group("teacher/coaching")
	t.Use(models.AuthRequired, h.requireTeacherOrAdmin)
	{
		t.GET("/week", h.coachingTeacherWeek)
		t.GET("/quotas", h.coachingTeacherListQuotas)
		t.GET("/students/:studentId/coaching-sessions/:sessionId", h.coachingTeacherStudentCoachingSessionDetail)
		t.GET("/students/:studentId/study-sessions/:sessionId", h.coachingTeacherStudentStudySessionDetail)
		t.GET("/students/:studentId/vocab-records/:recordId", h.coachingTeacherStudentVocabRecordDetail)
		t.GET("/students/:studentId/vocab-records", h.coachingTeacherStudentVocabRecords)
		t.POST("/appointments/:id/start", h.coachingTeacherStart)
		t.POST("/appointments/:id/end", h.coachingTeacherEnd)
	}

	s := r.Group("student/coaching")
	s.Use(models.AuthRequired, h.requireStudentOrAdmin)
	{
		s.GET("/week", h.coachingStudentWeek)
	}

	// 通用陪练时长统计（老师和学生都可以使用）
	r.GET("/coaching/time-stats", models.AuthRequired, h.coachingTimeStats)
}

// coachingIsTeacherRole 老师：role=teacher，或与后台一致的 user（陪练）
func coachingIsTeacherRole(u *models.User) bool {
	if u == nil {
		return false
	}
	return u.IsTeacher() || u.Role == "user"
}

func (h *Handlers) requireTeacherOrAdmin(c *gin.Context) {
	u := models.CurrentUser(c)
	if u == nil || (!coachingIsTeacherRole(u) && !u.IsAdmin()) {
		c.JSON(http.StatusForbidden, gin.H{"code": 403, "msg": "需要老师或管理员权限"})
		c.Abort()
		return
	}
	c.Next()
}

func (h *Handlers) requireStudentOrAdmin(c *gin.Context) {
	u := models.CurrentUser(c)
	if u == nil || (!u.IsStudent() && !u.IsAdmin()) {
		c.JSON(http.StatusForbidden, gin.H{"code": 403, "msg": "需要学员或管理员权限"})
		c.Abort()
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
	err := db.Where("teacher_id = ? AND student_id = ? AND is_deleted = ?", teacherID, studentID, 0).First(&q).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return models.StudentTeacherCoachingQuota{TeacherID: teacherID, StudentID: studentID, RemainingMinutes: 0}, gorm.ErrRecordNotFound
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
	err := tx.Where("teacher_id = ? AND period_start = ? AND is_deleted = ?", teacherID, periodStart, 0).First(&p).Error
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
		Where("is_deleted = ? AND status NOT IN ?", 0, []string{models.CoachingStatusCancelled}).
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
	if err := db.Select("id", "role").Where("id = ? AND is_deleted = ?", id, 0).First(&u).Error; err != nil {
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
	db := c.MustGet(constants.DbField).(*gorm.DB)
	from := c.Query("from")
	to := c.Query("to")
	if from == "" || to == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "需要 from、to（YYYY-MM-DD）"})
		return
	}
	tFrom, err := time.ParseInLocation("2006-01-02", from, time.Local)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "from 日期格式错误"})
		return
	}
	tTo, err := time.ParseInLocation("2006-01-02", to, time.Local)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "to 日期格式错误"})
		return
	}

	var list []models.CoachingAppointment
	tx := db.Where("is_deleted = 0 AND scheduled_date >= ? AND scheduled_date <= ?", coachingDateOnly(tFrom), coachingDateOnly(tTo)).
		Preload("Teacher").Preload("Student").Preload("Session").
		Order("scheduled_date, start_time")
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
		response.Fail(c, "查询失败", err.Error())
		return
	}
	response.Success(c, "ok", list)
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
	db := c.MustGet(constants.DbField).(*gorm.DB)
	var body coachingAdminApptBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误"})
		return
	}
	sd, err := time.ParseInLocation("2006-01-02", body.ScheduledDate, time.Local)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "scheduledDate 格式错误"})
		return
	}
	dur, err := models.CoachingDurationMinutes(body.StartTime, body.EndTime)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "开始/结束时间无效"})
		return
	}
	if err := coachingLoadUserRoles(db, body.TeacherID, "teacher"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": err.Error()})
		return
	}
	if err := coachingLoadUserRoles(db, body.StudentID, "student"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": err.Error()})
		return
	}
	ap := models.CoachingAppointment{
		TeacherID: body.TeacherID, StudentID: body.StudentID,
		ScheduledDate: coachingDateOnly(sd), StartTime: body.StartTime, EndTime: body.EndTime,
		DurationMinutes: dur, Status: models.CoachingStatusScheduled, Title: body.Title, Notes: body.Notes,
	}
	if err := coachingAppointmentConflicts(db, &ap, 0); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": err.Error()})
		return
	}
	if err := db.Create(&ap).Error; err != nil {
		response.Fail(c, "创建失败", err.Error())
		return
	}
	_ = db.Preload("Teacher").Preload("Student").First(&ap, ap.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditAppointmentCreate, "appointment", ap.ID, ap.ID, "创建排课", map[string]any{
		"teacherId": ap.TeacherID, "studentId": ap.StudentID,
		"scheduledDate": ap.ScheduledDate.Format("2006-01-02"),
		"startTime": ap.StartTime, "endTime": ap.EndTime,
	})
	response.Success(c, "ok", ap)
}

func (h *Handlers) coachingAdminUpdateAppointment(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "无效 id"})
		return
	}
	var ap models.CoachingAppointment
	if err := db.Where("id = ? AND is_deleted = 0", id).First(&ap).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "排课不存在"})
		return
	}
	if ap.Status == models.CoachingStatusCompleted || ap.Status == models.CoachingStatusInProgress {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "进行中或已完成的排课不可修改时段"})
		return
	}
	var body coachingAdminApptBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误"})
		return
	}
	sd, err := time.ParseInLocation("2006-01-02", body.ScheduledDate, time.Local)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "scheduledDate 格式错误"})
		return
	}
	dur, err := models.CoachingDurationMinutes(body.StartTime, body.EndTime)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "开始/结束时间无效"})
		return
	}
	if err := coachingLoadUserRoles(db, body.TeacherID, "teacher"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": err.Error()})
		return
	}
	if err := coachingLoadUserRoles(db, body.StudentID, "student"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": err.Error()})
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
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": err.Error()})
		return
	}
	if err := db.Save(&ap).Error; err != nil {
		response.Fail(c, "更新失败", err.Error())
		return
	}
	_ = db.Preload("Teacher").Preload("Student").Preload("Session").First(&ap, ap.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditAppointmentUpdate, "appointment", ap.ID, ap.ID, "更新排课", map[string]any{
		"teacherId": ap.TeacherID, "studentId": ap.StudentID,
		"scheduledDate": ap.ScheduledDate.Format("2006-01-02"),
		"startTime": ap.StartTime, "endTime": ap.EndTime,
	})
	response.Success(c, "ok", ap)
}

func (h *Handlers) coachingAdminDeleteAppointment(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	id, _ := strconv.Atoi(c.Param("id"))
	if err := db.Model(&models.CoachingAppointment{}).Where("id = ?", id).Update("is_deleted", 1).Error; err != nil {
		response.Fail(c, "删除失败", err.Error())
		return
	}
	uid := uint(id)
	coachingWriteCoachingAudit(db, c, coachingAuditAppointmentDelete, "appointment", uid, uid, "删除排课", map[string]any{"appointmentId": id})
	response.Success(c, "ok", gin.H{"id": id})
}

func (h *Handlers) coachingAdminListQuotas(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	var list []models.StudentTeacherCoachingQuota
	tx := db.Where("is_deleted = 0").Preload("Teacher").Preload("Student").Order("teacher_id, student_id")
	if tid := c.Query("teacherId"); tid != "" {
		if v, _ := strconv.Atoi(tid); v > 0 {
			tx = tx.Where("teacher_id = ?", v)
		}
	}
	if err := tx.Find(&list).Error; err != nil {
		response.Fail(c, "查询失败", err.Error())
		return
	}
	response.Success(c, "ok", list)
}

type coachingQuotaBody struct {
	TeacherID        uint `json:"teacherId" binding:"required"`
	StudentID        uint `json:"studentId" binding:"required"`
	RemainingMinutes int  `json:"remainingMinutes"` // 允许 0
}

func (h *Handlers) coachingAdminUpsertQuota(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	var body coachingQuotaBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误"})
		return
	}
	if body.RemainingMinutes < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "remainingMinutes 不能为负"})
		return
	}
	if err := coachingLoadUserRoles(db, body.TeacherID, "teacher"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": err.Error()})
		return
	}
	if err := coachingLoadUserRoles(db, body.StudentID, "student"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": err.Error()})
		return
	}

	var q models.StudentTeacherCoachingQuota
	err := db.Where("teacher_id = ? AND student_id = ? AND is_deleted = 0", body.TeacherID, body.StudentID).First(&q).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		q = models.StudentTeacherCoachingQuota{
			TeacherID: body.TeacherID, StudentID: body.StudentID,
			RemainingMinutes: body.RemainingMinutes, TotalAllocatedMinutes: body.RemainingMinutes, Version: 0,
		}
		if err := db.Create(&q).Error; err != nil {
			response.Fail(c, "保存失败", err.Error())
			return
		}
		coachingWriteCoachingAudit(db, c, coachingAuditQuotaUpsert, "quota", q.ID, 0, "新建师生额度", map[string]any{
			"teacherId": body.TeacherID, "studentId": body.StudentID, "remainingMinutes": body.RemainingMinutes,
		})
		response.Success(c, "ok", q)
		return
	}
	if err != nil {
		response.Fail(c, "查询失败", err.Error())
		return
	}
	if body.RemainingMinutes > q.RemainingMinutes {
		q.TotalAllocatedMinutes += body.RemainingMinutes - q.RemainingMinutes
	}
	q.RemainingMinutes = body.RemainingMinutes
	if err := db.Save(&q).Error; err != nil {
		response.Fail(c, "保存失败", err.Error())
		return
	}
	coachingWriteCoachingAudit(db, c, coachingAuditQuotaUpsert, "quota", q.ID, 0, "更新师生额度", map[string]any{
		"teacherId": body.TeacherID, "studentId": body.StudentID, "remainingMinutes": body.RemainingMinutes,
	})
	response.Success(c, "ok", q)
}

func (h *Handlers) coachingAdminListUsagePeriods(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	tidStr := c.Query("teacherId")
	if tidStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "需要 teacherId"})
		return
	}
	tid, _ := strconv.Atoi(tidStr)
	if tid <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "teacherId 无效"})
		return
	}
	limit := 24
	if l := c.Query("limit"); l != "" {
		if v, _ := strconv.Atoi(l); v > 0 && v <= 120 {
			limit = v
		}
	}
	var rows []models.TeacherCoachingUsagePeriod
	if err := db.Where("teacher_id = ? AND is_deleted = 0", tid).
		Preload("Teacher").
		Order("period_start DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		response.Fail(c, "查询失败", err.Error())
		return
	}
	response.Success(c, "ok", rows)
}

type coachingUsagePeriodBody struct {
	TeacherID   uint   `json:"teacherId" binding:"required"`
	Month       string `json:"month" binding:"required"` // YYYY-MM
	CapMinutes  *int   `json:"capMinutes"`
	UsedMinutes *int   `json:"usedMinutes"`
}

func (h *Handlers) coachingAdminPutUsagePeriod(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	var body coachingUsagePeriodBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误"})
		return
	}
	var coachUser models.User
	if err := db.Select("id", "role").Where("id = ? AND is_deleted = 0", body.TeacherID).First(&coachUser).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "用户不存在"})
		return
	}
	if !coachingIsTeacherRole(&coachUser) {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "用户不是老师/陪练角色"})
		return
	}
	t, err := time.ParseInLocation("2006-01", body.Month, time.Local)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "month 格式应为 YYYY-MM"})
		return
	}
	y, m, _ := t.Date()
	periodStart := time.Date(y, m, 1, 0, 0, 0, 0, time.Local)
	periodEnd := periodStart.AddDate(0, 1, 0)

	var row models.TeacherCoachingUsagePeriod
	err = db.Where("teacher_id = ? AND period_start = ? AND is_deleted = 0", body.TeacherID, periodStart).First(&row).Error
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
			c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "分钟数不能为负"})
			return
		}
		if err := db.Create(&row).Error; err != nil {
			response.Fail(c, "创建失败", err.Error())
			return
		}
		coachingWriteCoachingAudit(db, c, coachingAuditUsagePeriodPut, "usage_period", row.ID, 0, "创建老师计量周期", map[string]any{
			"teacherId": body.TeacherID, "month": body.Month, "capMinutes": row.CapMinutes, "usedMinutes": row.UsedMinutes,
		})
		response.Success(c, "ok", row)
		return
	}
	if err != nil {
		response.Fail(c, "查询失败", err.Error())
		return
	}
	updates := map[string]any{}
	if body.CapMinutes != nil {
		if *body.CapMinutes < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "capMinutes 不能为负"})
			return
		}
		updates["cap_minutes"] = *body.CapMinutes
	}
	if body.UsedMinutes != nil {
		if *body.UsedMinutes < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "usedMinutes 不能为负"})
			return
		}
		updates["used_minutes"] = *body.UsedMinutes
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "至少提供 capMinutes 或 usedMinutes"})
		return
	}
	if err := db.Model(&row).Updates(updates).Error; err != nil {
		response.Fail(c, "更新失败", err.Error())
		return
	}
	_ = db.Preload("Teacher").First(&row, row.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditUsagePeriodPut, "usage_period", row.ID, 0, "更新老师计量周期", map[string]any{
		"teacherId": body.TeacherID, "month": body.Month, "updates": updates,
	})
	response.Success(c, "ok", row)
}

// --- Teacher week / start / end ---

func coachingWeekItems(db *gorm.DB, teacherID, studentID uint, weekRef string) ([]models.CoachingAppointment, error) {
	d, err := time.ParseInLocation("2006-01-02", weekRef, time.Local)
	if err != nil {
		return nil, err
	}
	mon, sun := models.CoachingWeekMondaySunday(d, time.Local)

	var list []models.CoachingAppointment
	tx := db.Where("is_deleted = 0 AND scheduled_date >= ? AND scheduled_date <= ?", coachingDateOnly(mon), coachingDateOnly(sun)).
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
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
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
			c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "管理员查询周课表请传 teacherId"})
			return
		}
	} else {
		tid = user.ID
	}
	list, err := coachingWeekItems(db, tid, 0, date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "日期无效"})
		return
	}
	response.Success(c, "ok", gin.H{"schedules": coachingToWeekDTO(list)})
}

func (h *Handlers) coachingTeacherListQuotas(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	tid := coachingCoachingTeacherID(c)
	if tid == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "未登录"})
		return
	}
	var list []models.StudentTeacherCoachingQuota
	if err := db.Where("teacher_id = ? AND is_deleted = 0", tid).Preload("Student").Order("student_id").Find(&list).Error; err != nil {
		response.Fail(c, "查询失败", err.Error())
		return
	}
	items, err := coachingEnrichTeacherQuotaList(db, tid, list)
	if err != nil {
		response.Fail(c, "汇总测评数据失败", err.Error())
		return
	}
	response.Success(c, "ok", items)
}

func (h *Handlers) coachingStudentWeek(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
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
			c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "管理员查询周课表请传 studentId"})
			return
		}
	} else {
		sid = user.ID
	}
	list, err := coachingWeekItems(db, 0, sid, date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "日期无效"})
		return
	}
	response.Success(c, "ok", gin.H{"schedules": coachingToWeekDTO(list)})
}

type coachingWeekScheduleDTO struct {
	ID              uint    `json:"id"`
	Title           string  `json:"title"`
	ScheduledDate   string  `json:"scheduledDate"`
	StartTime       string  `json:"startTime"`
	EndTime         string  `json:"endTime"`
	TeacherID       uint    `json:"teacherId"`
	StudentID       uint    `json:"studentId"`
	Status          string  `json:"status"`
	Students        []string `json:"students,omitempty"`
	Session         any     `json:"session,omitempty"`
}

func coachingToWeekDTO(list []models.CoachingAppointment) []coachingWeekScheduleDTO {
	out := make([]coachingWeekScheduleDTO, 0, len(list))
	for _, a := range list {
		title := a.Title
		if title == "" && a.Student != nil {
			title = displayNameOrEmail(a.Student) + " · 陪练"
		}
		students := []string{}
		if a.Student != nil {
			students = append(students, displayNameOrEmail(a.Student))
		}
		var sess any
		if a.Session != nil && a.Session.ID > 0 {
			sess = gin.H{
				"status":                  a.Session.Status,
				"startedAt":               a.Session.StartedAt,
				"endedAt":                 a.Session.EndedAt,
				"actualMinutes":           a.Session.ActualMinutes,
				"billedMinutes":           a.Session.BilledMinutes,
				"teacherCreditedMinutes":  a.Session.TeacherCreditedMinutes,
			}
		} else if a.Status == models.CoachingStatusInProgress && a.ActualStartedAt != nil {
			sess = gin.H{
				"status":    "in_progress",
				"startedAt": *a.ActualStartedAt,
			}
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

func (h *Handlers) coachingTeacherStart(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var ap models.CoachingAppointment
	if err := db.Where("id = ? AND is_deleted = 0", id).First(&ap).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "排课不存在"})
		return
	}
	if coachingIsTeacherRole(user) && !user.IsAdmin() && ap.TeacherID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 403, "msg": "无权操作此排课"})
		return
	}
	if ap.Status != models.CoachingStatusScheduled {
		if ap.Status == models.CoachingStatusInProgress {
			response.Success(c, "ok", gin.H{"appointment": ap, "message": "已在上课中"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "当前状态不可开始"})
		return
	}
	q, err := coachingGetQuota(db, ap.TeacherID, ap.StudentID)
	if errors.Is(err, gorm.ErrRecordNotFound) || q.RemainingMinutes <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "陪练剩余时长不足，无法开始上课"})
		return
	}
	if err != nil {
		response.Fail(c, "查询额度失败", err.Error())
		return
	}
	now := time.Now()
	if err := coachingTeacherCapAllowsStart(db, ap.TeacherID, now); err != nil {
		if errors.Is(err, errCoachingTeacherCapFull) {
			c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": err.Error()})
			return
		}
		response.Fail(c, "查询老师计量失败", err.Error())
		return
	}
	ap.Status = models.CoachingStatusInProgress
	ap.ActualStartedAt = &now
	if err := db.Model(&ap).Updates(map[string]any{
		"status": models.CoachingStatusInProgress, "actual_started_at": now,
	}).Error; err != nil {
		response.Fail(c, "开始失败", err.Error())
		return
	}
	_ = db.First(&ap, ap.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditSessionStart, "appointment", uint(id), uint(id), "开始上课", map[string]any{
		"teacherId": ap.TeacherID, "studentId": ap.StudentID,
	})
	response.Success(c, "ok", ap)
}

func (h *Handlers) coachingTeacherEnd(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))

	var existing models.CoachingSessionRecord
	if err := db.Where("appointment_id = ?", id).First(&existing).Error; err == nil {
		response.Success(c, "ok", gin.H{"session": existing, "idempotent": true})
		return
	}

	var ap models.CoachingAppointment
	if err := db.Where("id = ? AND is_deleted = 0", id).First(&ap).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "排课不存在"})
		return
	}
	if coachingIsTeacherRole(user) && !user.IsAdmin() && ap.TeacherID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 403, "msg": "无权操作此排课"})
		return
	}
	if ap.Status != models.CoachingStatusInProgress {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "只有上课中的排课可以下课"})
		return
	}
	if ap.ActualStartedAt == nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "缺少实际上课开始时间"})
		return
	}
	endedAt := time.Now()
	actual := models.CoachingActualMinutesFloor(*ap.ActualStartedAt, endedAt)

	var rec models.CoachingSessionRecord
	err := db.Transaction(func(tx *gorm.DB) error {
		var q models.StudentTeacherCoachingQuota
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("teacher_id = ? AND student_id = ? AND is_deleted = 0", ap.TeacherID, ap.StudentID).
			First(&q).Error; err != nil {
			return err
		}
		billedStudent := actual
		if q.RemainingMinutes < billedStudent {
			billedStudent = q.RemainingMinutes
		}
		res := tx.Model(&models.StudentTeacherCoachingQuota{}).
			Where("id = ? AND version = ?", q.ID, q.Version).
			Updates(map[string]any{
				"remaining_minutes": q.RemainingMinutes - billedStudent,
				"version":           q.Version + 1,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errors.New("额度更新冲突，请重试")
		}
		period, err := coachingGetOrCreateUsagePeriod(tx, ap.TeacherID, endedAt)
		if err != nil {
			return err
		}
		var lockedPeriod models.TeacherCoachingUsagePeriod
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", period.ID).First(&lockedPeriod).Error; err != nil {
			return err
		}
		teacherCred := billedStudent
		if lockedPeriod.CapMinutes > 0 {
			room := lockedPeriod.CapMinutes - lockedPeriod.UsedMinutes
			if room < 0 {
				room = 0
			}
			if teacherCred > room {
				teacherCred = room
			}
		}
		if err := tx.Model(&lockedPeriod).Update("used_minutes", lockedPeriod.UsedMinutes+teacherCred).Error; err != nil {
			return err
		}
		rec = models.CoachingSessionRecord{
			AppointmentID: uint(id), TeacherID: ap.TeacherID, StudentID: ap.StudentID,
			StartedAt: *ap.ActualStartedAt, EndedAt: endedAt,
			ActualMinutes: actual, BilledMinutes: billedStudent, TeacherCreditedMinutes: teacherCred,
			Status: models.CoachingSessionStatusCompleted,
		}
		if err := tx.Create(&rec).Error; err != nil {
			return err
		}
		return tx.Model(&ap).Updates(map[string]any{
			"status": models.CoachingStatusCompleted,
		}).Error
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": err.Error()})
		return
	}
	_ = db.First(&rec, rec.ID).Error
	_ = db.First(&ap, ap.ID).Error
	coachingWriteCoachingAudit(db, c, coachingAuditSessionEnd, "session", rec.ID, uint(id), "下课完课", map[string]any{
		"teacherId": rec.TeacherID, "studentId": rec.StudentID,
		"actualMinutes": rec.ActualMinutes, "billedMinutes": rec.BilledMinutes,
		"teacherCreditedMinutes": rec.TeacherCreditedMinutes,
	})
	response.Success(c, "ok", gin.H{"session": rec, "appointment": ap})
}

// coachingTimeStats 获取用户陪练时长统计
func (h *Handlers) coachingTimeStats(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	if user == nil {
		response.Fail(c, "用户未登录", errors.New("user not found"))
		return
	}

	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	var todayMinutes, totalMinutes int64
	var todaySessions, totalSessions int64

	if coachingIsTeacherRole(user) {
		// 老师统计：作为老师的陪练时长
		// 今日统计
		err := db.Model(&models.CoachingSessionRecord{}).
			Where("teacher_id = ? AND status = ? AND started_at >= ?", 
				user.ID, models.CoachingSessionStatusCompleted, todayStart).
			Select("COALESCE(SUM(actual_minutes), 0)").
			Scan(&todayMinutes).Error
		if err != nil {
			response.Fail(c, "查询今日时长失败", err)
			return
		}

		err = db.Model(&models.CoachingSessionRecord{}).
			Where("teacher_id = ? AND status = ? AND started_at >= ?", 
				user.ID, models.CoachingSessionStatusCompleted, todayStart).
			Count(&todaySessions).Error
		if err != nil {
			response.Fail(c, "查询今日次数失败", err)
			return
		}

		// 累积统计
		err = db.Model(&models.CoachingSessionRecord{}).
			Where("teacher_id = ? AND status = ?", 
				user.ID, models.CoachingSessionStatusCompleted).
			Select("COALESCE(SUM(actual_minutes), 0)").
			Scan(&totalMinutes).Error
		if err != nil {
			response.Fail(c, "查询累积时长失败", err)
			return
		}

		err = db.Model(&models.CoachingSessionRecord{}).
			Where("teacher_id = ? AND status = ?", 
				user.ID, models.CoachingSessionStatusCompleted).
			Count(&totalSessions).Error
		if err != nil {
			response.Fail(c, "查询累积次数失败", err)
			return
		}
	} else {
		// 学生统计：作为学生的陪练时长
		// 今日统计
		err := db.Model(&models.CoachingSessionRecord{}).
			Where("student_id = ? AND status = ? AND started_at >= ?", 
				user.ID, models.CoachingSessionStatusCompleted, todayStart).
			Select("COALESCE(SUM(actual_minutes), 0)").
			Scan(&todayMinutes).Error
		if err != nil {
			response.Fail(c, "查询今日时长失败", err)
			return
		}

		err = db.Model(&models.CoachingSessionRecord{}).
			Where("student_id = ? AND status = ? AND started_at >= ?", 
				user.ID, models.CoachingSessionStatusCompleted, todayStart).
			Count(&todaySessions).Error
		if err != nil {
			response.Fail(c, "查询今日次数失败", err)
			return
		}

		// 累积统计
		err = db.Model(&models.CoachingSessionRecord{}).
			Where("student_id = ? AND status = ?", 
				user.ID, models.CoachingSessionStatusCompleted).
			Select("COALESCE(SUM(actual_minutes), 0)").
			Scan(&totalMinutes).Error
		if err != nil {
			response.Fail(c, "查询累积时长失败", err)
			return
		}

		err = db.Model(&models.CoachingSessionRecord{}).
			Where("student_id = ? AND status = ?", 
				user.ID, models.CoachingSessionStatusCompleted).
			Count(&totalSessions).Error
		if err != nil {
			response.Fail(c, "查询累积次数失败", err)
			return
		}
	}

	response.Success(c, "success", gin.H{
		"todayMinutes":  todayMinutes,
		"totalMinutes":  totalMinutes,
		"todaySessions": todaySessions,
		"totalSessions": totalSessions,
	})
}
