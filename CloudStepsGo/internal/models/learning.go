package models

import (
	"time"

	"github.com/LingByte/CloudStepsGo/pkg/constants"
)

// 艾宾浩斯复习间隔（天数）
var EbbinghausIntervals = []int{0, 1, 2, 4, 7, 15, 30, 45, 60, 90}

// UserWordBook 用户选择的词库
type UserWordBook struct {
	BaseModel
	UserID      uint       `json:"userId" gorm:"uniqueIndex:uidx_user_wordbook;not null"`
	WordBookID  uint       `json:"wordBookId" gorm:"uniqueIndex:uidx_user_wordbook;not null"`
	Status      string     `json:"status" gorm:"size:20;default:'active'"`
	ScreenProgress  int        `json:"screenProgress" gorm:"default:0"`
	ScreenCompleted bool       `json:"screenCompleted" gorm:"default:false"`
	StartedAt   *time.Time `json:"startedAt"`
	CompletedAt *time.Time `json:"completedAt"`
}

func (UserWordBook) TableName() string { return constants.TABLE_USER_WORD_BOOKS }

// UserWordState 用户-单词学习状态（核心）
type UserWordState struct {
	BaseModel
	UserID       uint       `json:"userId" gorm:"uniqueIndex:uidx_user_word;not null"`
	WordID       uint       `json:"wordId" gorm:"uniqueIndex:uidx_user_word;not null"`
	WordBookID   uint       `json:"wordBookId" gorm:"index;not null"`
	ScreenResult string     `json:"screenResult" gorm:"size:10"`
	ScreenAt     *time.Time `json:"screenAt"`
	LearnStatus  string     `json:"learnStatus" gorm:"size:20;default:'pending'"`
	ReviewStage  int        `json:"reviewStage" gorm:"default:0"`
	FirstLearnedAt *time.Time `json:"firstLearnedAt"`
	LastReviewedAt *time.Time `json:"lastReviewedAt"`
	NextReviewAt   *time.Time `json:"nextReviewAt" gorm:"index"`
	MasteredAt     *time.Time `json:"masteredAt"`
}

func (UserWordState) TableName() string { return constants.TABLE_USER_WORD_STATES }

// ReviewQueue 每个用户每个单词一条“当前待复习任务”
type ReviewQueue struct {
	BaseModel
	UserID     uint      `json:"userId" gorm:"uniqueIndex:uidx_user_word_queue;index:idx_user_due;index:idx_user_book_due;not null"`
	WordID     uint      `json:"wordId" gorm:"uniqueIndex:uidx_user_word_queue;not null"`
	WordBookID uint      `json:"wordBookId" gorm:"index:idx_user_book_due;not null"`
	DueAt      time.Time `json:"dueAt" gorm:"index:idx_user_due;index:idx_user_book_due;not null"`
	Stage      int       `json:"stage" gorm:"default:0"`
	Status     string    `json:"status" gorm:"size:20;default:'pending';index"`
}

func (ReviewQueue) TableName() string { return constants.TABLE_REVIEW_QUEUE }
