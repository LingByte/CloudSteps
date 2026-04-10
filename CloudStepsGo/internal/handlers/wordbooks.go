package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo"
	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/constants"
	"github.com/LingByte/CloudStepsGo/pkg/response"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (h *Handlers) registerWordBookRoutes(r *gin.RouterGroup) {
	wb := r.Group("wordbooks")
	wb.Use(models.AuthRequired)
	{
		wb.GET("", h.handleListWordBooks)
		wb.GET("/:id", h.handleGetWordBook)
		wb.POST("/:id/select", h.handleSelectWordBook)
		wb.GET("/:id/progress", h.handleGetWordBookProgress)
		wb.GET("/:id/screen/next", h.handleScreenNext)
		wb.POST("/:id/screen/submit", h.handleScreenSubmit)
		wb.GET("/:id/screen/status", h.handleScreenStatus)

		admin := wb.Group("")
		admin.Use(h.requireAdmin)
		{
			admin.GET("/list", h.adminListWordBooks)
			admin.POST("", h.adminCreateWordBook)
			admin.PUT("/:id", h.adminUpdateWordBook)
			admin.DELETE("/:id", h.adminDeleteWordBook)
			admin.GET("/:id/words", h.adminListWords)
			admin.POST("/:id/words", h.adminCreateWord)
			admin.PUT("/:id/words/:wid", h.adminUpdateWord)
			admin.DELETE("/:id/words/:wid", h.adminDeleteWord)
			admin.POST("/:id/words/check", h.adminCheckWords)
			admin.POST("/:id/words/batch", h.adminBatchCreateWords)
		}
	}
}

func (h *Handlers) handleListWordBooks(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	level := c.Query("level")
	books, _, err := models.ListWordBooks(db, level, true, 1, 1000)
	if err != nil {
		response.Fail(c, "获取词库列表失败", err)
		return
	}
	response.Success(c, "success", books)
}

func (h *Handlers) handleGetWordBook(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	id, _ := strconv.Atoi(c.Param("id"))
	book, err := models.GetWordBookByID(db, uint(id))
	if err != nil {
		response.Fail(c, "词库不存在", err)
		return
	}
	response.Success(c, "success", book)
}

func (h *Handlers) handleSelectWordBook(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	if _, err := models.GetWordBookByID(db, uint(id)); err != nil {
		response.Fail(c, "词库不存在", err)
		return
	}

	now := time.Now().UTC()
	uwb := models.UserWordBook{UserID: user.ID, WordBookID: uint(id)}
	if err := db.Where(models.UserWordBook{UserID: user.ID, WordBookID: uint(id)}).
		Attrs(models.UserWordBook{Status: "active", StartedAt: &now}).
		FirstOrCreate(&uwb).Error; err != nil {
		response.Fail(c, "选择词库失败", err)
		return
	}

	if !uwb.ScreenCompleted && uwb.ScreenProgress == 0 {
		var wordIDs []uint
		if err := db.Model(&models.Word{}).Where("word_book_id = ?", id).Order("sort_order ASC, id ASC").Pluck("id", &wordIDs).Error; err != nil {
			response.Fail(c, "初始化失败", err)
			return
		}
		states := make([]models.UserWordState, 0, len(wordIDs))
		for _, wid := range wordIDs {
			states = append(states, models.UserWordState{
				UserID:       user.ID,
				WordID:       wid,
				WordBookID:   uint(id),
				ScreenResult: "unknown",
				ScreenAt:     &now,
				LearnStatus:  "pending",
			})
		}
		if len(states) > 0 {
			_ = db.Where("user_id = ? AND word_book_id = ?", user.ID, id).Delete(&models.UserWordState{}).Error
			if err := db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}, {Name: "word_id"}}, DoNothing: true}).CreateInBatches(states, 200).Error; err != nil {
				response.Fail(c, "初始化失败", err)
				return
			}
		}
	}

	response.Success(c, "success", uwb)
}

func (h *Handlers) handleGetWordBookProgress(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	var uwb models.UserWordBook
	if err := db.Where("user_id = ? AND word_book_id = ?", user.ID, id).First(&uwb).Error; err != nil {
		response.Fail(c, "未选择该词库", err)
		return
	}

	var totalWords int64
	_ = db.Model(&models.Word{}).Where("word_book_id = ?", id).Count(&totalWords).Error

	var unknownCount int64
	_ = db.Model(&models.UserWordState{}).
		Where("user_id = ? AND word_book_id = ? AND screen_result = ?", user.ID, id, "unknown").
		Count(&unknownCount).Error

	var learnedCount int64
	_ = db.Model(&models.UserWordState{}).
		Where("user_id = ? AND word_book_id = ? AND learn_status IN ?", user.ID, id, []string{"learned", "mastered"}).
		Count(&learnedCount).Error

	response.Success(c, "success", gin.H{
		"userWordBook":     uwb,
		"totalWords":       totalWords,
		"screenProgress":   uwb.ScreenProgress,
		"unknownCount":     unknownCount,
		"learnedCount":     learnedCount,
		"canStartLearning": uwb.ScreenCompleted,
	})
}

func (h *Handlers) handleScreenNext(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	var uwb models.UserWordBook
	if err := db.Where("user_id = ? AND word_book_id = ?", user.ID, id).First(&uwb).Error; err != nil {
		response.Fail(c, "未选择该词库", err)
		return
	}
	if uwb.ScreenCompleted {
		response.Success(c, "筛词已完成", gin.H{"completed": true})
		return
	}

	var word models.Word
	err := db.Where("word_book_id = ?", id).
		Order("sort_order ASC, id ASC").
		Offset(uwb.ScreenProgress).
		First(&word).Error
	if err != nil {
		_ = db.Model(&uwb).Updates(map[string]any{"screen_completed": true}).Error
		response.Success(c, "筛词已完成", gin.H{"completed": true})
		return
	}

	var totalWords int64
	_ = db.Model(&models.Word{}).Where("word_book_id = ?", id).Count(&totalWords).Error

	response.Success(c, "success", gin.H{
		"word":      word,
		"screened":  uwb.ScreenProgress,
		"total":     totalWords,
		"completed": false,
	})
}

func (h *Handlers) handleScreenSubmit(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	var body struct {
		WordID uint   `json:"wordId" binding:"required"`
		Result string `json:"result" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		CloudStepsGo.AbortWithJSONError(c, http.StatusBadRequest, err)
		return
	}

	now := time.Now().UTC()
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
		response.Fail(c, "保存筛词结果失败", err)
		return
	}

	var uwb models.UserWordBook
	if err := db.Where("user_id = ? AND word_book_id = ?", user.ID, id).First(&uwb).Error; err != nil {
		response.Fail(c, "未选择该词库", err)
		return
	}
	newProgress := uwb.ScreenProgress + 1

	var totalWords int64
	_ = db.Model(&models.Word{}).Where("word_book_id = ?", id).Count(&totalWords).Error
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

	response.Success(c, "success", gin.H{
		"unknownCount":     unknownCount,
		"knownCount":       knownCount,
		"screened":         newProgress,
		"total":            totalWords,
		"screenCompleted":  screenCompleted,
		"canStartLearning": screenCompleted,
	})
}

func (h *Handlers) handleScreenStatus(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "authorization required"})
		return
	}

	var uwb models.UserWordBook
	if err := db.Where("user_id = ? AND word_book_id = ?", user.ID, id).First(&uwb).Error; err != nil {
		response.Fail(c, "未选择该词库", err)
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
	var totalWords int64
	_ = db.Model(&models.Word{}).Where("word_book_id = ?", id).Count(&totalWords).Error

	response.Success(c, "success", gin.H{
		"screened":         uwb.ScreenProgress,
		"total":            totalWords,
		"screenCompleted":  uwb.ScreenCompleted,
		"unknownCount":     unknownCount,
		"knownCount":       knownCount,
		"canStartLearning": uwb.ScreenCompleted,
	})
}

func (h *Handlers) adminListWordBooks(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	keyword := c.Query("keyword")
	level := c.Query("level")

	q := db.Model(&models.WordBook{}).Order("sort_order ASC, id DESC")
	if keyword != "" {
		q = q.Where("name LIKE ?", "%"+keyword+"%")
	}
	if level != "" {
		q = q.Where("level = ?", level)
	}

	var total int64
	q.Count(&total)
	var books []models.WordBook
	q.Offset((page - 1) * pageSize).Limit(pageSize).Find(&books)

	response.Success(c, "success", gin.H{"list": books, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Handlers) adminCreateWordBook(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	var body struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		Level       string `json:"level"`
		CoverURL    string `json:"coverUrl"`
		IsActive    *bool  `json:"isActive"`
		SortOrder   int    `json:"sortOrder"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		CloudStepsGo.AbortWithJSONError(c, http.StatusBadRequest, err)
		return
	}
	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}
	book := models.WordBook{
		Name:        body.Name,
		Description: body.Description,
		Level:       body.Level,
		CoverURL:    body.CoverURL,
		IsActive:    isActive,
		SortOrder:   body.SortOrder,
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
		response.Fail(c, "创建失败", err)
		return
	}
	response.Success(c, "创建成功", book)
}

func (h *Handlers) adminUpdateWordBook(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	if _, err := models.GetWordBookByID(db, uint(id)); err != nil {
		response.Fail(c, "词库不存在", err)
		return
	}
	var body map[string]any
	if err := c.ShouldBindJSON(&body); err != nil {
		CloudStepsGo.AbortWithJSONError(c, http.StatusBadRequest, err)
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
		response.Fail(c, "更新失败", err)
		return
	}
	book, _ := models.GetWordBookByID(db, uint(id))
	response.Success(c, "更新成功", book)
}

func (h *Handlers) adminDeleteWordBook(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
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
	if err := models.DeleteWordBook(db, uint(id), operator); err != nil {
		response.Fail(c, "删除失败", err)
		return
	}
	response.Success(c, "删除成功", nil)
}

func (h *Handlers) adminListWords(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	id, _ := strconv.Atoi(c.Param("id"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "30"))
	keyword := c.Query("keyword")

	words, total, err := models.ListWords(db, uint(id), keyword, page, pageSize)
	if err != nil {
		response.Fail(c, "查询失败", err)
		return
	}
	response.Success(c, "success", gin.H{"list": words, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Handlers) adminCreateWord(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var body struct {
		Word            string `json:"word" binding:"required"`
		Phonetic        string `json:"phonetic"`
		Translation     string `json:"translation"`
		ExampleSentence string `json:"exampleSentence"`
		AudioURL        string `json:"audioUrl"`
		ImageURL        string `json:"imageUrl"`
		Difficulty      int8   `json:"difficulty"`
		SortOrder       int    `json:"sortOrder"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		CloudStepsGo.AbortWithJSONError(c, http.StatusBadRequest, err)
		return
	}
	if body.Difficulty < 1 || body.Difficulty > 5 {
		body.Difficulty = 1
	}
	word := models.Word{
		WordBookID:      uint(id),
		Word:            body.Word,
		Phonetic:        body.Phonetic,
		Translation:     body.Translation,
		ExampleSentence: body.ExampleSentence,
		AudioURL:        body.AudioURL,
		Difficulty:      body.Difficulty,
		SortOrder:       body.SortOrder,
	}
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
		response.Fail(c, "创建失败", err)
		return
	}
	response.Success(c, "创建成功", word)
}

func (h *Handlers) adminUpdateWord(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	wid, _ := strconv.Atoi(c.Param("wid"))
	if _, err := models.GetWordByID(db, uint(wid)); err != nil {
		response.Fail(c, "单词不存在", err)
		return
	}
	var body map[string]any
	if err := c.ShouldBindJSON(&body); err != nil {
		CloudStepsGo.AbortWithJSONError(c, http.StatusBadRequest, err)
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
	if err := models.UpdateWord(db, uint(wid), body); err != nil {
		response.Fail(c, "更新失败", err)
		return
	}
	word, _ := models.GetWordByID(db, uint(wid))
	response.Success(c, "更新成功", word)
}

func (h *Handlers) adminDeleteWord(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	wid, _ := strconv.Atoi(c.Param("wid"))
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
	if err := models.DeleteWord(db, uint(wid), operator); err != nil {
		response.Fail(c, "删除失败", err)
		return
	}
	response.Success(c, "删除成功", nil)
}

// adminCheckWords POST {adminPrefix}/wordbooks/:id/words/check
func (h *Handlers) adminCheckWords(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	id, _ := strconv.Atoi(c.Param("id"))
	var body struct {
		Words []string `json:"words"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Words) == 0 {
		response.Success(c, "success", gin.H{"duplicates": []string{}})
		return
	}
	var existing []string
	db.Model(&models.Word{}).
		Where("word_book_id = ? AND is_deleted = ? AND word IN ?", id, models.SoftDeleteStatusActive, body.Words).
		Pluck("word", &existing)
	response.Success(c, "success", gin.H{"duplicates": existing})
}

// adminBatchCreateWords POST {adminPrefix}/wordbooks/:id/words/batch
func (h *Handlers) adminBatchCreateWords(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	user := models.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var body struct {
		Words []struct {
			Word            string `json:"word"`
			Phonetic        string `json:"phonetic"`
			Translation     string `json:"translation"`
			ExampleSentence string `json:"exampleSentence"`
			AudioURL        string `json:"audioUrl"`
			Difficulty      int8   `json:"difficulty"`
			SortOrder       int    `json:"sortOrder"`
		} `json:"words"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Words) == 0 {
		CloudStepsGo.AbortWithJSONError(c, http.StatusBadRequest, errors.New("参数错误"))
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
		diff := w.Difficulty
		if diff < 1 || diff > 5 {
			diff = 1
		}
		word := models.Word{
			WordBookID:      uint(id),
			Word:            strings.TrimSpace(w.Word),
			Phonetic:        w.Phonetic,
			Translation:     w.Translation,
			ExampleSentence: w.ExampleSentence,
			AudioURL:        w.AudioURL,
			Difficulty:      diff,
			SortOrder:       w.SortOrder,
		}
		if operator != "" {
			word.SetCreateInfo(operator)
		}
		words = append(words, word)
	}
	if len(words) == 0 {
		CloudStepsGo.AbortWithJSONError(c, http.StatusBadRequest, errors.New("没有可导入的数据"))
		return
	}
	if err := models.BatchCreateWords(db, words); err != nil {
		response.Fail(c, "批量插入失败", err)
		return
	}
	response.Success(c, "导入成功", gin.H{"imported": len(words)})
}
