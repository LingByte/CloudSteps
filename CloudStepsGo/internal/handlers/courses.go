package handlers

import (
	"net/http"
	"strconv"
	"time"
	"fmt"
	"strings"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/constants"
	"github.com/LingByte/CloudStepsGo/pkg/response"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (h *Handlers) registerCourseRoutes(r *gin.RouterGroup) {
	manage := r.Group("courses")
	manage.Use(models.AuthRequired, h.requireAdmin)
	{
		manage.GET("", h.handleListCourses)
		manage.POST("", h.handleCreateCourse)
		manage.PUT("/:id", h.handleUpdateCourse)
		manage.DELETE("/:id", h.handleDeleteCourse)

		// 排课
		manage.GET("/:id/schedules", h.handleListSchedules)
		manage.POST("/:id/schedules", h.handleCreateSchedule)
		manage.PUT("/schedules/:sid", h.handleUpdateSchedule)
		manage.DELETE("/schedules/:sid", h.handleDeleteSchedule)

		// 学员管理
		manage.GET("/schedules/:sid/students", h.handleListScheduleStudents)
		manage.POST("/schedules/:sid/students", h.handleAddScheduleStudent)
		manage.DELETE("/schedules/:sid/students/:uid", h.handleRemoveScheduleStudent)

		// 搜索用户
		manage.GET("/users/search", h.handleSearchUsers)
	}

	// 老师（user role）查看自己的课表、操作上课计时
	teacher := r.Group("teacher")
	teacher.Use(models.AuthRequired)
	{
		teacher.GET("/today", h.handleTeacherToday)
		teacher.GET("/week", h.handleTeacherWeek) // 周视图
		teacher.GET("/records", h.handleTeacherTrainingRecords)
		teacher.GET("/students", h.handleTeacherStudents)
		teacher.POST("/sessions/:sid/start", h.handleStartClass)
		teacher.POST("/sessions/:sid/end", h.handleEndClass)
		teacher.GET("/sessions/:sid", h.handleGetClassSession)
	}

	// 学员查看自己的课表
	student := r.Group("student")
	student.Use(models.AuthRequired)
	{
		student.GET("/schedules", h.handleStudentSchedules)
		student.GET("/week", h.handleStudentWeek) // 周视图
		student.GET("/class-records", h.handleStudentClassRecords)
	}
}

func (h *Handlers) requireAdmin(c *gin.Context) {
	user := models.CurrentUser(c)
	if user == nil || !user.IsAdmin() {
		c.JSON(http.StatusForbidden, gin.H{"code": 403, "msg": "需要管理员权限"})
		c.Abort()
		return
	}
	c.Next()
}

// ── Admin: Course CRUD ────────────────────────────────────────────────────────

func (h *Handlers) handleListCourses(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	var courses []models.Course
	db.Where("is_deleted = 0").Preload("Teacher").Preload("WordBook").Find(&courses)
	response.Success(c, "success", courses)
}

func (h *Handlers) handleCreateCourse(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)

	var body struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		ClassType   string `json:"classType"` // group | one_on_one
		WordBookID  uint   `json:"wordBookId"`
		TeacherID   uint   `json:"teacherId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误: " + err.Error()})
		return
	}

	classType := body.ClassType
	if classType != "one_on_one" {
		classType = "group"
	}
	course := models.Course{
		Name:        body.Name,
		Description: body.Description,
		ClassType:   classType,
		WordBookID:  body.WordBookID,
		TeacherID:   body.TeacherID,
		CreatedByID: user.ID,
	}
	if err := db.Create(&course).Error; err != nil {
		response.Fail(c, "创建失败", err)
		return
	}
	db.Preload("Teacher").Preload("WordBook").First(&course, course.ID)
	response.Success(c, "success", course)
}

func (h *Handlers) handleUpdateCourse(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	id, _ := strconv.Atoi(c.Param("id"))

	var course models.Course
	if err := db.Where("id = ? AND is_deleted = 0", id).First(&course).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "课程不存在"})
		return
	}

	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		ClassType   string `json:"classType"`
		WordBookID  uint   `json:"wordBookId"`
		TeacherID   uint   `json:"teacherId"`
	}
	c.ShouldBindJSON(&body)

	vals := map[string]any{}
	if body.Name != "" {
		vals["name"] = body.Name
	}
	if body.Description != "" {
		vals["description"] = body.Description
	}
	if body.ClassType == "one_on_one" || body.ClassType == "group" {
		vals["class_type"] = body.ClassType
	}
	if body.WordBookID > 0 {
		vals["word_book_id"] = body.WordBookID
	}
	if body.TeacherID > 0 {
		vals["teacher_id"] = body.TeacherID
	}
	db.Model(&course).Updates(vals)
	response.Success(c, "success", course)
}

func (h *Handlers) handleDeleteCourse(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	id, _ := strconv.Atoi(c.Param("id"))
	db.Model(&models.Course{}).Where("id = ?", id).Update("is_deleted", 1)
	response.Success(c, "success", nil)
}

// ── Admin: Schedule CRUD ──────────────────────────────────────────────────────

func (h *Handlers) handleListSchedules(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	courseID, _ := strconv.Atoi(c.Param("id"))

	var schedules []models.Schedule
	db.Where("course_id = ? AND is_deleted = 0", courseID).
		Preload("Students.Student").
		Order("scheduled_date ASC").
		Find(&schedules)
	response.Success(c, "success", schedules)
}

func (h *Handlers) handleCreateSchedule(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	courseID, _ := strconv.Atoi(c.Param("id"))

	var body struct {
		Title         string `json:"title"`
		ScheduledDate string `json:"scheduledDate" binding:"required"` // "2026-03-20"
		StartTime     string `json:"startTime" binding:"required"`     // "09:00"
		EndTime       string `json:"endTime" binding:"required"`       // "10:30"
		Notes         string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误: " + err.Error()})
		return
	}

	date, err := time.Parse("2006-01-02", body.ScheduledDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "日期格式错误，请用 YYYY-MM-DD"})
		return
	}

	schedule := models.Schedule{
		CourseID:      uint(courseID),
		Title:         body.Title,
		ScheduledDate: date,
		StartTime:     body.StartTime,
		EndTime:       body.EndTime,
		Notes:         body.Notes,
	}
	if err := db.Create(&schedule).Error; err != nil {
		response.Fail(c, "创建失败", err)
		return
	}
	response.Success(c, "success", schedule)
}

func (h *Handlers) handleUpdateSchedule(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	sid, _ := strconv.Atoi(c.Param("sid"))

	var schedule models.Schedule
	if err := db.Where("id = ? AND is_deleted = 0", sid).First(&schedule).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "排课不存在"})
		return
	}

	var body struct {
		Title         string `json:"title"`
		ScheduledDate string `json:"scheduledDate"`
		StartTime     string `json:"startTime"`
		EndTime       string `json:"endTime"`
		Notes         string `json:"notes"`
	}
	c.ShouldBindJSON(&body)

	vals := map[string]any{}
	if body.Title != "" {
		vals["title"] = body.Title
	}
	if body.ScheduledDate != "" {
		if d, err := time.Parse("2006-01-02", body.ScheduledDate); err == nil {
			vals["scheduled_date"] = d
		}
	}
	if body.StartTime != "" {
		vals["start_time"] = body.StartTime
	}
	if body.EndTime != "" {
		vals["end_time"] = body.EndTime
	}
	if body.Notes != "" {
		vals["notes"] = body.Notes
	}
	db.Model(&schedule).Updates(vals)
	response.Success(c, "success", schedule)
}

func (h *Handlers) handleDeleteSchedule(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	sid, _ := strconv.Atoi(c.Param("sid"))
	db.Model(&models.Schedule{}).Where("id = ?", sid).Update("is_deleted", 1)
	response.Success(c, "success", nil)
}

func (h *Handlers) handleListScheduleStudents(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	sid, _ := strconv.Atoi(c.Param("sid"))

	var ss []models.ScheduleStudent
	db.Where("schedule_id = ?", sid).Preload("Student").Find(&ss)
	response.Success(c, "success", ss)
}

func (h *Handlers) handleAddScheduleStudent(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	sid, _ := strconv.Atoi(c.Param("sid"))

	var body struct {
		StudentID uint `json:"studentId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误"})
		return
	}

	// 检查用户存在
	var student models.User
	if err := db.Where("id = ? AND role = ?", body.StudentID, models.RoleStudent).First(&student).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "学员不存在或角色不是 student"})
		return
	}

	// 防重复
	var existing models.ScheduleStudent
	if err := db.Where("schedule_id = ? AND student_id = ?", sid, body.StudentID).First(&existing).Error; err == nil {
		response.Success(c, "已在列表中", existing)
		return
	}

	ss := models.ScheduleStudent{ScheduleID: uint(sid), StudentID: body.StudentID}
	db.Create(&ss)
	response.Success(c, "success", ss)
}

func (h *Handlers) handleRemoveScheduleStudent(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	sid, _ := strconv.Atoi(c.Param("sid"))
	uid, _ := strconv.Atoi(c.Param("uid"))
	db.Where("schedule_id = ? AND student_id = ?", sid, uid).Delete(&models.ScheduleStudent{})
	response.Success(c, "success", nil)
}

// ── Admin: Search users ───────────────────────────────────────────────────────

func (h *Handlers) handleSearchUsers(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	q := c.Query("q")
	role := c.Query("role") // "user" or "student"

	tx := db.Model(&models.User{})
	if role != "" {
		tx = tx.Where("role = ?", role)
	}
	if q != "" {
		tx = tx.Where("username LIKE ? OR display_name LIKE ?", "%"+q+"%", "%"+q+"%")
	}

	var users []struct {
		ID          uint   `json:"id"`
		Username    string `json:"username"`
		DisplayName string `json:"displayName"`
		Role        string `json:"role"`
		Avatar      string `json:"avatar"`
	}
	tx.Select("id", "username", "display_name", "role", "avatar").Limit(20).Find(&users)
	response.Success(c, "success", users)
}

// ── Teacher: today's schedule + class session ops ─────────────────────────────

func (h *Handlers) handleTeacherToday(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)

	today := time.Now()
	schedules, err := models.GetSchedulesByDate(db, user.ID, today)
	if err != nil {
		response.Fail(c, "查询失败", err)
		return
	}

	// 返回精简字段，避免把 students/user 结构全部下发
	type TeacherScheduleItem struct {
		ID            uint              `json:"id"`
		ScheduledDate time.Time         `json:"scheduledDate"`
		StartTime     string            `json:"startTime"`
		EndTime       string            `json:"endTime"`
		Title         string            `json:"title"`
		Course        *struct {
			ID   uint   `json:"id"`
			Name string `json:"name"`
		} `json:"course,omitempty"`
		Students []string `json:"students,omitempty"`
		Status   string   `json:"status"` // planned / in_progress / completed
		Session  *struct {
			ID              uint       `json:"id"`
			Status          string     `json:"status"`
			StartedAt       *time.Time `json:"startedAt"`
			EndedAt         *time.Time `json:"endedAt"`
			DurationMinutes int        `json:"durationMinutes"`
		} `json:"session,omitempty"`
	}
	result := make([]TeacherScheduleItem, 0, len(schedules))
	for _, s := range schedules {
		var session models.ClassSession
		err := db.
			Where("schedule_id = ?", s.ID).
			Order("CASE WHEN status = 'in_progress' THEN 0 ELSE 1 END, created_at DESC").
			First(&session).Error
		var sp *models.ClassSession
		if err == nil {
			if session.Status == "in_progress" {
				plannedEnd, peErr := parsePlannedEndAt(s.ScheduledDate, s.StartTime, s.EndTime)
				if peErr == nil && time.Now().After(plannedEnd) {
					if endErr := endSessionAsCompleted(db, &session, time.Now()); endErr == nil {
						// reload updated values in memory
					}
				}
			}
			sp = &session
		}
		item := TeacherScheduleItem{
			ID:            s.ID,
			ScheduledDate: s.ScheduledDate,
			StartTime:     s.StartTime,
			EndTime:       s.EndTime,
			Title:         s.Title,
			Status:        "planned",
		}
		if s.Course != nil {
			item.Course = &struct {
				ID   uint   `json:"id"`
				Name string `json:"name"`
			}{ID: s.Course.ID, Name: s.Course.Name}
		}
		if len(s.Students) > 0 {
			students := make([]string, 0, len(s.Students))
			for _, ss := range s.Students {
				if ss.Student != nil {
					if ss.Student.DisplayName != "" {
						students = append(students, ss.Student.DisplayName)
					} else {
						students = append(students, ss.Student.Username)
					}
				}
			}
			if len(students) > 0 {
				item.Students = students
			}
		}
		if sp != nil {
			item.Status = sp.Status
			item.Session = &struct {
				ID              uint       `json:"id"`
				Status          string     `json:"status"`
				StartedAt       *time.Time `json:"startedAt"`
				EndedAt         *time.Time `json:"endedAt"`
				DurationMinutes int        `json:"durationMinutes"`
			}{
				ID:              sp.ID,
				Status:          sp.Status,
				StartedAt:       sp.StartedAt,
				EndedAt:         sp.EndedAt,
				DurationMinutes: sp.DurationMinutes,
			}
		}
		result = append(result, item)
	}

	response.Success(c, "success", gin.H{
		"date":      today.Format("2006-01-02"),
		"schedules": result,
	})
}

// handleTeacherTrainingRecords GET /teacher/records?page=1&pageSize=20&status=completed|not-started|in-progress
func (h *Handlers) handleTeacherTrainingRecords(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page <= 0 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 50 {
		pageSize = 50
	}
	statusQ := strings.TrimSpace(c.Query("status"))

	tx := db.Model(&models.Schedule{}).
		Joins("JOIN courses ON courses.id = schedules.course_id").
		Where("courses.teacher_id = ? AND schedules.is_deleted = 0", user.ID)

	var total int64
	_ = tx.Count(&total).Error

	var schedules []models.Schedule
	_ = tx.Preload("Course").
		Preload("Students.Student").
		Order("schedules.scheduled_date DESC, schedules.start_time DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&schedules).Error

	type TrainingRecordItem struct {
		ID              uint   `json:"id"`
		RowKind         string `json:"rowKind"` // schedule | student_record
		ScheduleID      uint   `json:"scheduleId,omitempty"`
		Name            string `json:"name"`
		AppointmentTime string `json:"appointmentTime"`
		Duration        string `json:"duration"`
		Coach           string `json:"coach"`
		Student         string `json:"student"`
		Status          string `json:"status"`
	}

	records := make([]TrainingRecordItem, 0, len(schedules))
	for _, s := range schedules {
		// last session for this schedule (in_progress first)
		var session models.ClassSession
		var sp *models.ClassSession
		if err := db.
			Where("schedule_id = ?", s.ID).
			Order("CASE WHEN status = 'in_progress' THEN 0 ELSE 1 END, created_at DESC").
			First(&session).Error; err == nil {
			if session.Status == "in_progress" {
				plannedEnd, peErr := parsePlannedEndAt(s.ScheduledDate, s.StartTime, s.EndTime)
				if peErr == nil && time.Now().After(plannedEnd) {
					_ = endSessionAsCompleted(db, &session, time.Now())
				}
			}
			sp = &session
		}

		status := "not-started"
		if sp != nil {
			status = sp.Status
			if status == "pending" {
				status = "not-started"
			}
		}
		if statusQ != "" {
			if statusQ != status {
				continue
			}
		}

		coach := user.Username
		if user.DisplayName != "" {
			coach = user.DisplayName
		}

		studentNames := make([]string, 0)
		for _, ss := range s.Students {
			if ss.Student == nil {
				continue
			}
			if ss.Student.DisplayName != "" {
				studentNames = append(studentNames, ss.Student.DisplayName)
			} else if ss.Student.Username != "" {
				studentNames = append(studentNames, ss.Student.Username)
			}
		}
		studentJoined := strings.Join(studentNames, "、")

		durMin := 0
		if start, err := parseClock(s.ScheduledDate, s.StartTime); err == nil {
			if end, err2 := parseClock(s.ScheduledDate, s.EndTime); err2 == nil {
				if end.Before(start) {
					end = end.Add(24 * time.Hour)
				}
				durMin = int(end.Sub(start).Minutes())
				if durMin < 0 {
					durMin = 0
				}
			}
		}
		durStr := ""
		if durMin > 0 {
			durStr = strconv.Itoa(durMin) + "分钟"
		}

		name := s.Title
		if name == "" && s.Course != nil {
			name = s.Course.Name
		}

		appt := s.ScheduledDate.Format("2006-01-02") + " " + s.StartTime

		// 已下课：每人一条记录（一对多）
		if sp != nil && sp.Status == "completed" {
			var recs []models.StudentClassRecord
			_ = db.Preload("Student").Where("class_session_id = ?", sp.ID).Order("id ASC").Find(&recs).Error
			if len(recs) > 0 {
				for _, r := range recs {
					stName := ""
					if r.Student != nil {
						if r.Student.DisplayName != "" {
							stName = r.Student.DisplayName
						} else {
							stName = r.Student.Username
						}
					}
					durDone := durStr
					if r.DurationMinutes > 0 {
						durDone = strconv.Itoa(r.DurationMinutes) + "分钟"
					}
					records = append(records, TrainingRecordItem{
						ID:              r.ID,
						RowKind:         "student_record",
						ScheduleID:      s.ID,
						Name:            name,
						AppointmentTime: appt,
						Duration:        durDone,
						Coach:           coach,
						Student:         stName,
						Status:          "completed",
					})
				}
				continue
			}
		}

		records = append(records, TrainingRecordItem{
			ID:              s.ID,
			RowKind:         "schedule",
			ScheduleID:      s.ID,
			Name:            name,
			AppointmentTime: appt,
			Duration:        durStr,
			Coach:           coach,
			Student:         studentJoined,
			Status:          status,
		})
	}

	response.Success(c, "success", gin.H{
		"page":     page,
		"pageSize": pageSize,
		"total":    total,
		"records":  records,
	})
}

func parseClock(d time.Time, clock string) (time.Time, error) {
	loc := d.Location()
	if loc == nil {
		loc = time.Local
	}
	var h, m int
	if _, err := fmt.Sscanf(clock, "%d:%d", &h, &m); err != nil {
		return time.Time{}, err
	}
	return time.Date(d.Year(), d.Month(), d.Day(), h, m, 0, 0, loc), nil
}

func (h *Handlers) handleStartClass(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	sid, _ := strconv.Atoi(c.Param("sid"))

	// 验证排课属于该老师的课程
	var schedule models.Schedule
	if err := db.Joins("JOIN courses ON courses.id = schedules.course_id").
		Where("schedules.id = ? AND courses.teacher_id = ?", sid, user.ID).
		First(&schedule).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 403, "msg": "无权操作此排课"})
		return
	}

	// 检查是否已有进行中的 session（避免重复开始）
	var existing models.ClassSession
	if err := db.Where("schedule_id = ? AND status = ?", sid, "in_progress").First(&existing).Error; err == nil {
		response.Success(c, "已在上课中", existing)
		return
	}

	now := time.Now()
	session := models.ClassSession{
		ScheduleID: uint(sid),
		TeacherID:  user.ID,
		StartedAt:  &now,
		Status:     "in_progress",
	}
	if err := db.Create(&session).Error; err != nil {
		response.Fail(c, "创建失败", err)
		return
	}
	response.Success(c, "success", session)
}

func (h *Handlers) handleEndClass(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	sid, _ := strconv.Atoi(c.Param("sid"))

	var session models.ClassSession
	if err := db.Where("schedule_id = ? AND teacher_id = ? AND status = ?", sid, user.ID, "in_progress").
		First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "未找到进行中的课程"})
		return
	}

	now := time.Now()
	duration := 0
	if session.StartedAt != nil {
		duration = int(now.Sub(*session.StartedAt).Minutes())
	}

	db.Model(&session).Updates(map[string]any{
		"ended_at":         &now,
		"status":           "completed",
		"duration_minutes": duration,
	})
	session.EndedAt = &now
	session.Status = "completed"
	session.DurationMinutes = duration

	if err := ensureStudentClassRecords(db, &session); err != nil {
		response.Fail(c, "写入学员上课记录失败", err)
		return
	}

	response.Success(c, "success", session)
}

func (h *Handlers) handleGetClassSession(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	sid, _ := strconv.Atoi(c.Param("sid"))

	var session models.ClassSession
	if err := db.Where("schedule_id = ? AND teacher_id = ?", sid, user.ID).
		Preload("Schedule.Students.Student").
		First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "未找到"})
		return
	}
	response.Success(c, "success", session)
}

// ── Student: my schedules ─────────────────────────────────────────────────────

func (h *Handlers) handleStudentSchedules(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)

	schedules, err := models.GetStudentSchedules(db, user.ID)
	if err != nil {
		response.Fail(c, "查询失败", err)
		return
	}
	response.Success(c, "success", schedules)
}

// handleStudentClassRecords GET /student/class-records?page=1&pageSize=20
func (h *Handlers) handleStudentClassRecords(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page <= 0 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 50 {
		pageSize = 50
	}

	tx := db.Model(&models.StudentClassRecord{}).Where("student_id = ?", user.ID)
	var total int64
	_ = tx.Count(&total).Error

	var recs []models.StudentClassRecord
	_ = tx.Preload("Course").
		Preload("Student").
		Order("ended_at DESC, id DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&recs).Error

	type Item struct {
		ID              uint   `json:"id"`
		Name            string `json:"name"`
		AppointmentTime string `json:"appointmentTime"`
		Duration        string `json:"duration"`
		Coach           string `json:"coach"`
		Student         string `json:"student"`
		Status          string `json:"status"`
		RowKind         string `json:"rowKind"`
		ScheduleID      uint   `json:"scheduleId,omitempty"`
	}
	out := make([]Item, 0, len(recs))
	for _, r := range recs {
		var sched models.Schedule
		appt := ""
		_ = db.Select("scheduled_date", "start_time").Where("id = ?", r.ScheduleID).First(&sched).Error
		if !sched.ScheduledDate.IsZero() {
			appt = sched.ScheduledDate.Format("2006-01-02") + " " + sched.StartTime
		}
		name := ""
		if r.Course != nil {
			name = r.Course.Name
		}
		coach := ""
		var tch models.User
		if err := db.Select("username", "display_name").Where("id = ?", r.TeacherID).First(&tch).Error; err == nil {
			if tch.DisplayName != "" {
				coach = tch.DisplayName
			} else {
				coach = tch.Username
			}
		}
		student := ""
		if r.Student != nil {
			if r.Student.DisplayName != "" {
				student = r.Student.DisplayName
			} else {
				student = r.Student.Username
			}
		}
		durStr := ""
		if r.DurationMinutes > 0 {
			durStr = strconv.Itoa(r.DurationMinutes) + "分钟"
		}
		out = append(out, Item{
			ID:              r.ID,
			Name:            name,
			AppointmentTime: appt,
			Duration:        durStr,
			Coach:           coach,
			Student:         student,
			Status:          "completed",
			RowKind:         "student_record",
			ScheduleID:      r.ScheduleID,
		})
	}

	response.Success(c, "success", gin.H{
		"page":     page,
		"pageSize": pageSize,
		"total":    total,
		"records":  out,
	})
}

// handleTeacherWeek GET /teacher/week?date=2026-03-17
// 返回指定日期所在周（周一~周日）的所有排课，附带 session 状态
func (h *Handlers) handleTeacherWeek(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)

	dateStr := c.Query("date")
	var ref time.Time
	if dateStr != "" {
		var err error
		ref, err = time.Parse("2006-01-02", dateStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "date 格式错误，请用 YYYY-MM-DD"})
			return
		}
	} else {
		ref = time.Now()
	}

	// 计算本周周一
	weekday := int(ref.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	weekStart := ref.AddDate(0, 0, -(weekday - 1))
	weekStart = time.Date(weekStart.Year(), weekStart.Month(), weekStart.Day(), 0, 0, 0, 0, weekStart.Location())
	weekEnd := weekStart.AddDate(0, 0, 7)

	var schedules []models.Schedule
	db.Joins("JOIN courses ON courses.id = schedules.course_id").
		Where("courses.teacher_id = ? AND schedules.scheduled_date >= ? AND schedules.scheduled_date < ? AND schedules.is_deleted = 0",
			user.ID, weekStart, weekEnd).
		Preload("Course").
		Preload("Students.Student").
		Order("schedules.scheduled_date ASC, schedules.start_time ASC").
		Find(&schedules)

	type TeacherScheduleItem struct {
		ID            uint              `json:"id"`
		ScheduledDate time.Time         `json:"scheduledDate"`
		StartTime     string            `json:"startTime"`
		EndTime       string            `json:"endTime"`
		Title         string            `json:"title"`
		Course        *struct {
			ID   uint   `json:"id"`
			Name string `json:"name"`
		} `json:"course,omitempty"`
		Students []string `json:"students,omitempty"`
		Status   string   `json:"status"`
		Session  *struct {
			ID              uint       `json:"id"`
			Status          string     `json:"status"`
			StartedAt       *time.Time `json:"startedAt"`
			EndedAt         *time.Time `json:"endedAt"`
			DurationMinutes int        `json:"durationMinutes"`
		} `json:"session,omitempty"`
	}
	result := make([]TeacherScheduleItem, 0, len(schedules))
	for _, s := range schedules {
		var session models.ClassSession
		var sp *models.ClassSession
		if err := db.
			Where("schedule_id = ?", s.ID).
			Order("CASE WHEN status = 'in_progress' THEN 0 ELSE 1 END, created_at DESC").
			First(&session).Error; err == nil {
			if session.Status == "in_progress" {
				plannedEnd, peErr := parsePlannedEndAt(s.ScheduledDate, s.StartTime, s.EndTime)
				if peErr == nil && time.Now().After(plannedEnd) {
					_ = endSessionAsCompleted(db, &session, time.Now())
				}
			}
			sp = &session
		}
		item := TeacherScheduleItem{
			ID:            s.ID,
			ScheduledDate: s.ScheduledDate,
			StartTime:     s.StartTime,
			EndTime:       s.EndTime,
			Title:         s.Title,
			Status:        "planned",
		}
		if s.Course != nil {
			item.Course = &struct {
				ID   uint   `json:"id"`
				Name string `json:"name"`
			}{ID: s.Course.ID, Name: s.Course.Name}
		}
		if len(s.Students) > 0 {
			students := make([]string, 0, len(s.Students))
			for _, ss := range s.Students {
				if ss.Student != nil {
					if ss.Student.DisplayName != "" {
						students = append(students, ss.Student.DisplayName)
					} else {
						students = append(students, ss.Student.Username)
					}
				}
			}
			if len(students) > 0 {
				item.Students = students
			}
		}
		if sp != nil {
			item.Status = sp.Status
			item.Session = &struct {
				ID              uint       `json:"id"`
				Status          string     `json:"status"`
				StartedAt       *time.Time `json:"startedAt"`
				EndedAt         *time.Time `json:"endedAt"`
				DurationMinutes int        `json:"durationMinutes"`
			}{
				ID:              sp.ID,
				Status:          sp.Status,
				StartedAt:       sp.StartedAt,
				EndedAt:         sp.EndedAt,
				DurationMinutes: sp.DurationMinutes,
			}
		}
		result = append(result, item)
	}

	response.Success(c, "success", gin.H{
		"weekStart": weekStart.Format("2006-01-02"),
		"weekEnd":   weekEnd.AddDate(0, 0, -1).Format("2006-01-02"),
		"schedules": result,
	})
}


func parsePlannedEndAt(scheduledDate time.Time, startTimeStr string, endTimeStr string) (time.Time, error) {
	loc := scheduledDate.Location()
	if loc == nil {
		loc = time.Local
	}
	var eh, em int
	if _, err := fmt.Sscanf(endTimeStr, "%d:%d", &eh, &em); err != nil {
		return time.Time{}, err
	}
	end := time.Date(scheduledDate.Year(), scheduledDate.Month(), scheduledDate.Day(), eh, em, 0, 0, loc)

	// 跨天：endTime < startTime 视为次日结束
	var sh, sm int
	if _, err := fmt.Sscanf(startTimeStr, "%d:%d", &sh, &sm); err == nil {
		start := time.Date(scheduledDate.Year(), scheduledDate.Month(), scheduledDate.Day(), sh, sm, 0, 0, loc)
		if end.Before(start) {
			end = end.Add(24 * time.Hour)
		}
	}

	return end, nil
}

func endSessionAsCompleted(db *gorm.DB, session *models.ClassSession, now time.Time) error {
	duration := 0
	if session.StartedAt != nil {
		duration = int(now.Sub(*session.StartedAt).Minutes())
		if duration < 0 {
			duration = 0
		}
	}
	if err := db.Model(session).Updates(map[string]any{
		"ended_at":         &now,
		"status":           "completed",
		"duration_minutes": duration,
	}).Error; err != nil {
		return err
	}
	session.EndedAt = &now
	session.Status = "completed"
	session.DurationMinutes = duration
	return ensureStudentClassRecords(db, session)
}

// ensureStudentClassRecords 下课完成后为排课内每位学员各写一条记录（幂等）
func ensureStudentClassRecords(db *gorm.DB, session *models.ClassSession) error {
	var existingCnt int64
	if err := db.Model(&models.StudentClassRecord{}).Where("class_session_id = ?", session.ID).Count(&existingCnt).Error; err != nil {
		return err
	}
	if existingCnt > 0 {
		return nil
	}
	var schedule models.Schedule
	if err := db.Preload("Students").Where("id = ? AND is_deleted = 0", session.ScheduleID).First(&schedule).Error; err != nil {
		return nil
	}
	if len(schedule.Students) == 0 {
		return nil
	}
	duration := session.DurationMinutes
	endAt := session.EndedAt
	for _, st := range schedule.Students {
		rec := models.StudentClassRecord{
			ClassSessionID:  session.ID,
			ScheduleID:      session.ScheduleID,
			CourseID:        schedule.CourseID,
			StudentID:       st.StudentID,
			TeacherID:       session.TeacherID,
			StartedAt:       session.StartedAt,
			EndedAt:         endAt,
			DurationMinutes: duration,
			Status:          "completed",
		}
		if err := db.Create(&rec).Error; err != nil {
			return err
		}
	}
	return nil
}

// handleStudentWeek GET /student/week?date=2026-03-17
// 返回学员所在周的排课
func (h *Handlers) handleStudentWeek(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)

	dateStr := c.Query("date")
	var ref time.Time
	if dateStr != "" {
		var err error
		ref, err = time.Parse("2006-01-02", dateStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "date 格式错误"})
			return
		}
	} else {
		ref = time.Now()
	}

	weekday := int(ref.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	weekStart := ref.AddDate(0, 0, -(weekday - 1))
	weekStart = time.Date(weekStart.Year(), weekStart.Month(), weekStart.Day(), 0, 0, 0, 0, weekStart.Location())
	weekEnd := weekStart.AddDate(0, 0, 7)

	var schedules []models.Schedule
	db.Joins("JOIN schedule_students ss ON ss.schedule_id = schedules.id").
		Where("ss.student_id = ? AND schedules.scheduled_date >= ? AND schedules.scheduled_date < ? AND schedules.is_deleted = 0",
			user.ID, weekStart, weekEnd).
		Preload("Course").
		Order("schedules.scheduled_date ASC, schedules.start_time ASC").
		Find(&schedules)

	response.Success(c, "success", gin.H{
		"weekStart": weekStart.Format("2006-01-02"),
		"weekEnd":   weekEnd.AddDate(0, 0, -1).Format("2006-01-02"),
		"schedules": schedules,
	})
}

// handleTeacherStudents GET /teacher/students
// 返回当前老师所教的所有学员（从排课 schedule_students 去重得出）
func (h *Handlers) handleTeacherStudents(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)

	var students []models.User
	// 优先：按老师 -> 课程 -> 班级课程 -> 班级学员 -> 学员
	err := db.Table("users u").
		Select("DISTINCT u.*").
		Joins("JOIN class_students cs ON cs.student_id = u.id").
		Joins("JOIN class_courses cc ON cc.class_id = cs.class_id").
		Joins("JOIN courses c ON c.id = cc.course_id").
		Where("c.teacher_id = ? AND u.role = ? AND u.is_deleted = 0 AND c.is_deleted = 0", user.ID, models.RoleStudent).
		Order("u.created_at DESC").
		Find(&students).Error
	if err != nil {
		response.Fail(c, "查询失败", err)
		return
	}

	// 兼容：如果还未建立班级/班级课程关联，则回退到排课学员
	if len(students) == 0 {
		err = db.Table("users u").
			Select("DISTINCT u.*").
			Joins("JOIN schedule_students ss ON ss.student_id = u.id").
			Joins("JOIN schedules s ON s.id = ss.schedule_id").
			Joins("JOIN courses c ON c.id = s.course_id").
			Where("c.teacher_id = ? AND u.role = ? AND u.is_deleted = 0 AND s.is_deleted = 0 AND c.is_deleted = 0", user.ID, models.RoleStudent).
			Order("u.created_at DESC").
			Find(&students).Error
		if err != nil {
			response.Fail(c, "查询失败", err)
			return
		}
	}

	response.Success(c, "success", gin.H{"list": students, "total": len(students)})
}
