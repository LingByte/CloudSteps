package models

import (
	"time"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	common "github.com/LingByte/ling-base/common"
	"gorm.io/gorm"
)

// UserWordBook 用户选择的词库
type UserWordBook struct {
	common.BaseModel
	UserID          uint       `json:"userId" gorm:"uniqueIndex:uidx_user_wordbook;not null"`
	WordBookID      uint       `json:"wordBookId" gorm:"uniqueIndex:uidx_user_wordbook;not null"`
	Status          string     `json:"status" gorm:"size:20;default:'active'"`
	ScreenProgress  int        `json:"screenProgress" gorm:"default:0"`
	ScreenCompleted bool       `json:"screenCompleted" gorm:"default:false"`
	StartedAt       *time.Time `json:"startedAt"`
	CompletedAt     *time.Time `json:"completedAt"`
}

func (UserWordBook) TableName() string { return constants.TABLE_USER_WORD_BOOKS }

// UserHasActiveWordBook 用户是否仍持有该词库（含老师分配给学员的自定义词库）。
func UserHasActiveWordBook(db *gorm.DB, userID, wordBookID uint) bool {
	if userID == 0 || wordBookID == 0 {
		return false
	}
	var n int64
	err := db.Model(&UserWordBook{}).
		Where("user_id = ? AND word_book_id = ? AND status = ?", userID, wordBookID, "active").
		Count(&n).Error
	return err == nil && n > 0
}

// UserWordState 用户-单词学习状态（核心）
type UserWordState struct {
	common.BaseModel
	UserID         uint       `json:"userId" gorm:"uniqueIndex:uidx_user_word;index:idx_user_book_status;index:idx_user_book_screen;not null"`
	WordID         uint       `json:"wordId" gorm:"uniqueIndex:uidx_user_word;not null"`
	WordBookID     uint       `json:"wordBookId" gorm:"index:idx_user_book_status;index:idx_user_book_screen;not null"`
	ScreenResult   string     `json:"screenResult" gorm:"size:10;index:idx_user_book_screen"`
	ScreenAt       *time.Time `json:"screenAt"`
	LearnStatus    string     `json:"learnStatus" gorm:"size:20;default:'pending';index:idx_user_book_status"`
	ReviewStage    int        `json:"reviewStage" gorm:"default:0"`
	FirstLearnedAt *time.Time `json:"firstLearnedAt"`
	LastReviewedAt *time.Time `json:"lastReviewedAt"`
	NextReviewAt   *time.Time `json:"nextReviewAt" gorm:"index"`
	MasteredAt     *time.Time `json:"masteredAt"`
}

func (UserWordState) TableName() string { return constants.TABLE_USER_WORD_STATES }

// ReviewQueue 每个用户每个单词一条“当前待复习任务”
type ReviewQueue struct {
	common.BaseModel
	UserID          uint      `json:"userId" gorm:"uniqueIndex:uidx_user_word_queue;index:idx_user_due;index:idx_user_book_due;index:idx_user_status_due;not null"`
	WordID          uint      `json:"wordId" gorm:"uniqueIndex:uidx_user_word_queue;not null"`
	WordBookID      uint      `json:"wordBookId" gorm:"index:idx_user_book_due;not null"`
	SourceSessionID uint      `json:"sourceSessionId" gorm:"index;default:0;comment:学完写入队列时的识记课次ID"`
	DueAt           time.Time `json:"dueAt" gorm:"index:idx_user_due;index:idx_user_book_due;index:idx_user_status_due;not null"`
	Stage           int       `json:"stage" gorm:"default:0"`
	Status          string    `json:"status" gorm:"size:20;default:'pending';index:idx_user_status_due;index"`
}

func (ReviewQueue) TableName() string { return constants.TABLE_REVIEW_QUEUE }
