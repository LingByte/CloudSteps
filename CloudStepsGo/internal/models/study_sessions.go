package models

import (
	"time"

	"github.com/LingByte/CloudStepsGo/pkg/constants"
)

type StudySession struct {
	BaseModel
	UserID       uint       `json:"userId" gorm:"index;not null"`
	WordBookID   uint       `json:"wordBookId" gorm:"index"`
	SessionType  string     `json:"sessionType" gorm:"size:20;not null"`
	Status       string     `json:"status" gorm:"size:20;default:'in_progress';index"`
	StartedAt    time.Time  `json:"startedAt"`
	CompletedAt  *time.Time `json:"completedAt"`
	WordCount    int        `json:"wordCount" gorm:"default:0"`
	CorrectCount int        `json:"correctCount" gorm:"default:0"`
}

func (StudySession) TableName() string { return constants.TABLE_STUDY_SESSIONS }

type SessionWord struct {
	BaseModel
	SessionID  uint       `json:"sessionId" gorm:"uniqueIndex:uidx_session_word;index;not null"`
	WordID     uint       `json:"wordId" gorm:"uniqueIndex:uidx_session_word;not null"`
	Remembered *bool      `json:"remembered"`
	AnsweredAt *time.Time `json:"answeredAt"`
}

func (SessionWord) TableName() string { return constants.TABLE_SESSION_WORDS }
