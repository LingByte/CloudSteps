package models

import (
	"time"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	common "github.com/LingByte/ling-base/common"
)

type StudySession struct {
	common.BaseModel
	UserID               uint       `json:"userId" gorm:"index;index:idx_user_type_created;not null"`
	StudentID            uint       `json:"studentId" gorm:"index;default:0;comment:老师代练时的学员ID，0表示本人自练"`
	WordBookID           uint       `json:"wordBookId" gorm:"index"`
	SessionType          string     `json:"sessionType" gorm:"size:20;not null;index:idx_user_type_created"`
	Status               string     `json:"status" gorm:"size:20;default:'in_progress';index"`
	StartedAt            time.Time  `json:"startedAt"`
	CompletedAt          *time.Time `json:"completedAt"`
	WordCount            int        `json:"wordCount" gorm:"default:0"`
	CorrectCount         int        `json:"correctCount" gorm:"default:0"`
	ScreenedKnownCount   int        `json:"screenedKnownCount" gorm:"default:0;comment:本课筛词熟词数"`
	ScreenedUnknownCount int        `json:"screenedUnknownCount" gorm:"default:0;comment:本课筛词生词/新词数"`
	ReportSummary        string     `json:"reportSummary,omitempty" gorm:"type:text;comment:课堂报告 AI 摘要缓存"`
}

func (StudySession) TableName() string { return constants.TABLE_STUDY_SESSIONS }

type SessionWord struct {
	common.BaseModel
	SessionID  uint       `json:"sessionId" gorm:"uniqueIndex:uidx_session_word;index;not null"`
	WordID     uint       `json:"wordId" gorm:"uniqueIndex:uidx_session_word;not null"`
	Remembered *bool      `json:"remembered"`
	AnsweredAt *time.Time `json:"answeredAt"`
}

func (SessionWord) TableName() string { return constants.TABLE_SESSION_WORDS }
