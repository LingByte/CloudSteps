package models

import (
	"time"
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
	Category       string `json:"category" gorm:"size:64;index;comment:词库分类 (vocabulary/grammar/reading等)"`
	Language       string `json:"language" gorm:"size:10;default:'en';comment:语言类型"`
	TargetLanguage string `json:"targetLanguage" gorm:"size:10;default:'zh';comment:目标语言"`
	Difficulty     int8   `json:"difficulty" gorm:"default:1;index;comment:整体难度 1-5"`
	StudyHours     int    `json:"studyHours" gorm:"default:0;comment:建议学习时长(小时)"`
	Tags           string `json:"tags" gorm:"type:text;comment:标签 JSON数组"`
	Author         string `json:"author" gorm:"size:128;comment:作者/创建者"`
	Publisher      string `json:"publisher" gorm:"size:128;comment:发布机构"`
	Version        string `json:"version" gorm:"size:20;default:'1.0';comment:版本号"`
	ViewCount      int    `json:"viewCount" gorm:"default:0;comment:查看次数"`
	LastStudyAt    *time.Time `json:"lastStudyAt" gorm:"comment:最后学习时间"`
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
	
	// 新增字段
	PartOfSpeech     string     `json:"partOfSpeech" gorm:"size:50;comment:词性 (noun/verb/adjective等)"`
	Definition       string     `json:"definition" gorm:"type:text;comment:英文释义"`
	Synonyms         string     `json:"synonyms" gorm:"type:text;comment:同义词 JSON数组"`
	Antonyms         string     `json:"antonyms" gorm:"type:text;comment:反义词 JSON数组"`
	WordFamily       string     `json:"wordFamily" gorm:"type:text;comment:词族 JSON数组"`
	Collocations     string     `json:"collocations" gorm:"type:text;comment:搭配 JSON数组"`
	ExampleSentences string     `json:"exampleSentences" gorm:"type:text;comment:多个例句 JSON数组"`
	ImageURL         string     `json:"imageUrl" gorm:"size:512;comment:图片URL"`
	VideoURL         string     `json:"videoUrl" gorm:"size:512;comment:视频URL"`
	Frequency        int8       `json:"frequency" gorm:"default:1;index;comment:使用频率 1-5"`
	Importance       int8       `json:"importance" gorm:"default:1;comment:重要程度 1-5"`
	Tags             string     `json:"tags" gorm:"type:text;comment:标签 JSON数组"`
	Notes            string     `json:"notes" gorm:"type:text;comment:学习笔记"`
	IsMemorized      bool       `json:"isMemorized" gorm:"default:false;comment:是否已掌握"`
	MasteryLevel     int8       `json:"masteryLevel" gorm:"default:0;comment:掌握程度 0-5"`
	ReviewCount      int        `json:"reviewCount" gorm:"default:0;comment:复习次数"`
	CorrectCount     int        `json:"correctCount" gorm:"default:0;comment:答对次数"`
	LastReviewAt     *time.Time `json:"lastReviewAt" gorm:"comment:最后复习时间"`
	NextReviewAt     *time.Time `json:"nextReviewAt" gorm:"index;comment:下次复习时间"`
	StudyTime        int        `json:"studyTime" gorm:"default:0;comment:学习时长(秒)"`
}

func (Word) TableName() string { return constants.TABLE_WORDS }

// 词库相关常量
const (
	// 词库分类
	CategoryVocabulary = "vocabulary"
	CategoryGrammar    = "grammar"
	CategoryReading    = "reading"
	CategoryListening  = "listening"
	CategorySpeaking   = "speaking"
	CategoryWriting    = "writing"
	
	// 词性
	PartOfSpeechNoun        = "noun"
	PartOfSpeechVerb        = "verb"
	PartOfSpeechAdjective   = "adjective"
	PartOfSpeechAdverb      = "adverb"
	PartOfSpeechPronoun     = "pronoun"
	PartOfSpeechPreposition = "preposition"
	PartOfSpeechConjunction = "conjunction"
	PartOfSpeechInterjection = "interjection"
)

// WordBookProgress 词库学习进度
type WordBookProgress struct {
	BaseModel
	UserID       uint       `json:"userId" gorm:"index;not null;comment:用户ID"`
	WordBookID   uint       `json:"wordBookId" gorm:"index;not null;comment:词库ID"`
	TotalWords   int        `json:"totalWords" gorm:"default:0;comment:总词数"`
	LearnedWords int        `json:"learnedWords" gorm:"default:0;comment:已学词数"`
	MasteredWords int       `json:"masteredWords" gorm:"default:0;comment:已掌握词数"`
	Progress     float64    `json:"progress" gorm:"default:0;comment:学习进度百分比"`
	StudyTime    int        `json:"studyTime" gorm:"default:0;comment:学习时长(秒)"`
	LastStudyAt  *time.Time `json:"lastStudyAt" gorm:"comment:最后学习时间"`
	IsCompleted  bool       `json:"isCompleted" gorm:"default:false;comment:是否完成"`
	StartDate    *time.Time `json:"startDate" gorm:"comment:开始学习时间"`
	CompletedAt  *time.Time `json:"completedAt" gorm:"comment:完成时间"`
}

func (WordBookProgress) TableName() string { return "word_book_progress" }

// UserWordProgress 用户单词学习进度
type UserWordProgress struct {
	BaseModel
	UserID        uint       `json:"userId" gorm:"index;not null;comment:用户ID"`
	WordID        uint       `json:"wordId" gorm:"index;not null;comment:单词ID"`
	WordBookID    uint       `json:"wordBookId" gorm:"index;not null;comment:词库ID"`
	MasteryLevel  int8       `json:"masteryLevel" gorm:"default:0;comment:掌握程度 0-5"`
	IsMemorized   bool       `json:"isMemorized" gorm:"default:false;comment:是否已掌握"`
	StudyCount    int        `json:"studyCount" gorm:"default:0;comment:学习次数"`
	ReviewCount   int        `json:"reviewCount" gorm:"default:0;comment:复习次数"`
	CorrectCount  int        `json:"correctCount" gorm:"default:0;comment:答对次数"`
	WrongCount    int        `json:"wrongCount" gorm:"default:0;comment:答错次数"`
	StudyTime     int        `json:"studyTime" gorm:"default:0;comment:学习时长(秒)"`
	LastStudyAt   *time.Time `json:"lastStudyAt" gorm:"comment:最后学习时间"`
	NextReviewAt  *time.Time `json:"nextReviewAt" gorm:"index;comment:下次复习时间"`
	Notes         string     `json:"notes" gorm:"type:text;comment:学习笔记"`
	Difficulty    int8       `json:"difficulty" gorm:"default:1;comment:个人难度感受 1-5"`
}

func (UserWordProgress) TableName() string { return "user_word_progress" }

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

// GetWordsByBookID 按词库ID查单词
func GetWordsByBookID(db *gorm.DB, bookID uint, limit, offset int) ([]Word, error) {
	var words []Word
	query := db.Where("word_book_id = ?", bookID)
	if limit > 0 {
		query = query.Limit(limit)
	}
	if offset > 0 {
		query = query.Offset(offset)
	}
	err := query.Order("sort_order ASC, id ASC").Find(&words).Error
	return words, err
}

// GetWordProgress 获取用户词库学习进度
func GetWordProgress(db *gorm.DB, userID, wordBookID uint) (*WordBookProgress, error) {
	var progress WordBookProgress
	err := db.Where("user_id = ? AND word_book_id = ?", userID, wordBookID).First(&progress).Error
	if err != nil {
		return nil, err
	}
	return &progress, nil
}

// UpdateWordProgress 更新词库学习进度
func UpdateWordProgress(db *gorm.DB, userID, wordBookID uint, totalWords, learnedWords, masteredWords int) error {
	var progress float64
	if totalWords > 0 {
		progress = float64(learnedWords) / float64(totalWords) * 100
	}
	
	updates := map[string]interface{}{
		"total_words":    totalWords,
		"learned_words":  learnedWords,
		"mastered_words": masteredWords,
		"progress":       progress,
		"last_study_at":  time.Now(),
	}
	
	return db.Model(&WordBookProgress{}).
		Where("user_id = ? AND word_book_id = ?", userID, wordBookID).
		Updates(updates).Error
}

// GetUserWordProgress 获取用户单词学习进度
func GetUserWordProgress(db *gorm.DB, userID, wordID uint) (*UserWordProgress, error) {
	var progress UserWordProgress
	err := db.Where("user_id = ? AND word_id = ?", userID, wordID).First(&progress).Error
	if err != nil {
		return nil, err
	}
	return &progress, nil
}

// UpdateUserWordProgress 更新用户单词学习进度
func UpdateUserWordProgress(db *gorm.DB, userID, wordID uint, isCorrect bool, studyTime int) error {
	var progress UserWordProgress
	
	// 先尝试获取现有进度
	err := db.Where("user_id = ? AND word_id = ?", userID, wordID).First(&progress).Error
	if err != nil {
		// 如果不存在，创建新记录
		progress = UserWordProgress{
			UserID:      userID,
			WordID:      wordID,
			StudyCount:  1,
			StudyTime:   studyTime,
			LastStudyAt: &time.Time{},
		}
		if isCorrect {
			progress.CorrectCount = 1
		} else {
			progress.WrongCount = 1
		}
		*progress.LastStudyAt = time.Now()
		return db.Create(&progress).Error
	}
	
	// 更新现有记录
	updates := map[string]interface{}{
		"study_count":   progress.StudyCount + 1,
		"study_time":    progress.StudyTime + studyTime,
		"last_study_at": time.Now(),
	}
	
	if isCorrect {
		updates["correct_count"] = progress.CorrectCount + 1
	} else {
		updates["wrong_count"] = progress.WrongCount + 1
	}
	
	// 计算掌握程度
	totalAttempts := progress.CorrectCount + progress.WrongCount + 1
	if isCorrect {
		totalAttempts++
	}
	correctRate := float64(progress.CorrectCount) / float64(totalAttempts)
	
	var masteryLevel int8
	if correctRate >= 0.9 {
		masteryLevel = 5
	} else if correctRate >= 0.8 {
		masteryLevel = 4
	} else if correctRate >= 0.7 {
		masteryLevel = 3
	} else if correctRate >= 0.6 {
		masteryLevel = 2
	} else {
		masteryLevel = 1
	}
	
	updates["mastery_level"] = masteryLevel
	updates["is_memorized"] = masteryLevel >= 4
	
	return db.Model(&progress).Updates(updates).Error
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
