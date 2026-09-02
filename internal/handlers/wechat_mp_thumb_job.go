package handlers

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/LingByte/CloudStepsGo/pkg/imagegen"
	"github.com/LingByte/CloudStepsGo/pkg/wechat"
	"github.com/LingByte/ling-base/common/logger"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

const (
	wechatMpThumbIdle    = "idle"
	wechatMpThumbQueued  = "queued"
	wechatMpThumbRunning = "running"
	wechatMpThumbDone    = "done"
	wechatMpThumbFailed  = "failed"
)

type wechatMpThumbJob struct {
	mu            sync.Mutex
	Status        string `json:"status"`
	Error         string `json:"error,omitempty"`
	MediaID       string `json:"mediaId,omitempty"`
	PreviewURL    string `json:"previewUrl,omitempty"`
	RevisedPrompt string `json:"revisedPrompt,omitempty"`
	StartedAt     time.Time
	FinishedAt    time.Time
	title         string
	digest        string
	prompt        string
}

var wechatMpThumbJobState wechatMpThumbJob

func isWechatMpThumbActive(status string) bool {
	return status == wechatMpThumbQueued || status == wechatMpThumbRunning
}

func (j *wechatMpThumbJob) snapshot() gin.H {
	j.mu.Lock()
	defer j.mu.Unlock()
	out := gin.H{"status": j.Status}
	if j.Error != "" {
		out["error"] = j.Error
	}
	if j.MediaID != "" {
		out["mediaId"] = j.MediaID
	}
	if j.PreviewURL != "" {
		out["previewUrl"] = j.PreviewURL
	}
	if j.RevisedPrompt != "" {
		out["revisedPrompt"] = j.RevisedPrompt
	}
	if !j.StartedAt.IsZero() {
		out["startedAt"] = j.StartedAt.UTC().Format(time.RFC3339)
	}
	if !j.FinishedAt.IsZero() {
		out["finishedAt"] = j.FinishedAt.UTC().Format(time.RFC3339)
	}
	return out
}

func (j *wechatMpThumbJob) tryStart(title, digest, prompt string) bool {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.Status == wechatMpThumbQueued || j.Status == wechatMpThumbRunning {
		return false
	}
	j.Status = wechatMpThumbQueued
	j.title = title
	j.digest = digest
	j.prompt = prompt
	j.Error = ""
	j.MediaID = ""
	j.PreviewURL = ""
	j.RevisedPrompt = ""
	j.StartedAt = time.Now()
	j.FinishedAt = time.Time{}
	return true
}

func (j *wechatMpThumbJob) beginRun() bool {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.Status != wechatMpThumbQueued {
		return false
	}
	j.Status = wechatMpThumbRunning
	return true
}

func (j *wechatMpThumbJob) finishDone(mediaID, previewURL, revised string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = wechatMpThumbDone
	j.MediaID = mediaID
	j.PreviewURL = previewURL
	j.RevisedPrompt = revised
	j.FinishedAt = time.Now()
}

func (j *wechatMpThumbJob) finishFailed(msg string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = wechatMpThumbFailed
	j.Error = msg
	j.FinishedAt = time.Now()
}

func (j *wechatMpThumbJob) params() (title, digest, prompt string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.title, j.digest, j.prompt
}

func (h *Handlers) handleAdminStartWechatMpThumbGenerate(c *gin.Context) {
	var req generateWechatMpThumbReq
	if err := c.BindJSON(&req); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}

	cfg := imagegen.FromGlobal()
	if strings.TrimSpace(cfg.APIKey) == "" {
		response.Fail(c, "未配置文生图（IMAGE_GEN_API_KEY / IMAGE_GEN_BASE_URL / IMAGE_GEN_MODEL）", nil)
		return
	}

	if _, err := h.wechatMPClient(); err != nil {
		response.FailI18n(c, "wechat_mp_article.wechat_unavailable", err)
		return
	}

	job := &wechatMpThumbJobState
	snap := job.snapshot()
	status, _ := snap["status"].(string)
	if isWechatMpThumbActive(status) {
		response.SuccessI18n(c, "common.success", job.snapshot())
		return
	}

	title := strings.TrimSpace(req.Title)
	digest := strings.TrimSpace(req.Digest)
	prompt := strings.TrimSpace(req.Prompt)
	if !job.tryStart(title, digest, prompt) {
		response.SuccessI18n(c, "common.success", job.snapshot())
		return
	}

	go h.runWechatMpThumbJob()

	response.SuccessI18n(c, "common.success", gin.H{
		"status":  wechatMpThumbQueued,
		"started": true,
	})
}

func (h *Handlers) handleAdminWechatMpThumbGenerateStatus(c *gin.Context) {
	response.SuccessI18n(c, "common.success", wechatMpThumbJobState.snapshot())
}

func (h *Handlers) runWechatMpThumbJob() {
	job := &wechatMpThumbJobState
	if !job.beginRun() {
		return
	}

	defer func() {
		if r := recover(); r != nil {
			logger.Error("wechat mp thumb job panic", zap.Any("recover", r))
			job.finishFailed("封面生成失败，请稍后重试")
		}
	}()

	title, digest, userPrompt := job.params()
	cfg := imagegen.FromGlobal()
	if strings.TrimSpace(cfg.APIKey) == "" {
		job.finishFailed("未配置文生图")
		return
	}

	client, err := h.wechatMPClient()
	if err != nil {
		job.finishFailed("微信公众号未配置或不可用")
		return
	}

	prompt := buildWechatMpCoverPrompt(title, digest, userPrompt)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	genRes, err := imagegen.Generate(ctx, cfg, imagegen.GenerateRequest{
		Prompt: prompt,
		Size:   "1280x720",
	})
	if err != nil {
		job.finishFailed("文生图失败：" + err.Error())
		return
	}

	ext := genRes.Ext
	if ext == "" {
		ext = ".png"
	}
	filename := fmt.Sprintf("cover-ai%s", ext)
	mediaID, previewURL, err := persistWechatMpThumb(ctx, client, genRes.Data, filename)
	if err != nil {
		if mediaID == "" {
			job.finishFailed("上传微信素材失败：" + wechat.HumanizeAPIError(err))
			return
		}
		job.finishFailed("封面存储失败：" + err.Error())
		return
	}

	job.finishDone(mediaID, previewURL, genRes.RevisedPrompt)
	logger.Info("wechat mp thumb generated",
		zap.String("mediaId", mediaID),
		zap.Int("bytes", len(genRes.Data)),
	)
}
