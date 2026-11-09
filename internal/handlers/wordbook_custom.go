package handlers

import (
	"fmt"

	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/ling-base/apidocs/humax"
	lbconstants "github.com/LingByte/ling-base/common/constants"

	"strings"
	"time"
	"unicode/utf8"

	"github.com/LingByte/CloudStepsGo/internal/models"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (h *Handlers) registerCustomWordBookRoutes(wb *humax.Group) {
	// 必须在 /:id 之前注册
	wb.POST("/custom/enrich", h.handleEnrichCustomWordBook)
	wb.POST("/custom", h.handleCreateCustomWordBook)
}

// StartCustomWordEnrichCache 启动自定义词书补全用的词条内存缓存
func StartCustomWordEnrichCache(db *gorm.DB) {
	models.StartEnrichCacheLoader(db)
}

type customCreateBody struct {
	Name  string              `json:"name" binding:"required"`
	Words []models.ParsedWord `json:"words" binding:"required"`
}

type customEnrichBody struct {
	Words []models.ParsedWord `json:"words" binding:"required"`
}

// handleEnrichCustomWordBook 回填缺失的释义、音标和读音。先读内存缓存，缺的再按本次单词查库。
func (h *Handlers) handleEnrichCustomWordBook(c *gin.Context) {
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	var body customEnrichBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	items := models.MergeDedup(body.Words)
	if len(items) == 0 {
		response.FailI18n(c, "wordbook.words_empty", nil)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	items = enrichParsedWords(db, items)
	response.SuccessI18n(c, "common.success", gin.H{
		"list":  items,
		"total": len(items),
	})
}

func (h *Handlers) handleCreateCustomWordBook(c *gin.Context) {
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	var body customCreateBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		response.FailI18n(c, "wordbook.name_required", nil)
		return
	}
	if utf8.RuneCountInString(name) > 64 {
		response.FailI18n(c, "wordbook.name_too_long", nil)
		return
	}
	words := models.MergeDedup(body.Words)
	if len(words) == 0 {
		response.FailI18n(c, "wordbook.words_empty", nil)
		return
	}

	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	now := time.Now()
	book := models.WordBook{
		Name:           name,
		Description:    "",
		Category:       "custom",
		Language:       "en",
		TargetLanguage: "zh",
		IsActive:       true,
		OwnerUserID:    user.ID,
		Author:         fmt.Sprintf("user:%d", user.ID),
		WordCount:      0,
	}
	book.CreateBy = fmt.Sprintf("%d", user.ID)

	err := db.Transaction(func(tx *gorm.DB) error {
		if err := models.CreateWordBook(tx, &book); err != nil {
			return err
		}
		rows := make([]models.Word, 0, len(words))
		for i, w := range words {
			rows = append(rows, models.Word{
				WordBookID:       book.ID,
				Word:             w.Word,
				Phonetic:         w.Phonetic,
				Translation:      w.Translation,
				TranslationShort: w.TranslationShort,
				AudioURL:         w.AudioURL,
				SortOrder:        i + 1,
				Difficulty:       1,
				Frequency:        1,
				Importance:       1,
			})
		}
		if err := models.BatchCreateWords(tx, rows); err != nil {
			return err
		}
		uwb := models.UserWordBook{
			UserID:     user.ID,
			WordBookID: book.ID,
			Status:     "active",
			StartedAt:  &now,
		}
		uwb.CreateBy = fmt.Sprintf("%d", user.ID)
		return tx.Create(&uwb).Error
	})
	if err != nil {
		response.FailI18n(c, "wordbook.create_failed", err)
		return
	}

	_ = models.SyncWordBookCount(db, book.ID)
	fresh, _ := models.GetWordBookByID(db, book.ID)
	if fresh != nil {
		book = *fresh
	}

	response.SuccessI18n(c, "common.created", book)
}

func enrichParsedWords(db *gorm.DB, items []models.ParsedWord) []models.ParsedWord {
	items = models.EnrichFromCache(items)
	return models.EnrichMissingFromDB(db, items)
}
