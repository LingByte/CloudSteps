package handlers

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"path"
	"strconv"
	"strings"
	"time"

	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/stores"
	"github.com/LingByte/CloudStepsGo/pkg/wechat"
	"github.com/LingByte/ling-base/apidocs/humax"
	lbconstants "github.com/LingByte/ling-base/common/constants"
	"github.com/LingByte/ling-base/cache/lru"
	"github.com/LingByte/ling-base/common/logger"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

func (h *Handlers) registerWechatMpArticleRoutes(r *humax.Group) {
	admin := r.Group("admin")
	admin.Use(auth.Required, auth.AdminRequired)
	g := admin.Group("wechat-mp-articles")
	{
		g.GET("", h.handleAdminListWechatMpArticles)
		g.POST("", h.handleAdminCreateWechatMpArticle)
		g.GET("/remote/published", h.handleAdminListRemoteWechatPublished)
		g.POST("/import", h.handleAdminImportWechatPublished)
		g.POST("/upload-thumb", h.handleAdminUploadWechatMpThumb)
		g.POST("/generate-thumb", h.handleAdminStartWechatMpThumbGenerate)
		g.GET("/generate-thumb", h.handleAdminWechatMpThumbGenerateStatus)
		g.POST("/upload-content-image", h.handleAdminUploadWechatMpContentImage)
		g.GET("/:id", h.handleAdminGetWechatMpArticle)
		g.PUT("/:id", h.handleAdminUpdateWechatMpArticle)
		g.DELETE("/:id", h.handleAdminDeleteWechatMpArticle)
		g.POST("/:id/sync-draft", h.handleAdminSyncWechatMpArticleDraft)
		g.POST("/:id/publish", h.handleAdminPublishWechatMpArticle)
	}
}

type wechatMpArticleDTO struct {
	ID               uint       `json:"id,string"`
	Title            string     `json:"title"`
	Author           string     `json:"author"`
	Digest           string     `json:"digest"`
	Content          string     `json:"content"`
	ContentSourceURL string     `json:"contentSourceUrl"`
	ThumbMediaID     string     `json:"thumbMediaId"`
	ThumbPreviewURL  string     `json:"thumbPreviewUrl"`
	Status           string     `json:"status"`
	WechatMediaID      string     `json:"wechatMediaId"`
	WechatPublishID    string     `json:"wechatPublishId"`
	WechatArticleID    string     `json:"wechatArticleId"`
	WechatArticleIndex int        `json:"wechatArticleIndex"`
	WechatArticleURL   string     `json:"wechatArticleUrl"`
	ContentFormat      string     `json:"contentFormat"`
	SyncedAt           *time.Time `json:"syncedAt,omitempty"`
	PublishedAt      *time.Time `json:"publishedAt,omitempty"`
	LastError        string     `json:"lastError,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
}

func toWechatMpArticleDTO(row *models.WechatMpArticle) wechatMpArticleDTO {
	if row == nil {
		return wechatMpArticleDTO{}
	}
	return wechatMpArticleDTO{
		ID:               row.ID,
		Title:            row.Title,
		Author:           row.Author,
		Digest:           row.Digest,
		Content:          row.Content,
		ContentSourceURL: row.ContentSourceURL,
		ThumbMediaID:     row.ThumbMediaID,
		ThumbPreviewURL:  row.ThumbPreviewURL,
		Status:           row.Status,
		WechatMediaID:      row.WechatMediaID,
		WechatPublishID:    row.WechatPublishID,
		WechatArticleID:    row.WechatArticleID,
		WechatArticleIndex: row.WechatArticleIndex,
		WechatArticleURL:   row.WechatArticleURL,
		ContentFormat:      row.ContentFormat,
		SyncedAt:           row.SyncedAt,
		PublishedAt:      row.PublishedAt,
		LastError:        row.LastError,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}
}

type cacheTokenStore struct {
	cache *lru.Cache[string, any]
}

func (s cacheTokenStore) Get(_ context.Context, key string) (string, bool) {
	raw, err := s.cache.Get(context.Background(), key)
	if err != nil {
		return "", false
	}
	v, ok := raw.(string)
	return v, ok && v != ""
}

func (s cacheTokenStore) Set(_ context.Context, key, value string, ttl time.Duration) {
	s.cache.Set(context.Background(), key, value, ttl)
}

func (h *Handlers) wechatMPClient() (*wechat.MPClient, error) {
	cfg := h.wechatConfig()
	if !cfg.Enabled {
		return nil, fmt.Errorf("wechat disabled")
	}
	if cfg.AppID == "" || cfg.AppSecret == "" {
		return nil, fmt.Errorf("wechat appId/appSecret missing")
	}
	return &wechat.MPClient{
		AppID:     cfg.AppID,
		AppSecret: cfg.AppSecret,
		Store:     cacheTokenStore{cache: h.cache},
	}, nil
}

func (h *Handlers) handleAdminListWechatMpArticles(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	status := strings.TrimSpace(c.Query("status"))
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	list, total, err := models.ListWechatMpArticlesAdmin(db, status, page, pageSize)
	if err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	out := make([]wechatMpArticleDTO, 0, len(list))
	for i := range list {
		out = append(out, toWechatMpArticleDTO(&list[i]))
	}
	response.SuccessI18n(c, "common.success", gin.H{
		"list":     out,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (h *Handlers) handleAdminCreateWechatMpArticle(c *gin.Context) {
	user := auth.CurrentUser(c)
	var body struct {
		Title            string `json:"title" binding:"required"`
		Author           string `json:"author"`
		Digest           string `json:"digest"`
		Content          string `json:"content"`
		ContentSourceURL string `json:"contentSourceUrl"`
		ThumbMediaID     string `json:"thumbMediaId"`
		ThumbPreviewURL  string `json:"thumbPreviewUrl"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	row := &models.WechatMpArticle{
		Title:            body.Title,
		Author:           body.Author,
		Digest:           body.Digest,
		Content:          body.Content,
		ContentSourceURL: body.ContentSourceURL,
		ThumbMediaID:     strings.TrimSpace(body.ThumbMediaID),
		ThumbPreviewURL:  strings.TrimSpace(body.ThumbPreviewURL),
		Status:           models.WechatMpArticleStatusDraft,
	}
	row.CreateBy = announcementOperator(user)
	if err := models.CreateWechatMpArticle(db, row); err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.created", toWechatMpArticleDTO(row))
}

func (h *Handlers) handleAdminGetWechatMpArticle(c *gin.Context) {
	id, ok := parseWechatMpArticleID(c)
	if !ok {
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	row, err := models.GetWechatMpArticleByID(db, uint(id))
	if err != nil {
		response.FailI18n(c, "wechat_mp_article.not_found", err)
		return
	}
	response.SuccessI18n(c, "common.success", toWechatMpArticleDTO(row))
}

func (h *Handlers) handleAdminUpdateWechatMpArticle(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := parseWechatMpArticleID(c)
	if !ok {
		return
	}
	var body struct {
		Title            *string `json:"title"`
		Author           *string `json:"author"`
		Digest           *string `json:"digest"`
		Content          *string `json:"content"`
		ContentSourceURL *string `json:"contentSourceUrl"`
		ThumbMediaID     *string `json:"thumbMediaId"`
		ThumbPreviewURL  *string `json:"thumbPreviewUrl"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	row, err := models.GetWechatMpArticleByID(db, uint(id))
	if err != nil {
		response.FailI18n(c, "wechat_mp_article.not_found", err)
		return
	}
	if row.Status == models.WechatMpArticleStatusPublishing {
		response.FailI18n(c, "wechat_mp_article.publishing", nil)
		return
	}
	vals := map[string]any{
		"update_by": announcementOperator(user),
		"last_error": "",
	}
	if body.Title != nil {
		t := strings.TrimSpace(*body.Title)
		if t == "" {
			response.FailI18n(c, "common.title_required", nil)
			return
		}
		vals["title"] = t
	}
	if body.Author != nil {
		vals["author"] = strings.TrimSpace(*body.Author)
	}
	if body.Digest != nil {
		vals["digest"] = strings.TrimSpace(*body.Digest)
	}
	if body.Content != nil {
		vals["content"] = strings.TrimSpace(*body.Content)
	}
	if body.ContentSourceURL != nil {
		vals["content_source_url"] = strings.TrimSpace(*body.ContentSourceURL)
	}
	if body.ThumbMediaID != nil {
		vals["thumb_media_id"] = strings.TrimSpace(*body.ThumbMediaID)
	}
	if body.ThumbPreviewURL != nil {
		vals["thumb_preview_url"] = strings.TrimSpace(*body.ThumbPreviewURL)
	}
	// 本地内容变更后，若已同步过微信草稿则回到 draft 状态，需重新同步。
	if row.Status != models.WechatMpArticleStatusDraft {
		vals["status"] = models.WechatMpArticleStatusDraft
	}
	if err := models.UpdateWechatMpArticle(db, uint(id), vals); err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	fresh, _ := models.GetWechatMpArticleByID(db, uint(id))
	response.SuccessI18n(c, "common.updated", toWechatMpArticleDTO(fresh))
}

func (h *Handlers) handleAdminDeleteWechatMpArticle(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := parseWechatMpArticleID(c)
	if !ok {
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	if err := models.DeleteWechatMpArticle(db, uint(id), announcementOperator(user)); err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.deleted", nil)
}

const maxWechatCoverBytes = 2 << 20 // 2MB，与微信图文封面限制一致

func wechatMpCoverExt(filename string) string {
	ext := strings.ToLower(path.Ext(strings.TrimSpace(filename)))
	switch ext {
	case ".jpg", ".jpeg", ".png":
		return ext
	default:
		return ".jpg"
	}
}

func buildWechatMpCoverPrompt(title, digest, userPrompt string) string {
	if p := strings.TrimSpace(userPrompt); p != "" {
		return p
	}
	var b strings.Builder
	b.WriteString("微信公众号图文封面插画，横版 2.35:1，清新教育品牌风格，画面简洁有层次，无文字、无水印、无 logo。")
	if t := strings.TrimSpace(title); t != "" {
		b.WriteString(" 主题：")
		b.WriteString(t)
	}
	if d := strings.TrimSpace(digest); d != "" {
		if len(d) > 80 {
			d = d[:80] + "…"
		}
		b.WriteString("。氛围：")
		b.WriteString(d)
	}
	return b.String()
}

func persistWechatMpThumb(ctx context.Context, client *wechat.MPClient, data []byte, filename string) (mediaID, previewURL string, err error) {
	if len(data) == 0 {
		return "", "", fmt.Errorf("empty image")
	}
	if len(data) > maxWechatCoverBytes {
		return "", "", fmt.Errorf("cover too large")
	}
	mediaID, err = client.UploadPermanentThumb(ctx, filename, bytes.NewReader(data))
	if err != nil {
		return "", "", err
	}
	store := stores.Default()
	key := fmt.Sprintf("wechat-mp/covers/%d%s", time.Now().UnixNano(), wechatMpCoverExt(filename))
	if err := store.Write(key, bytes.NewReader(data)); err != nil {
		logger.Error("wechat mp cover store write failed",
			zap.String("key", key),
			zap.String("kind", stores.DefaultStoreKind),
			zap.Error(err),
		)
		return "", "", err
	}
	return mediaID, strings.TrimSpace(store.PublicURL(key)), nil
}

func (h *Handlers) handleAdminUploadWechatMpThumb(c *gin.Context) {
	client, err := h.wechatMPClient()
	if err != nil {
		response.FailI18n(c, "wechat_mp_article.wechat_unavailable", err)
		return
	}
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	defer file.Close()
	if header.Size > maxWechatCoverBytes {
		response.FailI18n(c, "wechat_mp_article.cover_too_large", nil)
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxWechatCoverBytes+1))
	if err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	if len(data) == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	if len(data) > maxWechatCoverBytes {
		response.FailI18n(c, "wechat_mp_article.cover_too_large", nil)
		return
	}

	mediaID, previewURL, err := persistWechatMpThumb(c.Request.Context(), client, data, header.Filename)
	if err != nil {
		if strings.Contains(err.Error(), "cover too large") {
			response.FailI18n(c, "wechat_mp_article.cover_too_large", nil)
			return
		}
		if mediaID == "" {
			response.FailI18n(c, "wechat_mp_article.upload_failed", gin.H{"reason": wechat.HumanizeAPIError(err)}, wechat.HumanizeAPIError(err))
			return
		}
		response.FailI18n(c, "wechat_mp_article.cover_store_failed", err)
		return
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"mediaId":    mediaID,
		"previewUrl": previewURL,
	})
}

type generateWechatMpThumbReq struct {
	Title  string `json:"title"`
	Digest string `json:"digest"`
	Prompt string `json:"prompt"`
}

func (h *Handlers) handleAdminUploadWechatMpContentImage(c *gin.Context) {
	client, err := h.wechatMPClient()
	if err != nil {
		response.FailI18n(c, "wechat_mp_article.wechat_unavailable", err)
		return
	}
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	defer file.Close()
	url, err := client.UploadArticleImage(c.Request.Context(), header.Filename, file)
	if err != nil {
		response.FailI18n(c, "wechat_mp_article.upload_failed", gin.H{"reason": wechat.HumanizeAPIError(err)}, wechat.HumanizeAPIError(err))
		return
	}
	response.SuccessI18n(c, "common.success", gin.H{"url": url})
}

func (h *Handlers) handleAdminSyncWechatMpArticleDraft(c *gin.Context) {
	id, ok := parseWechatMpArticleID(c)
	if !ok {
		return
	}
	client, err := h.wechatMPClient()
	if err != nil {
		response.FailI18n(c, "wechat_mp_article.wechat_unavailable", err)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	row, err := models.GetWechatMpArticleByID(db, uint(id))
	if err != nil {
		response.FailI18n(c, "wechat_mp_article.not_found", err)
		return
	}
	if strings.TrimSpace(row.ThumbMediaID) == "" {
		response.FailI18n(c, "wechat_mp_article.thumb_required", nil)
		return
	}
	html, err := articleHTMLForWechat(row)
	if err != nil {
		response.FailI18n(c, "wechat_mp_article.content_invalid", err)
		return
	}
	article := wechat.DraftArticle{
		Title:            row.Title,
		Author:           row.Author,
		Digest:           row.Digest,
		Content:          html,
		ContentSourceURL: row.ContentSourceURL,
		ThumbMediaID:     row.ThumbMediaID,
	}
	ctx := c.Request.Context()
	var mediaID string
	if strings.TrimSpace(row.WechatMediaID) == "" {
		mediaID, err = client.AddDraft(ctx, article)
	} else {
		mediaID = row.WechatMediaID
		err = client.UpdateDraft(ctx, mediaID, 0, article)
	}
	if err != nil {
		_ = models.UpdateWechatMpArticle(db, row.ID, map[string]any{
			"status":     models.WechatMpArticleStatusFailed,
			"last_error": err.Error(),
		})
		response.FailI18n(c, "wechat_mp_article.sync_failed", gin.H{"reason": wechat.HumanizeAPIError(err)}, wechat.HumanizeAPIError(err))
		return
	}
	now := time.Now()
	if err := models.UpdateWechatMpArticle(db, row.ID, map[string]any{
		"status":          models.WechatMpArticleStatusSynced,
		"wechat_media_id": mediaID,
		"synced_at":       now,
		"last_error":      "",
	}); err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	fresh, _ := models.GetWechatMpArticleByID(db, row.ID)
	response.SuccessI18n(c, "wechat_mp_article.synced", toWechatMpArticleDTO(fresh))
}

func (h *Handlers) handleAdminPublishWechatMpArticle(c *gin.Context) {
	id, ok := parseWechatMpArticleID(c)
	if !ok {
		return
	}
	client, err := h.wechatMPClient()
	if err != nil {
		response.FailI18n(c, "wechat_mp_article.wechat_unavailable", err)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	row, err := models.GetWechatMpArticleByID(db, uint(id))
	if err != nil {
		response.FailI18n(c, "wechat_mp_article.not_found", err)
		return
	}
	if strings.TrimSpace(row.WechatMediaID) == "" {
		response.FailI18n(c, "wechat_mp_article.sync_required", nil)
		return
	}
	_ = models.UpdateWechatMpArticle(db, row.ID, map[string]any{
		"status": models.WechatMpArticleStatusPublishing,
	})
	publishID, err := client.SubmitPublish(c.Request.Context(), row.WechatMediaID)
	if err != nil {
		_ = models.UpdateWechatMpArticle(db, row.ID, map[string]any{
			"status":     models.WechatMpArticleStatusFailed,
			"last_error": err.Error(),
		})
		response.FailI18n(c, "wechat_mp_article.publish_failed", gin.H{"reason": wechat.HumanizeAPIError(err)}, wechat.HumanizeAPIError(err))
		return
	}
	now := time.Now()
	if err := models.UpdateWechatMpArticle(db, row.ID, map[string]any{
		"status":            models.WechatMpArticleStatusPublished,
		"wechat_publish_id": publishID,
		"published_at":      now,
		"last_error":        "",
	}); err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	fresh, _ := models.GetWechatMpArticleByID(db, row.ID)
	response.SuccessI18n(c, "wechat_mp_article.published", toWechatMpArticleDTO(fresh))
}

func failWechatMpAPI(c *gin.Context, key string, err error) {
	if err == nil {
		response.FailI18n(c, key, nil)
		return
	}
	detail := wechat.HumanizeAPIError(err)
	response.FailI18n(c, key, gin.H{"reason": detail}, detail)
}

func parseWechatMpArticleID(c *gin.Context) (uint, bool) {
	raw := strings.TrimSpace(c.Param("id"))
	id, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || id == 0 {
		response.FailI18n(c, "common.invalid_params", nil)
		return 0, false
	}
	return uint(id), true
}

func articleHTMLForWechat(row *models.WechatMpArticle) (string, error) {
	if row == nil {
		return "", fmt.Errorf("empty article")
	}
	if row.ContentFormat == "html" {
		content := strings.TrimSpace(row.Content)
		if content == "" {
			return "<p></p>", nil
		}
		return content, nil
	}
	return wechat.MarkdownToHTML(row.Content)
}

type remotePublishedArticleDTO struct {
	ArticleID   string `json:"articleId"`
	Index       int    `json:"index"`
	Title       string `json:"title"`
	Author      string `json:"author"`
	Digest      string `json:"digest"`
	ThumbURL    string `json:"thumbUrl"`
	ArticleURL  string `json:"articleUrl"`
	UpdateTime  int64  `json:"updateTime"`
	IsDeleted   bool   `json:"isDeleted"`
	Imported    bool   `json:"imported"`
	LocalID     uint   `json:"localId,omitempty,string"`
}

func (h *Handlers) handleAdminListRemoteWechatPublished(c *gin.Context) {
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	count, _ := strconv.Atoi(c.DefaultQuery("count", "20"))
	if offset < 0 {
		offset = 0
	}
	client, err := h.wechatMPClient()
	if err != nil {
		failWechatMpAPI(c, "wechat_mp_article.wechat_unavailable", err)
		return
	}
	total, batches, err := client.BatchGetPublished(c.Request.Context(), offset, count, false)
	if err != nil {
		failWechatMpAPI(c, "wechat_mp_article.remote_list_failed", err)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	keys := make([]struct {
		ArticleID string
		Index     int
	}, 0)
	for _, batch := range batches {
		for idx := range batch.NewsItems {
			keys = append(keys, struct {
				ArticleID string
				Index     int
			}{ArticleID: batch.ArticleID, Index: idx})
		}
	}
	importedMap := models.ListImportedWechatArticleKeys(db, keys)
	list := make([]remotePublishedArticleDTO, 0)
	for _, batch := range batches {
		for idx, item := range batch.NewsItems {
			key := fmt.Sprintf("%s#%d", batch.ArticleID, idx)
			localID := importedMap[key]
			list = append(list, remotePublishedArticleDTO{
				ArticleID:  batch.ArticleID,
				Index:      idx,
				Title:      item.Title,
				Author:     item.Author,
				Digest:     item.Digest,
				ThumbURL:   item.ThumbURL,
				ArticleURL: item.URL,
				UpdateTime: batch.UpdateTime,
				IsDeleted:  item.IsDeleted,
				Imported:   localID > 0,
				LocalID:    localID,
			})
		}
	}
	response.SuccessI18n(c, "common.success", gin.H{
		"list":       list,
		"total":      total,
		"offset":     offset,
		"count":      count,
		"itemCount":  len(list),
	})
}

func (h *Handlers) handleAdminImportWechatPublished(c *gin.Context) {
	user := auth.CurrentUser(c)
	var body struct {
		Items []struct {
			ArticleID string `json:"articleId" binding:"required"`
			Index     int    `json:"index"`
		} `json:"items" binding:"required,min=1"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	client, err := h.wechatMPClient()
	if err != nil {
		response.FailI18n(c, "wechat_mp_article.wechat_unavailable", err)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	operator := announcementOperator(user)
	created := make([]wechatMpArticleDTO, 0)
	skipped := 0
	failed := make([]string, 0)

	// 按 articleId 分组，减少 getarticle 调用次数。
	grouped := map[string][]int{}
	for _, item := range body.Items {
		articleID := strings.TrimSpace(item.ArticleID)
		if articleID == "" {
			continue
		}
		grouped[articleID] = append(grouped[articleID], item.Index)
	}

	ctx := c.Request.Context()
	for articleID, indexes := range grouped {
		batch, err := client.GetPublishedArticle(ctx, articleID)
		if err != nil {
			failed = append(failed, fmt.Sprintf("%s: %v", articleID, err))
			continue
		}
		indexSet := map[int]struct{}{}
		for _, idx := range indexes {
			indexSet[idx] = struct{}{}
		}
		for idx, item := range batch.NewsItems {
			if len(indexSet) > 0 {
				if _, ok := indexSet[idx]; !ok {
					continue
				}
			}
			if item.IsDeleted {
				skipped++
				continue
			}
			if _, err := models.FindWechatMpArticleByRemoteKey(db, articleID, idx); err == nil {
				skipped++
				continue
			}
			title := strings.TrimSpace(item.Title)
			if title == "" {
				title = "未命名图文"
			}
			var publishedAt *time.Time
			if batch.UpdateTime > 0 {
				t := time.Unix(batch.UpdateTime, 0)
				publishedAt = &t
			}
			row := &models.WechatMpArticle{
				Title:              title,
				Author:             strings.TrimSpace(item.Author),
				Digest:             strings.TrimSpace(item.Digest),
				Content:            item.Content,
				ContentSourceURL:   strings.TrimSpace(item.ContentSourceURL),
				ThumbMediaID:       strings.TrimSpace(item.ThumbMediaID),
				ThumbPreviewURL:    strings.TrimSpace(item.ThumbURL),
				Status:             models.WechatMpArticleStatusPublished,
				WechatArticleID:    articleID,
				WechatArticleIndex: idx,
				WechatArticleURL:   strings.TrimSpace(item.URL),
				ContentFormat:      "html",
				PublishedAt:        publishedAt,
			}
			row.CreateBy = operator
			if err := models.CreateWechatMpArticle(db, row); err != nil {
				failed = append(failed, fmt.Sprintf("%s#%d: %v", articleID, idx, err))
				continue
			}
			created = append(created, toWechatMpArticleDTO(row))
		}
	}

	response.SuccessI18n(c, "wechat_mp_article.imported", gin.H{
		"created": created,
		"skipped": skipped,
		"failed":  failed,
	})
}
