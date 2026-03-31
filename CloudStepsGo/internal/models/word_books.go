package models

import (
	"github.com/LingByte/CloudStepsGo/pkg/constants"
	"gorm.io/gorm"
)

// WordBook 词库
type WordBook struct {
	BaseModel
	Name        string `json:"name" gorm:"size:128;not null;comment:词库名称"`
	Description string `json:"description" gorm:"type:text;comment:词库描述"`
	Level       string `json:"level" gorm:"size:10;index;comment:适用等级 A1/A2/B1/B2/C1"`
	WordCount   int    `json:"wordCount" gorm:"default:0;comment:词库总词数"`
	CoverURL    string `json:"coverUrl" gorm:"size:512;comment:封面图URL"`
	IsActive    bool   `json:"isActive" gorm:"default:true;comment:是否上架"`
	SortOrder   int    `json:"sortOrder" gorm:"default:0;comment:排序权重"`
}

func (WordBook) TableName() string { return constants.TABLE_WORD_BOOKS }

// Word 单词
type Word struct {
	BaseModel
	WordBookID      uint   `json:"wordBookId" gorm:"index;not null;comment:所属词库ID"`
	Word            string `json:"word" gorm:"size:128;not null;index;comment:英文单词"`
	Phonetic        string `json:"phonetic" gorm:"size:128;comment:音标"`
	Translation     string `json:"translation" gorm:"type:text;comment:中文释义 JSON数组"`
	ExampleSentence string `json:"exampleSentence" gorm:"type:text;comment:例句"`
	AudioURL        string `json:"audioUrl" gorm:"size:512;comment:发音音频URL"`
	Difficulty      int8   `json:"difficulty" gorm:"default:1;comment:难度 1-5"`
	SortOrder       int    `json:"sortOrder" gorm:"default:0;comment:词库内排序"`
}

func (Word) TableName() string { return constants.TABLE_WORDS }

// CreateWordBook 创建词库
func CreateWordBook(db *gorm.DB, book *WordBook) error {
	return db.Create(book).Error
}

// GetWordBookByID 按 ID 查词库
func GetWordBookByID(db *gorm.DB, id uint) (*WordBook, error) {
	var book WordBook
	if err := db.First(&book, id).Error; err != nil {
		return nil, err
	}
	return &book, nil
}

// ListWordBooks 分页查词库列表
func ListWordBooks(db *gorm.DB, level string, onlyActive bool, page, size int) ([]WordBook, int64, error) {
	q := db.Model(&WordBook{})
	if level != "" {
		q = q.Where("level = ?", level)
	}
	if onlyActive {
		q = q.Where("is_active = ?", true)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var books []WordBook
	if err := q.Order("sort_order ASC, id ASC").
		Offset((page - 1) * size).Limit(size).
		Find(&books).Error; err != nil {
		return nil, 0, err
	}
	return books, total, nil
}

// UpdateWordBook 更新词库字段（只更新非零值字段）
func UpdateWordBook(db *gorm.DB, id uint, vals map[string]any) error {
	return db.Model(&WordBook{}).Where("id = ?", id).Updates(vals).Error
}

// DeleteWordBook 软删除词库（同时下架）
func DeleteWordBook(db *gorm.DB, id uint, operator string) error {
	return db.Model(&WordBook{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusDeleted,
		"is_active":  false,
		"update_by":  operator,
	}).Error
}

// SetWordBookActive 上架 / 下架词库
func SetWordBookActive(db *gorm.DB, id uint, active bool) error {
	return db.Model(&WordBook{}).Where("id = ?", id).Update("is_active", active).Error
}

// SyncWordBookCount 重新统计并写回 word_count
func SyncWordBookCount(db *gorm.DB, wordBookID uint) error {
	var cnt int64
	if err := db.Model(&Word{}).Where("word_book_id = ?", wordBookID).Count(&cnt).Error; err != nil {
		return err
	}
	return db.Model(&WordBook{}).Where("id = ?", wordBookID).Update("word_count", cnt).Error
}

// CreateWord 创建单词，并同步词库计数
func CreateWord(db *gorm.DB, word *Word) error {
	if err := db.Create(word).Error; err != nil {
		return err
	}
	return db.Model(&WordBook{}).Where("id = ?", word.WordBookID).
		UpdateColumn("word_count", gorm.Expr("word_count + 1")).Error
}

// BatchCreateWords 批量创建单词，并同步词库计数
func BatchCreateWords(db *gorm.DB, words []Word) error {
	if len(words) == 0 {
		return nil
	}
	if err := db.CreateInBatches(words, 200).Error; err != nil {
		return err
	}
	// 按词库分组更新计数
	bookCounts := map[uint]int{}
	for _, w := range words {
		bookCounts[w.WordBookID]++
	}
	for bookID, cnt := range bookCounts {
		db.Model(&WordBook{}).Where("id = ?", bookID).
			UpdateColumn("word_count", gorm.Expr("word_count + ?", cnt))
	}
	return nil
}

// GetWordByID 按 ID 查单词
func GetWordByID(db *gorm.DB, id uint) (*Word, error) {
	var word Word
	if err := db.Where("is_deleted = ?", SoftDeleteStatusActive).First(&word, id).Error; err != nil {
		return nil, err
	}
	return &word, nil
}

// ListWords 分页查词库下的单词
func ListWords(db *gorm.DB, wordBookID uint, keyword string, page, size int) ([]Word, int64, error) {
	q := db.Model(&Word{}).Where("word_book_id = ? AND is_deleted = ?", wordBookID, SoftDeleteStatusActive)
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("word LIKE ? OR translation LIKE ?", like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var words []Word
	if err := q.Order("sort_order ASC, id ASC").
		Offset((page - 1) * size).Limit(size).
		Find(&words).Error; err != nil {
		return nil, 0, err
	}
	return words, total, nil
}

// GetAllWords 获取词库全部单词（不分页，用于学习流程）
func GetAllWords(db *gorm.DB, wordBookID uint) ([]Word, error) {
	var words []Word
	if err := db.Where("word_book_id = ? AND is_deleted = ?", wordBookID, SoftDeleteStatusActive).
		Order("sort_order ASC, id ASC").Find(&words).Error; err != nil {
		return nil, err
	}
	return words, nil
}

// GetWordsByIDs 按 ID 列表批量查单词
func GetWordsByIDs(db *gorm.DB, ids []uint) ([]Word, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var words []Word
	if err := db.Where("id IN ? AND is_deleted = ?", ids, SoftDeleteStatusActive).Find(&words).Error; err != nil {
		return nil, err
	}
	return words, nil
}

// UpdateWord 更新单词字段
func UpdateWord(db *gorm.DB, id uint, vals map[string]any) error {
	return db.Model(&Word{}).Where("id = ?", id).Updates(vals).Error
}

// DeleteWord 软删除单词，并同步词库计数
func DeleteWord(db *gorm.DB, id uint, operator string) error {
	var word Word
	if err := db.Where("is_deleted = ?", SoftDeleteStatusActive).First(&word, id).Error; err != nil {
		return err
	}
	if err := db.Model(&Word{}).Where("id = ?", id).Updates(map[string]any{
		"is_deleted": SoftDeleteStatusDeleted,
		"update_by":  operator,
	}).Error; err != nil {
		return err
	}
	return db.Model(&WordBook{}).Where("id = ?", word.WordBookID).
		UpdateColumn("word_count", gorm.Expr("GREATEST(word_count - 1, 0)")).Error
}

// BatchDeleteWords 批量删除单词，并同步词库计数
func BatchDeleteWords(db *gorm.DB, ids []uint) error {
	if len(ids) == 0 {
		return nil
	}
	var words []Word
	if err := db.Where("id IN ?", ids).Find(&words).Error; err != nil {
		return err
	}
	if err := db.Delete(&Word{}, ids).Error; err != nil {
		return err
	}
	bookCounts := map[uint]int{}
	for _, w := range words {
		bookCounts[w.WordBookID]++
	}
	for bookID, cnt := range bookCounts {
		db.Model(&WordBook{}).Where("id = ?", bookID).
			UpdateColumn("word_count", gorm.Expr("GREATEST(word_count - ?, 0)", cnt))
	}
	return nil
}

// WordExists 检查词库内是否已存在该单词（大小写不敏感）
func WordExists(db *gorm.DB, wordBookID uint, word string) (bool, error) {
	var cnt int64
	err := db.Model(&Word{}).
		Where("word_book_id = ? AND is_deleted = ? AND LOWER(word) = LOWER(?)", wordBookID, SoftDeleteStatusActive, word).
		Count(&cnt).Error
	return cnt > 0, err
}
