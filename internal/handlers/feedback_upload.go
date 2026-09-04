package handlers

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/CloudStepsGo/pkg/stores"
	"github.com/LingByte/CloudStepsGo/pkg/utils"
	"github.com/LingByte/ling-base/common/logger"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// handleUploadFeedbackImage 上传反馈配图，返回可嵌入 Markdown 的公开 URL。
func (h *Handlers) handleUploadFeedbackImage(c *gin.Context) {
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		// 兼容 avatar 风格字段名
		file, header, err = c.Request.FormFile("image")
	}
	if err != nil {
		response.FailI18n(c, "storage.select_image", err)
		return
	}
	defer file.Close()

	if header.Size > utils.FeedbackImageMaxUploadBytes {
		response.FailI18n(c, "feedback.image_too_large", nil, utils.FeedbackImageMaxUploadBytes>>20)
		return
	}

	processed, err := utils.ProcessFeedbackImage(file, header.Size)
	if err != nil {
		response.FailI18n(c, "feedback.image_invalid", err)
		return
	}

	key := fmt.Sprintf("feedback/%d/%d%s", user.ID, time.Now().UnixNano(), processed.Ext)
	store := stores.Default()
	if err := store.Write(key, bytes.NewReader(processed.Data)); err != nil {
		logger.Error("feedback image store write failed",
			zap.String("key", key),
			zap.Error(err),
		)
		response.FailI18n(c, "feedback.image_upload_failed", err)
		return
	}

	url := store.PublicURL(key)
	if strings.TrimSpace(url) == "" {
		response.FailI18n(c, "feedback.image_upload_failed", nil)
		return
	}

	response.SuccessI18n(c, "common.ok", gin.H{
		"url":    url,
		"width":  processed.Width,
		"height": processed.Height,
		"bytes":  len(processed.Data),
	})
}
