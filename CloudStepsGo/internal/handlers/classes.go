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
)

func (h *Handlers) registerClassRoutes(r *gin.RouterGroup) {
	manage := r.Group("classes")
	manage.Use(models.AuthRequired, h.requireAdmin)
	{
		manage.GET("", h.handleListClasses)
		manage.POST("", h.handleCreateClass)
		manage.PUT("/:id", h.handleUpdateClass)
		manage.DELETE("/:id", h.handleDeleteClass)

		// 班级学员
		manage.GET("/:id/students", h.handleListClassStudents)
		manage.POST("/:id/students", h.handleAddClassStudent)
		manage.DELETE("/:id/students/:uid", h.handleRemoveClassStudent)

		// 班级课程
		manage.GET("/:id/courses", h.handleListClassCourses)
		manage.POST("/:id/courses", h.handleAddClassCourse)
		manage.DELETE("/:id/courses/:ccid", h.handleRemoveClassCourse)

		// 班级排课（基于 class_course）
		manage.GET("/:id/schedules", h.handleListClassSchedules)
		manage.POST("/:id/schedules", h.handleCreateClassSchedule)
	}
}

func (h *Handlers) handleListClasses(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	var list []models.Class
	db.Where("is_deleted = 0").Order("created_at DESC").Find(&list)
	response.Success(c, "success", list)
}

func (h *Handlers) handleCreateClass(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)

	var body struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误"})
		return
	}

	cls := models.Class{Name: body.Name, Description: body.Description, CreatedByID: user.ID}
	if err := db.Create(&cls).Error; err != nil {
		response.Fail(c, "创建失败", err)
		return
	}
	response.Success(c, "success", cls)
}

func (h *Handlers) handleUpdateClass(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	id, _ := strconv.Atoi(c.Param("id"))

	var cls models.Class
	if err := db.Where("id = ? AND is_deleted = 0", id).First(&cls).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "班级不存在"})
		return
	}

	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	_ = c.ShouldBindJSON(&body)

	vals := map[string]any{}
	if body.Name != "" {
		vals["name"] = body.Name
	}
	if body.Description != "" {
		vals["description"] = body.Description
	}
	if len(vals) > 0 {
		_ = db.Model(&cls).Updates(vals).Error
	}
	response.Success(c, "success", cls)
}

func (h *Handlers) handleDeleteClass(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	id, _ := strconv.Atoi(c.Param("id"))
	db.Model(&models.Class{}).Where("id = ?", id).Update("is_deleted", 1)
	response.Success(c, "success", nil)
}

func (h *Handlers) handleListClassStudents(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	cid, _ := strconv.Atoi(c.Param("id"))

	var ss []models.ClassStudent
	db.Where("class_id = ?", cid).Preload("Student").Find(&ss)
	response.Success(c, "success", ss)
}

func (h *Handlers) handleAddClassStudent(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	cid, _ := strconv.Atoi(c.Param("id"))

	var body struct {
		StudentID uint `json:"studentId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误"})
		return
	}

	var student models.User
	if err := db.Where("id = ? AND role = ?", body.StudentID, models.RoleStudent).First(&student).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "学员不存在或角色不是 student"})
		return
	}

	var existing models.ClassStudent
	if err := db.Where("class_id = ? AND student_id = ?", cid, body.StudentID).First(&existing).Error; err == nil {
		response.Success(c, "已在班级中", existing)
		return
	}

	rel := models.ClassStudent{ClassID: uint(cid), StudentID: body.StudentID}
	if err := db.Create(&rel).Error; err != nil {
		response.Fail(c, "添加失败", err)
		return
	}
	response.Success(c, "success", rel)
}

func (h *Handlers) handleRemoveClassStudent(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	cid, _ := strconv.Atoi(c.Param("id"))
	uid, _ := strconv.Atoi(c.Param("uid"))
	db.Where("class_id = ? AND student_id = ?", cid, uid).Delete(&models.ClassStudent{})
	response.Success(c, "success", nil)
}

func (h *Handlers) handleListClassCourses(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	cid, _ := strconv.Atoi(c.Param("id"))

	var list []models.ClassCourse
	db.Where("class_id = ?", cid).Preload("Course.Teacher").Preload("Course.WordBook").Find(&list)
	response.Success(c, "success", list)
}

func (h *Handlers) handleAddClassCourse(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	cid, _ := strconv.Atoi(c.Param("id"))

	var body struct {
		CourseID uint `json:"courseId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误"})
		return
	}

	var course models.Course
	if err := db.Where("id = ? AND is_deleted = 0", body.CourseID).First(&course).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "课程不存在"})
		return
	}

	var existing models.ClassCourse
	if err := db.Where("class_id = ? AND course_id = ?", cid, body.CourseID).First(&existing).Error; err == nil {
		response.Success(c, "已绑定", existing)
		return
	}

	rel := models.ClassCourse{ClassID: uint(cid), CourseID: body.CourseID}
	if err := db.Create(&rel).Error; err != nil {
		response.Fail(c, "绑定失败", err)
		return
	}
	response.Success(c, "success", rel)
}

func (h *Handlers) handleRemoveClassCourse(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	cid, _ := strconv.Atoi(c.Param("id"))
	ccid, _ := strconv.Atoi(c.Param("ccid"))
	db.Where("id = ? AND class_id = ?", ccid, cid).Delete(&models.ClassCourse{})
	response.Success(c, "success", nil)
}

func (h *Handlers) handleListClassSchedules(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	cid, _ := strconv.Atoi(c.Param("id"))

	var schedules []models.Schedule
	db.Joins("JOIN class_courses cc ON cc.id = schedules.class_course_id").
		Where("cc.class_id = ? AND schedules.is_deleted = 0", cid).
		Preload("Course").
		Preload("Students.Student").
		Order("scheduled_date ASC").
		Find(&schedules)
	response.Success(c, "success", schedules)
}

func (h *Handlers) handleCreateClassSchedule(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	cid, _ := strconv.Atoi(c.Param("id"))

	var body struct {
		ClassCourseID uint   `json:"classCourseId" binding:"required"`
		Title         string `json:"title"`
		ScheduledDate string `json:"scheduledDate" binding:"required"` // "2026-03-20"
		StartTime     string `json:"startTime" binding:"required"`     // "09:00"
		EndTime       string `json:"endTime" binding:"required"`       // "10:30"
		Notes         string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误"})
		return
	}

	var cc models.ClassCourse
	if err := db.Where("id = ? AND class_id = ?", body.ClassCourseID, cid).First(&cc).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "班级课程不存在"})
		return
	}

	date, err := time.Parse("2006-01-02", body.ScheduledDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "日期格式错误，请用 YYYY-MM-DD"})
		return
	}

	schedule := models.Schedule{
		CourseID:       cc.CourseID,
		ClassCourseID:  cc.ID,
		Title:          body.Title,
		ScheduledDate:  date,
		StartTime:      body.StartTime,
		EndTime:        body.EndTime,
		Notes:          body.Notes,
	}

	// 创建排课 + 自动把班级学员同步到 schedule_students
	if err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&schedule).Error; err != nil {
			return err
		}

		var cs []models.ClassStudent
		if err := tx.Where("class_id = ?", cid).Find(&cs).Error; err != nil {
			return err
		}
		if len(cs) == 0 {
			return nil
		}

		rows := make([]models.ScheduleStudent, 0, len(cs))
		for _, s := range cs {
			rows = append(rows, models.ScheduleStudent{ScheduleID: schedule.ID, StudentID: s.StudentID})
		}
		return tx.CreateInBatches(&rows, 100).Error
	}); err != nil {
		response.Fail(c, "创建失败", err)
		return
	}

	response.Success(c, "success", schedule)
}
