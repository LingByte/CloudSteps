package models

import (
	"time"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	common "github.com/LingByte/ling-base/common"
)

const (
	ReadingStatusDraft     = "draft"
	ReadingStatusPublished = "published"
)

// ReadingPassage 阅读理解文章
type ReadingPassage struct {
	common.BaseModel
	Title   string `json:"title" gorm:"size:256;not null;index;comment:文章标题"`
	Level   string `json:"level" gorm:"size:32;index;comment:难度 初阶/中阶/高阶"`
	Content string `json:"content" gorm:"type:text;not null;comment:正文"`
	Summary string `json:"summary" gorm:"size:512;comment:摘要"`
	// KnowledgeJSON AI 知识点缓存；空=未生成，"[]"=已生成但无要点，否则为 [{title,body}]。
	KnowledgeJSON    string `json:"-" gorm:"type:text;comment:AI知识点JSON"`
	Status           string `json:"status" gorm:"size:32;index;default:draft;comment:状态 draft/published"`
	WordCount        int    `json:"wordCount" gorm:"default:0;comment:词数"`
	EstimatedMinutes int    `json:"estimatedMinutes" gorm:"default:5;comment:预计分钟"`
	SortOrder        int    `json:"sortOrder" gorm:"default:0;index;comment:排序"`
}

func (ReadingPassage) TableName() string { return constants.TABLE_READING_PASSAGES }

// ReadingQuestion 阅读理解题目
type ReadingQuestion struct {
	common.BaseModel
	PassageID   uint   `json:"passageId" gorm:"index;not null;comment:文章ID"`
	Stem        string `json:"stem" gorm:"type:text;not null;comment:题干"`
	Options     string `json:"options" gorm:"type:text;not null;comment:选项 JSON [{key,text}]"`
	Answer      string `json:"answer" gorm:"size:8;not null;comment:正确答案 key"`
	Explanation string `json:"explanation" gorm:"type:text;comment:解析"`
	SortOrder   int    `json:"sortOrder" gorm:"default:0;index;comment:题序"`
}

func (ReadingQuestion) TableName() string { return constants.TABLE_READING_QUESTIONS }

// ReadingRecord 用户阅读答题记录
type ReadingRecord struct {
	common.BaseModel
	UserID        uint       `json:"userId" gorm:"index;not null;comment:用户ID"`
	PassageID     uint       `json:"passageId" gorm:"index;not null;comment:文章ID"`
	Answers       string     `json:"answers" gorm:"type:text;comment:答题快照 JSON"`
	QuestionCount int        `json:"questionCount" gorm:"comment:题目数"`
	CorrectCount  int        `json:"correctCount" gorm:"comment:答对数量"`
	Score         int        `json:"score" gorm:"comment:得分百分比 0-100"`
	DurationSec   int        `json:"durationSec" gorm:"default:0;comment:用时秒"`
	IsLatest      bool       `json:"isLatest" gorm:"default:false;index;comment:该文章最新一次"`
	CompletedAt   *time.Time `json:"completedAt" gorm:"comment:完成时间"`
}

func (ReadingRecord) TableName() string { return constants.TABLE_READING_RECORDS }
