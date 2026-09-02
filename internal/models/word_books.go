package models

import (
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	common "github.com/LingByte/ling-base/common"
	"gorm.io/gorm"
)

// WordLite 单词轻量结构（学习/列表场景只需少量字段，避免 SELECT * 40+ 列）
type WordLite struct {
	ID               uint   `json:"id"`
	WordBookID       uint   `json:"wordBookId"`
	Word             string `json:"word"`
	Phonetic         string `json:"phonetic"`
	PhoneticUK       string `json:"phoneticUk"`
	PhoneticUS       string `json:"phoneticUs"`
	Translation      string `json:"translation"`
	TranslationShort string `json:"translationShort" gorm:"type:text;comment:简译"`
	PartOfSpeech     string `json:"partOfSpeech"`
	Definition       string `json:"definition"`
	AudioURL         string `json:"audioUrl"`
	SortOrder        int    `json:"sortOrder"`
	Overridden       bool   `json:"overridden,omitempty" gorm:"-"`
}

// TableName 让 GORM 知道映射到 words 表
func (WordLite) TableName() string { return constants.TABLE_WORDS }

// WordBook 词库
type WordBook struct {
	common.BaseModel
	Name           string     `json:"name" gorm:"size:128;not null;comment:词库名称"`
	Description    string     `json:"description" gorm:"type:text;comment:词库描述"`
	Level          string     `json:"level" gorm:"size:10;index;comment:适用等级 A1/A2/B1/B2/C1"`
	WordCount      int        `json:"wordCount" gorm:"default:0;comment:词库总词数"`
	CoverURL       string     `json:"coverUrl" gorm:"size:512;comment:封面图URL"`
	IsActive       bool       `json:"isActive" gorm:"default:true;comment:是否上架"`
	SortOrder      int        `json:"sortOrder" gorm:"default:0;comment:排序权重"`
	Category       string     `json:"category" gorm:"size:64;index;comment:词库分类 (vocabulary/grammar/reading等)"`
	Language       string     `json:"language" gorm:"size:10;default:'en';comment:语言类型"`
	TargetLanguage string     `json:"targetLanguage" gorm:"size:10;default:'zh';comment:目标语言"`
	Difficulty     int8       `json:"difficulty" gorm:"default:1;index;comment:整体难度 1-5"`
	StudyHours     int        `json:"studyHours" gorm:"default:0;comment:建议学习时长(小时)"`
	Tags           string     `json:"tags" gorm:"type:text;comment:标签 JSON数组"`
	Author         string     `json:"author" gorm:"size:128;comment:作者/创建者"`
	Publisher      string     `json:"publisher" gorm:"size:128;comment:发布机构"`
	Version        string     `json:"version" gorm:"size:20;default:'1.0';comment:版本号"`
	ViewCount      int        `json:"viewCount" gorm:"default:0;comment:查看次数"`
	LastStudyAt    *time.Time `json:"lastStudyAt" gorm:"comment:最后学习时间"`
	// OwnerUserID 自定义词库归属；0=系统词库，>0=用户私有自定义词库
	OwnerUserID uint `json:"ownerUserId" gorm:"index;default:0;comment:自定义词库所属用户ID，0为系统词库"`
	// 词库元数据（非社交）：考试/难度区间、变体、数据来源标注
	ExamTags        string `json:"examTags" gorm:"type:text;comment:考试标签 JSON 数组，如 CET-4/考研/IELTS"`
	CEFRRange       string `json:"cefrRange" gorm:"size:32;comment:CEFR 覆盖区间，如 A2-B1"`
	RegionalVariant string `json:"regionalVariant" gorm:"size:16;comment:内容变体 en-US/en-GB 等"`
	SourceName      string `json:"sourceName" gorm:"size:256;comment:数据来源名称（词典/开放数据集）"`
	SourceURL       string `json:"sourceUrl" gorm:"size:512;comment:来源链接"`
	LicenseNote     string `json:"licenseNote" gorm:"type:text;comment:授权/版权声明说明"`
}

func (WordBook) TableName() string { return constants.TABLE_WORD_BOOKS }

// Word 单词
type Word struct {
	common.BaseModel
	WordBookID       uint   `json:"wordBookId" gorm:"index;index:idx_wordbook_sort;not null;comment:所属词库ID"`
	Word             string `json:"word" gorm:"size:128;not null;index;comment:英文单词"`
	Phonetic         string `json:"phonetic" gorm:"size:128;comment:音标"`
	Translation      string `json:"translation" gorm:"type:text;comment:中文释义 JSON数组"`
	TranslationShort string `json:"translationShort" gorm:"type:text;comment:简译"`
	ExampleSentence  string `json:"exampleSentence" gorm:"type:text;comment:例句"`
	AudioURL         string `json:"audioUrl" gorm:"size:512;comment:发音音频URL"`
	Difficulty       int8   `json:"difficulty" gorm:"default:1;comment:难度 1-5"`
	SortOrder        int    `json:"sortOrder" gorm:"default:0;index:idx_wordbook_sort;comment:词库内排序"`

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
	// 词典型扩展（非社交）：音系、词源、语体、派生等，便于对接外部词典/语料
	Lemma           string `json:"lemma" gorm:"size:128;index;comment:词元/原形（变形词时）"`
	PhoneticUS      string `json:"phoneticUs" gorm:"size:128;comment:美式音标 IPA"`
	PhoneticUK      string `json:"phoneticUk" gorm:"size:128;comment:英式音标 IPA"`
	Syllables       string `json:"syllables" gorm:"size:128;comment:音节划分，如 ad-ver-tise"`
	StressPattern   string `json:"stressPattern" gorm:"size:64;comment:重音模式说明"`
	CEFRLevel       string `json:"cefrLevel" gorm:"size:8;index;comment:词条 CEFR 等级 A1-C2"`
	Register        string `json:"register" gorm:"size:256;comment:语体/正式度 JSON 数组，如 formal,neutral,slang"`
	Etymology       string `json:"etymology" gorm:"type:text;comment:词源简述"`
	Morphology      string `json:"morphology" gorm:"type:text;comment:形态分析 JSON：词根/前后缀等"`
	Derivations     string `json:"derivations" gorm:"type:text;comment:派生词 JSON 数组"`
	Mnemonic        string `json:"mnemonic" gorm:"type:text;comment:联想/记忆提示"`
	Homophones      string `json:"homophones" gorm:"type:text;comment:同音词 JSON 数组"`
	UsageNotes      string `json:"usageNotes" gorm:"type:text;comment:用法辨析、易错点"`
	GrammarPatterns string `json:"grammarPatterns" gorm:"type:text;comment:常用结构/句型 JSON 数组"`
	Overridden      bool   `json:"overridden,omitempty" gorm:"-"`
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
	PartOfSpeechNoun         = "noun"
	PartOfSpeechVerb         = "verb"
	PartOfSpeechAdjective    = "adjective"
	PartOfSpeechAdverb       = "adverb"
	PartOfSpeechPronoun      = "pronoun"
	PartOfSpeechPreposition  = "preposition"
	PartOfSpeechConjunction  = "conjunction"
	PartOfSpeechInterjection = "interjection"
)

// WordBookProgress 词库学习进度
type WordBookProgress struct {
	common.BaseModel
	UserID        uint       `json:"userId" gorm:"index;not null;comment:用户ID"`
	WordBookID    uint       `json:"wordBookId" gorm:"index;not null;comment:词库ID"`
	TotalWords    int        `json:"totalWords" gorm:"default:0;comment:总词数"`
	LearnedWords  int        `json:"learnedWords" gorm:"default:0;comment:已学词数"`
	MasteredWords int        `json:"masteredWords" gorm:"default:0;comment:已掌握词数"`
	Progress      float64    `json:"progress" gorm:"default:0;comment:学习进度百分比"`
	StudyTime     int        `json:"studyTime" gorm:"default:0;comment:学习时长(秒)"`
	LastStudyAt   *time.Time `json:"lastStudyAt" gorm:"comment:最后学习时间"`
	IsCompleted   bool       `json:"isCompleted" gorm:"default:false;comment:是否完成"`
	StartDate     *time.Time `json:"startDate" gorm:"comment:开始学习时间"`
	CompletedAt   *time.Time `json:"completedAt" gorm:"comment:完成时间"`
}

func (WordBookProgress) TableName() string { return constants.TABLE_WORD_BOOK_PROGRESS }

// UserWordProgress 用户单词学习进度
type UserWordProgress struct {
	common.BaseModel
	UserID       uint       `json:"userId" gorm:"index;not null;comment:用户ID"`
	WordID       uint       `json:"wordId" gorm:"index;not null;comment:单词ID"`
	WordBookID   uint       `json:"wordBookId" gorm:"index;not null;comment:词库ID"`
	MasteryLevel int8       `json:"masteryLevel" gorm:"default:0;comment:掌握程度 0-5"`
	IsMemorized  bool       `json:"isMemorized" gorm:"default:false;comment:是否已掌握"`
	StudyCount   int        `json:"studyCount" gorm:"default:0;comment:学习次数"`
	ReviewCount  int        `json:"reviewCount" gorm:"default:0;comment:复习次数"`
	CorrectCount int        `json:"correctCount" gorm:"default:0;comment:答对次数"`
	WrongCount   int        `json:"wrongCount" gorm:"default:0;comment:答错次数"`
	StudyTime    int        `json:"studyTime" gorm:"default:0;comment:学习时长(秒)"`
	LastStudyAt  *time.Time `json:"lastStudyAt" gorm:"comment:最后学习时间"`
	NextReviewAt *time.Time `json:"nextReviewAt" gorm:"index;comment:下次复习时间"`
	Notes        string     `json:"notes" gorm:"type:text;comment:学习笔记"`
	Difficulty   int8       `json:"difficulty" gorm:"default:1;comment:个人难度感受 1-5"`
}

func (UserWordProgress) TableName() string { return constants.TABLE_USER_WORD_PROGRESS }

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

// DeleteWordBook 硬删除词库：直接删除词库行以及相关数据。
// 注意：这里使用 Unscoped，硬删除词库及相关数据（与 DeletedAt 软删无关）。
func DeleteWordBook(db *gorm.DB, id uint, operator string) error {
	_ = operator // operator currently only used for soft delete audit; keep signature compatibility
	if id == 0 {
		return gorm.ErrRecordNotFound
	}
	if err := db.First(&WordBook{}, id).Error; err != nil {
		return err
	}

	tx := db.Unscoped()

	// 先删除子表，避免外键约束导致删除失败
	if err := tx.Where("word_book_id = ?", id).Delete(&Word{}).Error; err != nil {
		return err
	}
	if err := tx.Where("word_book_id = ?", id).Delete(&UserWordBook{}).Error; err != nil {
		return err
	}
	if err := tx.Where("word_book_id = ?", id).Delete(&UserWordState{}).Error; err != nil {
		return err
	}
	if err := tx.Where("word_book_id = ?", id).Delete(&ReviewQueue{}).Error; err != nil {
		return err
	}
	if err := tx.Where("word_book_id = ?", id).Delete(&WordBookProgress{}).Error; err != nil {
		return err
	}
	if err := tx.Where("word_book_id = ?", id).Delete(&UserWordProgress{}).Error; err != nil {
		return err
	}

	// 最后删除词库主表
	res := tx.Where("id = ?", id).Delete(&WordBook{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// SetWordBookActive 上架 / 下架词库
func SetWordBookActive(db *gorm.DB, id uint, active bool) error {
	return db.Model(&WordBook{}).Where("id = ?", id).Update("is_active", active).Error
}

// SyncWordBookCount 重新统计未删除单词并写回 word_count
func SyncWordBookCount(db *gorm.DB, wordBookID uint) error {
	var cnt int64
	if err := db.Model(&Word{}).
		Where("word_book_id = ?", wordBookID).
		Count(&cnt).Error; err != nil {
		return err
	}
	return db.Model(&WordBook{}).Where("id = ?", wordBookID).Update("word_count", cnt).Error
}

// SyncAllWordBookCounts 按未删除单词重新计算全部词库 word_count
func SyncAllWordBookCounts(db *gorm.DB) (int64, error) {
	res := db.Exec(fmt.Sprintf(`
		UPDATE %s wb
		LEFT JOIN (
			SELECT word_book_id, COUNT(*) AS cnt
			FROM %s
			WHERE deleted_at IS NULL
			GROUP BY word_book_id
		) t ON t.word_book_id = wb.id
		SET wb.word_count = COALESCE(t.cnt, 0)
		WHERE wb.deleted_at IS NULL
	`, constants.TABLE_WORD_BOOKS, constants.TABLE_WORDS))
	return res.RowsAffected, res.Error
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
	if err := db.First(&word, id).Error; err != nil {
		return nil, err
	}
	return &word, nil
}

// ListWords 分页查词库下的单词
func ListWords(db *gorm.DB, wordBookID uint, keyword string, page, size int) ([]Word, int64, error) {
	q := db.Model(&Word{}).Where("word_book_id = ?", wordBookID)
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where(
			"word LIKE ? OR translation LIKE ? OR lemma LIKE ? OR definition LIKE ? OR part_of_speech LIKE ?",
			like, like, like, like, like,
		)
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
	if err := db.Where("word_book_id = ?", wordBookID).
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
	if err := db.Where("id IN ?", ids).Find(&words).Error; err != nil {
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
	if err := db.First(&word, id).Error; err != nil {
		return err
	}
	if err := db.Delete(&word).Error; err != nil {
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
		Where("word_book_id = ? AND LOWER(word) = LOWER(?)", wordBookID, word).
		Count(&cnt).Error
	return cnt > 0, err
}

// ==================== 性能优化查询 ====================

// ListWordBooksWithSearch 分页+关键词搜索词库列表（替代 ListWordBooks 的全量加载）
// ownerUserID：>0 时按自定义词库过滤；group=custom 仅返回该用户私有词库，其它分组排除所有自定义词库。
func ListWordBooksWithSearch(db *gorm.DB, keyword, level, category, group string, onlyActive bool, page, size int, ownerUserID uint) ([]WordBook, int64, error) {
	q := db.Model(&WordBook{})
	if onlyActive {
		q = q.Where("is_active = ?", true)
	}
	if keyword != "" {
		q = q.Where("name LIKE ?", "%"+keyword+"%")
	}
	if level != "" {
		q = q.Where("level = ?", level)
	}
	if category != "" {
		q = q.Where("category = ?", category)
	}
	if group == "custom" {
		if ownerUserID == 0 {
			return []WordBook{}, 0, nil
		}
		q = q.Where("owner_user_id = ?", ownerUserID)
	} else {
		q = q.Where("owner_user_id = 0")
		if group != "" {
			patterns := GroupPatterns(group)
			if len(patterns) > 0 {
				orClauses := make([]string, len(patterns))
				args := make([]interface{}, len(patterns))
				for i, p := range patterns {
					orClauses[i] = "name LIKE ?"
					args[i] = "%" + p + "%"
				}
				q = q.Where(strings.Join(orClauses, " OR "), args...)
			}
		}
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

// GroupPatterns 返回词库分组对应的名称关键词
func GroupPatterns(group string) []string {
	switch group {
	case "primary":
		return []string{"小学", "一年级", "二年级", "三年级", "四年级", "五年级", "六年级"}
	case "middle":
		return []string{"初中", "中考", "七年级", "八年级", "九年级"}
	case "high":
		return []string{"高中", "高考", "必修", "选修"}
	case "cet4":
		return []string{"四级", "CET4", "CET-4", "4级"}
	case "cet6":
		return []string{"六级", "CET6", "CET-6", "6级"}
	case "kaoyan":
		return []string{"考研"}
	case "abroad":
		return []string{"托福", "toefl", "雅思", "ielts", "GRE", "SAT"}
	case "tem":
		return []string{"专四", "专八", "TEM4", "TEM8"}
	case "textbook":
		return []string{"人教", "外研", "北师大", "广州版", "天津", "新思维", "新蕾", "新概念", "NCE", "朗文", "Longman", "牛津", "Oxford", "剑桥", "Cambridge"}
	default:
		return nil
	}
}

// GroupNames 返回分组名称列表（有序）
func GroupNames() []map[string]string {
	return []map[string]string{
		{"key": "", "label": "全部"},
		{"key": "primary", "label": "小学"},
		{"key": "middle", "label": "初中"},
		{"key": "high", "label": "高中"},
		{"key": "cet4", "label": "大学四级"},
		{"key": "cet6", "label": "大学六级"},
		{"key": "kaoyan", "label": "考研"},
		{"key": "abroad", "label": "留学考试"},
		{"key": "tem", "label": "专四专八"},
		{"key": "textbook", "label": "教材"},
	}
}

// ListWordsLite 轻量分页查单词（只 SELECT 学习所需字段，不加载 40+ 列）
func ListWordsLite(db *gorm.DB, wordBookID uint, keyword string, page, size int) ([]WordLite, int64, error) {
	q := db.Model(&WordLite{}).Where("word_book_id = ?", wordBookID)
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("word LIKE ? OR translation LIKE ? OR part_of_speech LIKE ?", like, like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var words []WordLite
	if err := q.Order("sort_order ASC, id ASC").
		Offset((page - 1) * size).Limit(size).
		Find(&words).Error; err != nil {
		return nil, 0, err
	}
	return words, total, nil
}

// GetWordLiteByID 轻量查询单个单词
func GetWordLiteByID(db *gorm.DB, id uint) (*WordLite, error) {
	var word WordLite
	if err := db.First(&word, id).Error; err != nil {
		return nil, err
	}
	return &word, nil
}

// GetWordsLiteByIDs 批量轻量查询
func GetWordsLiteByIDs(db *gorm.DB, ids []uint) ([]WordLite, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var words []WordLite
	if err := db.Where("id IN ?", ids).
		Order("sort_order ASC, id ASC").Find(&words).Error; err != nil {
		return nil, err
	}
	return words, nil
}

// GetNextWordAfterCursor 游标分页：获取 sort_order/id 大于 cursor 的下一个单词（筛词用）
// 替代 Offset(screenProgress)，避免大偏移量性能下降
func GetNextWordAfterCursor(db *gorm.DB, wordBookID uint, afterSortOrder int, afterID uint) (*Word, error) {
	var word Word
	q := db.Where("word_book_id = ?", wordBookID)
	if afterID > 0 {
		q = q.Where("(sort_order > ? OR (sort_order = ? AND id > ?))", afterSortOrder, afterSortOrder, afterID)
	}
	if err := q.Order("sort_order ASC, id ASC").First(&word).Error; err != nil {
		return nil, err
	}
	return &word, nil
}

// GetWordCountByBookID 获取词库单词数（使用 word_count 冗余字段，避免 COUNT(*)）
func GetWordCountByBookID(db *gorm.DB, wordBookID uint) (int64, error) {
	var book WordBook
	if err := db.Select("word_count").First(&book, wordBookID).Error; err != nil {
		return 0, err
	}
	return int64(book.WordCount), nil
}

// ListStudyWordsLite 学习列表轻量查询：用 NOT EXISTS 排除已学单词。
// shuffle=true 时用 seed 做 Fisher–Yates 全量乱序后分页（同 seed 翻页稳定；换 seed 完全重排）。
func ListStudyWordsLite(db *gorm.DB, wordBookID uint, userID uint, page, size int, shuffle bool, seed int64) ([]WordLite, int64, error) {
	baseWhere := "word_book_id = ? AND NOT EXISTS (SELECT 1 FROM user_word_states WHERE user_id = ? AND word_id = words.id AND learn_status IN ('learned','mastered'))"
	args := []any{wordBookID, userID}

	var total int64
	if err := db.Model(&WordLite{}).Where(baseWhere, args...).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if total == 0 {
		return []WordLite{}, 0, nil
	}
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 20
	}

	if !shuffle {
		var words []WordLite
		err := db.Model(&WordLite{}).Where(baseWhere, args...).
			Order("sort_order ASC, id ASC").
			Offset((page - 1) * size).Limit(size).
			Find(&words).Error
		return words, total, err
	}

	if seed == 0 {
		seed = time.Now().UnixNano()
	}

	var ids []uint
	if err := db.Model(&WordLite{}).Where(baseWhere, args...).
		Order("id ASC").Pluck("id", &ids).Error; err != nil {
		return nil, 0, err
	}

	r := rand.New(rand.NewSource(seed))
	for i := len(ids) - 1; i > 0; i-- {
		j := r.Intn(i + 1)
		ids[i], ids[j] = ids[j], ids[i]
	}

	start := (page - 1) * size
	if start >= len(ids) {
		return []WordLite{}, total, nil
	}
	end := start + size
	if end > len(ids) {
		end = len(ids)
	}
	pageIDs := ids[start:end]

	var words []WordLite
	if err := db.Model(&WordLite{}).Where("id IN ?", pageIDs).Find(&words).Error; err != nil {
		return nil, 0, err
	}
	byID := make(map[uint]WordLite, len(words))
	for _, w := range words {
		byID[w.ID] = w
	}
	ordered := make([]WordLite, 0, len(pageIDs))
	for _, id := range pageIDs {
		if w, ok := byID[id]; ok {
			ordered = append(ordered, w)
		}
	}
	return ordered, total, nil
}

// GetWordIDsByBookID 获取词库全部单词 ID（用于选词库时的懒初始化，只 Pluck ID 不创建状态）
func GetWordIDsByBookID(db *gorm.DB, wordBookID uint) ([]uint, error) {
	var ids []uint
	if err := db.Model(&Word{}).Where("word_book_id = ?", wordBookID).
		Order("sort_order ASC, id ASC").Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}
