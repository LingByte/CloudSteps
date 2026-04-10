package models

import (
	"time"

	"gorm.io/gorm"
)

// Course 课程
type Course struct {
	BaseModel
	Name        string `json:"name" gorm:"size:128;not null"`
	Description string `json:"description" gorm:"size:512"`
	// ClassType: group 一对多（默认）；one_on_one 一对一（同一排课最多一名学员）
	ClassType   string `json:"classType" gorm:"size:20;default:'group'"`
	WordBookID  uint   `json:"wordBookId" gorm:"index"`
	TeacherID   uint   `json:"teacherId" gorm:"index"`   // user role
	CreatedByID uint   `json:"createdById" gorm:"index"` // admin who created
	// preload
	Teacher  *User     `json:"teacher,omitempty" gorm:"foreignKey:TeacherID"`
	WordBook *WordBook `json:"wordBook,omitempty" gorm:"foreignKey:WordBookID"`
}

func (Course) TableName() string { return "courses" }

// Schedule 排课
type Schedule struct {
	BaseModel
	CourseID      uint      `json:"courseId" gorm:"index;not null"`
	ClassCourseID uint      `json:"classCourseId" gorm:"index"`
	Title         string    `json:"title" gorm:"size:128"`
	ScheduledDate time.Time `json:"scheduledDate"`            // 上课日期
	StartTime     string    `json:"startTime" gorm:"size:10"` // "09:00"
	EndTime       string    `json:"endTime" gorm:"size:10"`   // "10:30"
	Notes         string    `json:"notes" gorm:"size:512"`

	Course   *Course           `json:"course,omitempty" gorm:"foreignKey:CourseID"`
	Students []ScheduleStudent `json:"students,omitempty" gorm:"foreignKey:ScheduleID"`
}

func (Schedule) TableName() string { return "schedules" }

// ScheduleStudent 排课学员关联（多对多）
type ScheduleStudent struct {
	ID         uint `json:"id" gorm:"primaryKey;autoIncrement"`
	ScheduleID uint `json:"scheduleId" gorm:"index;not null"`
	StudentID  uint `json:"studentId" gorm:"index;not null"` // user with student role

	Student *User `json:"student,omitempty" gorm:"foreignKey:StudentID"`
}

func (ScheduleStudent) TableName() string { return "schedule_students" }

// ClassSession 实际上课记录
type ClassSession struct {
	BaseModel
	ScheduleID      uint       `json:"scheduleId" gorm:"index;not null"`
	TeacherID       uint       `json:"teacherId" gorm:"index;not null"`
	StartedAt       *time.Time `json:"startedAt"`
	EndedAt         *time.Time `json:"endedAt"`
	DurationMinutes int        `json:"durationMinutes" gorm:"default:0"`
	Notes           string     `json:"notes" gorm:"size:512"`
	Status          string     `json:"status" gorm:"size:20;default:'pending'"` // pending / in_progress / completed

	Schedule *Schedule `json:"schedule,omitempty" gorm:"foreignKey:ScheduleID"`
	Teacher  *User     `json:"teacher,omitempty" gorm:"foreignKey:TeacherID"`
}

func (ClassSession) TableName() string { return "class_sessions" }

// StudentClassRecord 下课完成后，每位参课学员一条上课/训练记录（便于一对多分班统计）
type StudentClassRecord struct {
	BaseModel
	ClassSessionID  uint       `json:"classSessionId" gorm:"index;not null"`
	ScheduleID      uint       `json:"scheduleId" gorm:"index;not null"`
	CourseID        uint       `json:"courseId" gorm:"index"`
	StudentID       uint       `json:"studentId" gorm:"index;not null"`
	TeacherID       uint       `json:"teacherId" gorm:"index;not null"`
	StartedAt       *time.Time `json:"startedAt"`
	EndedAt         *time.Time `json:"endedAt"`
	DurationMinutes int        `json:"durationMinutes" gorm:"default:0"`
	Status          string     `json:"status" gorm:"size:20;default:'completed'"`

	Student *User `json:"student,omitempty" gorm:"foreignKey:StudentID"`
	Course  *Course `json:"course,omitempty" gorm:"foreignKey:CourseID"`
}

func (StudentClassRecord) TableName() string { return "student_class_records" }

func GetCoursesByTeacher(db *gorm.DB, teacherID uint) ([]Course, error) {
	var courses []Course
	err := db.Where("teacher_id = ? AND is_deleted = 0", teacherID).
		Preload("WordBook").Find(&courses).Error
	return courses, err
}

func GetSchedulesByDate(db *gorm.DB, teacherID uint, date time.Time) ([]Schedule, error) {
	start := date.Truncate(24 * time.Hour)
	end := start.AddDate(0, 0, 1)
	var schedules []Schedule
	err := db.Joins("JOIN courses ON courses.id = schedules.course_id").
		Where("courses.teacher_id = ? AND schedules.scheduled_date >= ? AND schedules.scheduled_date < ? AND schedules.is_deleted = 0",
			teacherID, start, end).
		Preload("Course").
		Preload("Students.Student").
		Find(&schedules).Error
	return schedules, err
}

func GetStudentSchedules(db *gorm.DB, studentID uint) ([]Schedule, error) {
	var schedules []Schedule
	err := db.Joins("JOIN schedule_students ss ON ss.schedule_id = schedules.id").
		Where("ss.student_id = ? AND schedules.is_deleted = 0", studentID).
		Preload("Course").
		Order("schedules.scheduled_date ASC").
		Find(&schedules).Error
	return schedules, err
}
