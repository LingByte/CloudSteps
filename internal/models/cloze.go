package models

import (
	"time"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	"github.com/LingByte/ling-base/common"
)

const (
	ClozeStatusDraft     = "draft"
	ClozeStatusPublished = "published"
)

// ClozePassage 完形填空文章（正文用 {{1}} {{2}} 标记空位）
type ClozePassage struct {
	common.BaseModel
	Title            string `json:"title" gorm:"size:256;not null;index;comment:标题"`
	Level            string `json:"level" gorm:"size:32;index;comment:难度 初阶/中阶/高阶"`
	Content          string `json:"content" gorm:"type:text;not null;comment:正文含 {{n}} 空位"`
	Summary          string `json:"summary" gorm:"size:512;comment:摘要"`
	// Tags 逗号分隔的标签列表，如 "CEPOC,故事,科普"。用于前端筛选。
	Tags             string `json:"tags" gorm:"size:256;index;comment:标签 逗号分隔"`
	Status           string `json:"status" gorm:"size:32;index;default:draft;comment:draft/published"`
	BlankCount       int    `json:"blankCount" gorm:"default:0;comment:空位数"`
	EstimatedMinutes int    `json:"estimatedMinutes" gorm:"default:5;comment:预计分钟"`
	SortOrder        int    `json:"sortOrder" gorm:"default:0;index;comment:排序"`
}

func (ClozePassage) TableName() string { return constants.TABLE_CLOZE_PASSAGES }

// ClozeBlank 完形填空空位题目
type ClozeBlank struct {
	common.BaseModel
	PassageID   uint   `json:"passageId" gorm:"index;not null;comment:文章ID"`
	BlankNo     int    `json:"blankNo" gorm:"index;not null;comment:空位编号 对应 {{n}}"`
	Options     string `json:"options" gorm:"type:text;not null;comment:选项 JSON [{key,text}]"`
	Answer      string `json:"answer" gorm:"size:8;not null;comment:正确答案 key"`
	Explanation string `json:"explanation" gorm:"type:text;comment:解析"`
}

func (ClozeBlank) TableName() string { return constants.TABLE_CLOZE_BLANKS }

// ClozeRecord 完形填空答题记录
type ClozeRecord struct {
	common.BaseModel
	UserID       uint       `json:"userId" gorm:"index;not null;comment:用户ID"`
	PassageID    uint       `json:"passageId" gorm:"index;not null;comment:文章ID"`
	Answers      string     `json:"answers" gorm:"type:text;comment:答题快照 JSON"`
	BlankCount   int        `json:"blankCount" gorm:"comment:空位数"`
	CorrectCount int        `json:"correctCount" gorm:"comment:答对数量"`
	Score        int        `json:"score" gorm:"comment:得分百分比 0-100"`
	DurationSec  int        `json:"durationSec" gorm:"default:0;comment:用时秒"`
	IsLatest     bool       `json:"isLatest" gorm:"default:false;index;comment:该文章最新一次"`
	CompletedAt  *time.Time `json:"completedAt" gorm:"comment:完成时间"`
}

func (ClozeRecord) TableName() string { return constants.TABLE_CLOZE_RECORDS }
