package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/CloudStepsGo/pkg/utils"
	"github.com/LingByte/ling-base/apidocs/humax"
	lbconstants "github.com/LingByte/ling-base/common/constants"

	"github.com/LingByte/CloudStepsGo/internal/models"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// adminWordPayload 管理端创建/批量导入单词时的可写字段（不含学习进度类字段）
type adminWordPayload struct {
	Word             string `json:"word" binding:"required"`
	Phonetic         string `json:"phonetic"`
	PhoneticUS       string `json:"phoneticUs"`
	PhoneticUK       string `json:"phoneticUk"`
	Lemma            string `json:"lemma"`
	Translation      string `json:"translation"`
	TranslationShort string `json:"translationShort"`
	ExampleSentence  string `json:"exampleSentence"`
	ExampleSentences string `json:"exampleSentences"`
	AudioURL         string `json:"audioUrl"`
	ImageURL         string `json:"imageUrl"`
	VideoURL         string `json:"videoUrl"`
	Difficulty       int8   `json:"difficulty"`
	SortOrder        int    `json:"sortOrder"`
	PartOfSpeech     string `json:"partOfSpeech"`
	Definition       string `json:"definition"`
	Synonyms         string `json:"synonyms"`
	Antonyms         string `json:"antonyms"`
	WordFamily       string `json:"wordFamily"`
	Collocations     string `json:"collocations"`
	Frequency        int8   `json:"frequency"`
	Importance       int8   `json:"importance"`
	Tags             string `json:"tags"`
	Notes            string `json:"notes"`
	Syllables        string `json:"syllables"`
	StressPattern    string `json:"stressPattern"`
	CEFRLevel        string `json:"cefrLevel"`
	Register         string `json:"register"`
	Etymology        string `json:"etymology"`
	Morphology       string `json:"morphology"`
	Derivations      string `json:"derivations"`
	Mnemonic         string `json:"mnemonic"`
	Homophones       string `json:"homophones"`
	UsageNotes       string `json:"usageNotes"`
	GrammarPatterns  string `json:"grammarPatterns"`
}

func (p adminWordPayload) toWord(bookID uint) models.Word {
	diff := p.Difficulty
	if diff < 1 || diff > 5 {
		diff = 1
	}
	freq := p.Frequency
	if freq < 1 || freq > 5 {
		freq = 1
	}
	imp := p.Importance
	if imp < 1 || imp > 5 {
		imp = 1
	}
	return models.Word{
		WordBookID:       bookID,
		Word:             p.Word,
		Phonetic:         p.Phonetic,
		PhoneticUS:       p.PhoneticUS,
		PhoneticUK:       p.PhoneticUK,
		Lemma:            p.Lemma,
		Translation:      p.Translation,
		TranslationShort: p.TranslationShort,
		ExampleSentence:  p.ExampleSentence,
		ExampleSentences: p.ExampleSentences,
		AudioURL:         utils.DeduplicateSlots(p.AudioURL),
		ImageURL:         p.ImageURL,
		VideoURL:         p.VideoURL,
		Difficulty:       diff,
		SortOrder:        p.SortOrder,
		PartOfSpeech:     p.PartOfSpeech,
		Definition:       p.Definition,
		Synonyms:         p.Synonyms,
		Antonyms:         p.Antonyms,
		WordFamily:       p.WordFamily,
		Collocations:     p.Collocations,
		Frequency:        freq,
		Importance:       imp,
		Tags:             p.Tags,
		Notes:            p.Notes,
		Syllables:        p.Syllables,
		StressPattern:    p.StressPattern,
		CEFRLevel:        p.CEFRLevel,
		Register:         p.Register,
		Etymology:        p.Etymology,
		Morphology:       p.Morphology,
		Derivations:      p.Derivations,
		Mnemonic:         p.Mnemonic,
		Homophones:       p.Homophones,
		UsageNotes:       p.UsageNotes,
		GrammarPatterns:  p.GrammarPatterns,
	}
}

func (h *Handlers) registerWordBookRoutes(r *humax.Group) {
	wb := r.Group("wordbooks")
	wb.Use(auth.Required)
	{
		wb.GET("", h.handleListWordBooks)
		h.registerCustomWordBookRoutes(wb)
		wb.GET("/:id/words", h.handleListWordBookWords)
		// 管理员或自定义词书所有者可改删单词（同路径，鉴权在 handler 内）
		wb.PUT("/:id/words/:wid", h.handleUpdateWordBookWord)
		wb.DELETE("/:id/words/:wid", h.handleDeleteWordBookWord)
		wb.GET("/:id", h.handleGetWordBook)
		wb.POST("/:id/select", h.handleSelectWordBook)
		wb.GET("/:id/progress", h.handleGetWordBookProgress)
		wb.GET("/:id/screen/next", h.handleScreenNext)
		wb.POST("/:id/screen/submit", h.handleScreenSubmit)
		wb.GET("/:id/screen/status", h.handleScreenStatus)

		admin := wb.Group("")
		admin.Use(auth.AdminRequired)
		{
			admin.GET("/list", h.adminListWordBooks)
			admin.GET("/batch-audio/jobs", h.adminListWordBookBatchAudioJobs)
			admin.POST("/:id/recount-count", h.adminRecountWordBookCount)
			admin.GET("/cover-ai/defaults", h.adminWordBookCoverDefaults)
			admin.GET("/cover-ai/jobs", h.adminListWordBookCoverJobs)
			admin.POST("/cover-ai/test", h.adminWordBookCoverTest)
			admin.POST("/:id/generate-cover", h.adminStartWordBookCover)
			admin.GET("/:id/generate-cover", h.adminWordBookCoverStatus)
			admin.POST("/:id/generate-cover/save", h.adminSaveWordBookCover)
			admin.POST("/:id/generate-cover/clear", h.adminClearWordBookCover)
			admin.POST("", h.adminCreateWordBook)
			admin.PUT("/:id", h.adminUpdateWordBook)
			admin.DELETE("/:id", h.adminDeleteWordBook)
			// 与登录用户浏览 GET /wordbooks/:id/words 区分，避免同路径被 requireAdmin 覆盖
			admin.GET("/:id/managed-words", h.adminListWords)
			admin.POST("/:id/words", h.adminCreateWord)
			admin.POST("/:id/words/check", h.adminCheckWords)
			admin.POST("/:id/words/batch", h.adminBatchCreateWords)
			admin.POST("/:id/words/deduplicate-audio", h.adminDeduplicateWordBookAudio)
			admin.POST("/:id/words/purge-all-audio", h.adminPurgeWordBookAudio)
			admin.GET("/:id/words/purge-all-audio", h.adminPurgeWordBookAudioStatus)
			admin.POST("/:id/words/batch-audio", h.adminBatchWordBookAudio)
			admin.GET("/:id/words/batch-audio", h.adminBatchWordBookAudioStatus)
			admin.POST("/:id/words/batch-audio/stop", h.adminBatchWordBookAudioStop)
		}
	}

	// 单词详情（按 word ID 查询完整词典数据）
	words := r.Group("words")
	words.Use(auth.Required)
	{
		words.GET("/:id/user-word", h.handleGetMyUserWord)
		words.PUT("/:id/user-word", h.handleUpsertMyUserWord)
		words.DELETE("/:id/user-word", h.handleDeleteMyUserWord)
		words.GET("/:id", h.handleGetWordDetail)
	}
}

func (h *Handlers) handleListWordBooks(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	level := c.Query("level")
	keyword := strings.TrimSpace(c.Query("keyword"))
	category := c.Query("category")
	group := c.Query("group")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 1000 {
		pageSize = 20
	}

	var ownerUID uint
	if u := auth.CurrentUser(c); u != nil {
		ownerUID = u.ID
	}

	books, total, err := models.ListWordBooksWithSearch(db, keyword, level, category, group, true, page, pageSize, ownerUID)
	if err != nil {
		response.FailI18n(c, "wordbook.list_failed", err)
		return
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"list":     models.ToPublicWordBooks(books),
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
		"groups":   models.GroupNames(),
	})
}

func (h *Handlers) handleGetWordBook(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	book, err := models.GetWordBookByID(db, uint(id))
	if err != nil {
		response.FailI18n(c, "wordbook.not_found", err)
		return
	}
	if book.OwnerUserID > 0 {
		u := auth.CurrentUser(c)
		if u == nil || u.ID != book.OwnerUserID {
			response.FailI18n(c, "wordbook.no_access", nil)
			return
		}
	}
	response.SuccessI18n(c, "common.success", models.ToPublicWordBook(*book))
}

// handleGetWordDetail GET /words/:id — 返回单个单词的完整词典数据
func (h *Handlers) handleGetWordDetail(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	var word models.Word
	if err := db.Where("id = ?", id).First(&word).Error; err != nil {
		response.FailI18n(c, "wordbook.word_not_found", err)
		return
	}
	overlayCurrentUserWord(c, db, &word)
	response.SuccessI18n(c, "common.success", word)
}

// handleListWordBookWords GET /wordbooks/:id/words?page=&pageSize=&keyword=
// 登录用户浏览词库单词（不含管理端编辑能力）
func (h *Handlers) handleListWordBookWords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	book, err := models.GetWordBookByID(db, id)
	if err != nil {
		response.FailI18n(c, "wordbook.not_found", nil)
		return
	}
	if book.OwnerUserID > 0 {
		u := auth.CurrentUser(c)
		if u == nil || u.ID != book.OwnerUserID {
			response.FailI18n(c, "wordbook.no_access", nil)
			return
		}
	}
	if !book.IsActive {
		response.FailI18n(c, "msg.ebaf41ad", nil)
		return
	}
	page := 1
	pageSize := 30
	if p := c.Query("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if s := c.Query("pageSize"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v > 0 && v <= 100 {
			pageSize = v
		}
	}
	keyword := strings.TrimSpace(c.Query("keyword"))
	words, total, err := models.ListWordsLite(db, id, keyword, page, pageSize)
	if err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	overlayCurrentUserWordLites(c, db, words)
	response.SuccessI18n(c, "common.success", gin.H{
		"list":     words,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (h *Handlers) handleSelectWordBook(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	if _, err := models.GetWordBookByID(db, uint(id)); err != nil {
		response.FailI18n(c, "wordbook.not_found", err)
		return
	}

	now := time.Now().UTC()
	uwb := models.UserWordBook{UserID: user.ID, WordBookID: uint(id)}
	if err := db.Where(models.UserWordBook{UserID: user.ID, WordBookID: uint(id)}).
		Attrs(models.UserWordBook{Status: "active", StartedAt: &now}).
		FirstOrCreate(&uwb).Error; err != nil {
		response.FailI18n(c, "wordbook.select_failed", err)
		return
	}

	// 懒初始化：不再为词库每个单词批量创建 UserWordState（大词库几千条 INSERT 很慢）
	// 筛词时按需创建状态记录，学习时也按需创建
	// ScreenProgress=0 表示从头开始筛词，不需要预创建任何状态

	response.SuccessI18n(c, "common.success", uwb)
}

func (h *Handlers) handleGetWordBookProgress(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	var uwb models.UserWordBook
	if err := db.Where("user_id = ? AND word_book_id = ?", user.ID, id).First(&uwb).Error; err != nil {
		response.FailI18n(c, "wordbook.not_selected", err)
		return
	}

	// 使用 word_books.word_count 冗余字段，避免对 words 表 COUNT(*)
	totalWords, _ := models.GetWordCountByBookID(db, uint(id))

	var unknownCount int64
	_ = db.Model(&models.UserWordState{}).
		Where("user_id = ? AND word_book_id = ? AND screen_result = ?", user.ID, id, "unknown").
		Count(&unknownCount).Error

	var learnedCount int64
	_ = db.Model(&models.UserWordState{}).
		Where("user_id = ? AND word_book_id = ? AND learn_status IN ?", user.ID, id, []string{"learned", "mastered"}).
		Count(&learnedCount).Error

	response.SuccessI18n(c, "common.success", gin.H{
		"userWordBook":     uwb,
		"totalWords":       totalWords,
		"screenProgress":   uwb.ScreenProgress,
		"unknownCount":     unknownCount,
		"learnedCount":     learnedCount,
		"canStartLearning": uwb.ScreenCompleted,
	})
}

func (h *Handlers) handleScreenNext(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	var uwb models.UserWordBook
	if err := db.Where("user_id = ? AND word_book_id = ?", user.ID, id).First(&uwb).Error; err != nil {
		response.FailI18n(c, "wordbook.not_selected", err)
		return
	}
	if uwb.ScreenCompleted {
		response.SuccessI18n(c, "study.screening_completed", gin.H{"completed": true})
		return
	}

	// 游标分页：用 ScreenProgress 作为已筛数量，通过 LIMIT + OFFSET 1 获取下一条
	// 对于大词库，这里仍用 Offset 但只取 1 条，MySQL 会利用索引快速定位
	var word models.Word
	err := db.Where("word_book_id = ?").
		Order("sort_order ASC, id ASC").
		Offset(uwb.ScreenProgress).
		Limit(1).
		First(&word).Error
	if err != nil {
		_ = db.Model(&uwb).Updates(map[string]any{"screen_completed": true}).Error
		response.SuccessI18n(c, "study.screening_completed", gin.H{"completed": true})
		return
	}
	models.OverlayWord(db, user.ID, &word)

	// 使用 word_books.word_count 冗余字段
	totalWords, _ := models.GetWordCountByBookID(db, uint(id))

	response.SuccessI18n(c, "common.success", gin.H{
		"word":      word,
		"screened":  uwb.ScreenProgress,
		"total":     totalWords,
		"completed": false,
	})
}

func (h *Handlers) handleScreenSubmit(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	var body struct {
		WordID uint   `json:"wordId" binding:"required"`
		Result string `json:"result" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}

	now := time.Now().UTC()
	// 懒创建：筛词时按需创建/更新 UserWordState（不再依赖预创建的批量记录）
	state := models.UserWordState{
		UserID:       user.ID,
		WordID:       body.WordID,
		WordBookID:   uint(id),
		ScreenResult: body.Result,
		ScreenAt:     &now,
		LearnStatus:  "pending",
	}
	if err := db.Where(models.UserWordState{UserID: user.ID, WordID: body.WordID}).
		Assign(models.UserWordState{ScreenResult: body.Result, ScreenAt: &now, WordBookID: uint(id)}).
		FirstOrCreate(&state).Error; err != nil {
		response.FailI18n(c, "study.save_screening_failed", err)
		return
	}

	var uwb models.UserWordBook
	if err := db.Where("user_id = ? AND word_book_id = ?", user.ID, id).First(&uwb).Error; err != nil {
		response.FailI18n(c, "wordbook.not_selected", err)
		return
	}
	newProgress := uwb.ScreenProgress + 1

	// 使用 word_books.word_count 冗余字段
	totalWords, _ := models.GetWordCountByBookID(db, uint(id))
	screenCompleted := int64(newProgress) >= totalWords

	_ = db.Model(&uwb).Updates(map[string]any{"screen_progress": newProgress, "screen_completed": screenCompleted}).Error

	var unknownCount int64
	_ = db.Model(&models.UserWordState{}).
		Where("user_id = ? AND word_book_id = ? AND screen_result = ?", user.ID, id, "unknown").
		Count(&unknownCount).Error
	var knownCount int64
	_ = db.Model(&models.UserWordState{}).
		Where("user_id = ? AND word_book_id = ? AND screen_result = ?", user.ID, id, "known").
		Count(&knownCount).Error

	response.SuccessI18n(c, "common.success", gin.H{
		"unknownCount":     unknownCount,
		"knownCount":       knownCount,
		"screened":         newProgress,
		"total":            totalWords,
		"screenCompleted":  screenCompleted,
		"canStartLearning": screenCompleted,
	})
}

func (h *Handlers) handleScreenStatus(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return
	}

	var uwb models.UserWordBook
	if err := db.Where("user_id = ? AND word_book_id = ?", user.ID, id).First(&uwb).Error; err != nil {
		response.FailI18n(c, "wordbook.not_selected", err)
		return
	}

	var unknownCount int64
	_ = db.Model(&models.UserWordState{}).
		Where("user_id = ? AND word_book_id = ? AND screen_result = ?", user.ID, id, "unknown").
		Count(&unknownCount).Error
	var knownCount int64
	_ = db.Model(&models.UserWordState{}).
		Where("user_id = ? AND word_book_id = ? AND screen_result = ?", user.ID, id, "known").
		Count(&knownCount).Error
	// 使用 word_books.word_count 冗余字段
	totalWords, _ := models.GetWordCountByBookID(db, uint(id))

	response.SuccessI18n(c, "common.success", gin.H{
		"screened":         uwb.ScreenProgress,
		"total":            totalWords,
		"screenCompleted":  uwb.ScreenCompleted,
		"unknownCount":     unknownCount,
		"knownCount":       knownCount,
		"canStartLearning": uwb.ScreenCompleted,
	})
}

func (h *Handlers) adminListWordBooks(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 1000 {
		pageSize = 20
	}
	keyword := strings.TrimSpace(c.Query("keyword"))
	level := c.Query("level")
	isActiveQuery := c.Query("isActive")
	group := c.Query("group")
	sourceName := strings.TrimSpace(c.Query("sourceName"))

	q := db.Model(&models.WordBook{}).
		Order("sort_order ASC, id DESC")
	if keyword != "" {
		q = q.Where("name LIKE ?", "%"+keyword+"%")
	}
	if level != "" {
		q = q.Where("level = ?", level)
	}
	switch isActiveQuery {
	case "true":
		q = q.Where("is_active = ?", true)
	case "false":
		q = q.Where("is_active = ?", false)
	}
	if group != "" {
		patterns := models.GroupPatterns(group)
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
	if sourceName != "" {
		q = q.Where("source_name = ?", sourceName)
	}
	if c.Query("hasCover") == "true" {
		q = q.Where("cover_url IS NOT NULL AND cover_url != ''")
	}

	var total int64
	q.Count(&total)
	var books []models.WordBook
	q.Offset((page - 1) * pageSize).Limit(pageSize).Find(&books)

	var sources []string
	db.Model(&models.WordBook{}).
		Where("source_name IS NOT NULL AND source_name != ''").
		Distinct().
		Order("source_name ASC").
		Pluck("source_name", &sources)

	response.SuccessI18n(c, "common.success", gin.H{
		"list":     books,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
		"groups":   models.GroupNames(),
		"sources":  sources,
	})
}

func (h *Handlers) adminRecountWordBookCount(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	bookID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || bookID == 0 {
		response.FailI18n(c, "wordbook.invalid_id", nil)
		return
	}
	var book models.WordBook
	if err := db.Where("id = ?", bookID).First(&book).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailI18n(c, "wordbook.not_found", nil)
		} else {
			response.FailI18n(c, "wordbook.query_failed", err)
		}
		return
	}
	if err := models.SyncWordBookCount(db, uint(bookID)); err != nil {
		response.FailI18n(c, "common.recalculate_failed", err)
		return
	}
	if err := db.Select("word_count").First(&book, bookID).Error; err != nil {
		response.FailI18n(c, "wordbook.count_failed", err)
		return
	}
	response.SuccessI18n(c, "wordbook.recalculated", gin.H{
		"wordCount": book.WordCount,
	}, book.WordCount)
}

func (h *Handlers) adminCreateWordBook(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	var body struct {
		Name            string `json:"name" binding:"required"`
		Description     string `json:"description"`
		Level           string `json:"level"`
		CoverURL        string `json:"coverUrl"`
		IsActive        *bool  `json:"isActive"`
		SortOrder       int    `json:"sortOrder"`
		ExamTags        string `json:"examTags"`
		CEFRRange       string `json:"cefrRange"`
		RegionalVariant string `json:"regionalVariant"`
		SourceName      string `json:"sourceName"`
		SourceURL       string `json:"sourceUrl"`
		LicenseNote     string `json:"licenseNote"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}
	book := models.WordBook{
		Name:            body.Name,
		Description:     body.Description,
		Level:           body.Level,
		CoverURL:        body.CoverURL,
		IsActive:        isActive,
		SortOrder:       body.SortOrder,
		ExamTags:        body.ExamTags,
		CEFRRange:       body.CEFRRange,
		RegionalVariant: body.RegionalVariant,
		SourceName:      body.SourceName,
		SourceURL:       body.SourceURL,
		LicenseNote:     body.LicenseNote,
	}
	if user != nil {
		operator := user.DisplayName
		if operator == "" {
			operator = user.Username
		}
		if operator == "" {
			operator = fmt.Sprintf("%d", user.ID)
		}
		book.SetCreateInfo(operator)
	}
	if err := models.CreateWordBook(db, &book); err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.created", book)
}

func (h *Handlers) adminUpdateWordBook(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	if _, err := models.GetWordBookByID(db, uint(id)); err != nil {
		response.FailI18n(c, "wordbook.not_found", err)
		return
	}
	var body map[string]any
	if err := c.ShouldBindJSON(&body); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	// Prevent client from tampering audit fields
	delete(body, "createBy")
	delete(body, "updateBy")
	delete(body, "create_by")
	delete(body, "update_by")
	if user != nil {
		operator := user.DisplayName
		if operator == "" {
			operator = user.Username
		}
		if operator == "" {
			operator = fmt.Sprintf("%d", user.ID)
		}
		body["update_by"] = operator
	}
	if err := models.UpdateWordBook(db, uint(id), body); err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	book, _ := models.GetWordBookByID(db, uint(id))
	response.SuccessI18n(c, "common.updated", book)
}

func (h *Handlers) adminDeleteWordBook(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	bookID, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	operator := ""
	if user != nil {
		operator = user.DisplayName
		if operator == "" {
			operator = user.Username
		}
		if operator == "" {
			operator = fmt.Sprintf("%d", user.ID)
		}
	}
	if err := models.DeleteWordBook(db, bookID, operator); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.FailI18n(c, "wordbook.not_found", err)
			return
		}
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.deleted", nil)
}

func (h *Handlers) adminListWords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "30"))
	keyword := c.Query("keyword")

	words, total, err := models.ListWords(db, uint(id), keyword, page, pageSize)
	if err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	response.SuccessI18n(c, "common.success", gin.H{"list": words, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Handlers) adminCreateWord(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	var body adminWordPayload
	if err := c.ShouldBindJSON(&body); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	word := body.toWord(uint(id))
	if user != nil {
		operator := user.DisplayName
		if operator == "" {
			operator = user.Username
		}
		if operator == "" {
			operator = fmt.Sprintf("%d", user.ID)
		}
		word.SetCreateInfo(operator)
	}
	if err := models.CreateWord(db, &word); err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.created", word)
}

func canManageWordBookWords(user *models.User, book *models.WordBook) bool {
	if user == nil || book == nil {
		return false
	}
	if user.IsAdmin() {
		return true
	}
	return book.OwnerUserID > 0 && book.OwnerUserID == user.ID
}

func operatorName(user *models.User) string {
	if user == nil {
		return ""
	}
	if user.DisplayName != "" {
		return user.DisplayName
	}
	if user.Username != "" {
		return user.Username
	}
	return fmt.Sprintf("%d", user.ID)
}

// handleUpdateWordBookWord PUT /wordbooks/:id/words/:wid — 管理员或自定义词书所有者
func (h *Handlers) handleUpdateWordBookWord(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	bookID, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	wid, ok := parseRouteUintID(c, "wid")
	if !ok {
		return
	}
	book, err := models.GetWordBookByID(db, bookID)
	if err != nil {
		response.FailI18n(c, "wordbook.not_found", err)
		return
	}
	if !canManageWordBookWords(user, book) {
		response.FailI18n(c, "wordbook.no_edit_access", nil)
		return
	}
	word, err := models.GetWordByID(db, wid)
	if err != nil || word.WordBookID != bookID {
		response.FailI18n(c, "wordbook.word_not_found", err)
		return
	}
	var body map[string]any
	if err := c.ShouldBindJSON(&body); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	delete(body, "createBy")
	delete(body, "updateBy")
	delete(body, "create_by")
	delete(body, "update_by")
	delete(body, "id")
	delete(body, "wordBookId")
	delete(body, "word_book_id")
	if op := operatorName(user); op != "" {
		body["update_by"] = op
	}
	if v, ok := body["audioUrl"]; ok {
		body["audio_url"] = utils.DeduplicateSlots(strings.TrimSpace(fmt.Sprint(v)))
		delete(body, "audioUrl")
	}
	if v, ok := body["translationShort"]; ok {
		body["translation_short"] = strings.TrimSpace(fmt.Sprint(v))
		delete(body, "translationShort")
	}
	if v, ok := body["word"]; ok {
		w := strings.TrimSpace(fmt.Sprint(v))
		if w == "" {
			response.FailI18n(c, "wordbook.word_required", nil)
			return
		}
		body["word"] = w
	}
	if err := models.UpdateWord(db, uint(wid), body); err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	fresh, _ := models.GetWordByID(db, uint(wid))
	response.SuccessI18n(c, "common.updated", fresh)
}

// handleDeleteWordBookWord DELETE /wordbooks/:id/words/:wid — 管理员或自定义词书所有者
func (h *Handlers) handleDeleteWordBookWord(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	bookID, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	wid, ok := parseRouteUintID(c, "wid")
	if !ok {
		return
	}
	book, err := models.GetWordBookByID(db, bookID)
	if err != nil {
		response.FailI18n(c, "wordbook.not_found", err)
		return
	}
	if !canManageWordBookWords(user, book) {
		response.FailI18n(c, "wordbook.no_delete_access", nil)
		return
	}
	word, err := models.GetWordByID(db, wid)
	if err != nil || word.WordBookID != bookID {
		response.FailI18n(c, "wordbook.word_not_found", err)
		return
	}
	if err := models.DeleteWord(db, wid, operatorName(user)); err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	_ = models.SyncWordBookCount(db, bookID)
	response.SuccessI18n(c, "common.deleted", nil)
}

// adminCheckWords POST {adminPrefix}/wordbooks/:id/words/check
func (h *Handlers) adminCheckWords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	var body struct {
		Words []string `json:"words"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Words) == 0 {
		response.SuccessI18n(c, "common.success", gin.H{"duplicates": []string{}})
		return
	}
	var existing []string
	db.Model(&models.Word{}).
		Where("word_book_id = ? AND word IN ?", id, body.Words).
		Pluck("word", &existing)
	response.SuccessI18n(c, "common.success", gin.H{"duplicates": existing})
}

// adminBatchCreateWords POST {adminPrefix}/wordbooks/:id/words/batch
func (h *Handlers) adminBatchCreateWords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	id, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}
	var body struct {
		Words []adminWordPayload `json:"words"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Words) == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	words := make([]models.Word, 0, len(body.Words))
	operator := ""
	if user != nil {
		operator = user.DisplayName
		if operator == "" {
			operator = user.Username
		}
		if operator == "" {
			operator = fmt.Sprintf("%d", user.ID)
		}
	}
	for _, w := range body.Words {
		if strings.TrimSpace(w.Word) == "" {
			continue
		}
		w.Word = strings.TrimSpace(w.Word)
		word := w.toWord(uint(id))
		if operator != "" {
			word.SetCreateInfo(operator)
		}
		words = append(words, word)
	}
	if len(words) == 0 {
		response.FailI18n(c, "wordbook.import_empty", nil)
		return
	}
	if err := models.BatchCreateWords(db, words); err != nil {
		response.FailI18n(c, "wordbook.batch_insert_failed", err)
		return
	}
	response.SuccessI18n(c, "common.imported", gin.H{"imported": len(words)})
}

// adminDeduplicateWordBookAudio POST /wordbooks/:id/words/deduplicate-audio
func (h *Handlers) adminDeduplicateWordBookAudio(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	bookID, ok := parseRouteUintID(c, "id")
	if !ok {
		return
	}

	var words []models.Word
	if err := db.Select("id, word, audio_url").
		Where("word_book_id = ? AND audio_url IS NOT NULL AND audio_url <> ''", bookID).
		Find(&words).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}

	checked := len(words)
	updated := 0
	for _, w := range words {
		cleaned := utils.DeduplicateSlots(w.AudioURL)
		if cleaned == w.AudioURL {
			continue
		}
		if err := db.Model(&models.Word{}).Where("id = ?", w.ID).
			Update("audio_url", cleaned).Error; err != nil {
			continue
		}
		updated++
	}

	response.SuccessI18n(c, "wordbook.audio_purged", gin.H{
		"checked": checked,
		"updated": updated,
	})
}
