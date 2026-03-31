package models

// Class 班级
type Class struct {
	BaseModel
	Name        string `json:"name" gorm:"size:128;not null"`
	Description string `json:"description" gorm:"size:512"`
	CreatedByID uint   `json:"createdById" gorm:"index"`
}

func (Class) TableName() string { return "classes" }

// ClassCourse 班级-课程关联（多对多）
type ClassCourse struct {
	ID       uint `json:"id" gorm:"primaryKey;autoIncrement"`
	ClassID  uint `json:"classId" gorm:"index;not null"`
	CourseID uint `json:"courseId" gorm:"index;not null"`

	Course *Course `json:"course,omitempty" gorm:"foreignKey:CourseID"`
}

func (ClassCourse) TableName() string { return "class_courses" }

// ClassStudent 班级-学员关联
type ClassStudent struct {
	ID        uint `json:"id" gorm:"primaryKey;autoIncrement"`
	ClassID   uint `json:"classId" gorm:"index;not null"`
	StudentID uint `json:"studentId" gorm:"index;not null"`

	Student *User `json:"student,omitempty" gorm:"foreignKey:StudentID"`
}

func (ClassStudent) TableName() string { return "class_students" }
