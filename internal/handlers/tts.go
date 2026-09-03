package handlers

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/CloudStepsGo/pkg/stores"
	"github.com/LingByte/CloudStepsGo/pkg/synthesizer"
	"github.com/LingByte/ling-base/apidocs/humax"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
)

type ttsRequest struct {
	Text  string `json:"text"`
	Voice string `json:"voice"` // 腾讯云 VoiceType 数字字符串，如 "1005"
	Lang  string `json:"lang"`  // 仅作缓存区分，可选
}

const ttsMaxRunes = 500

// ttsObjectKey is a content-addressable object-store key for a TTS clip.
func ttsObjectKey(text string, voiceType int64, language string) string {
	sum := sha1.Sum([]byte(fmt.Sprintf("%s|%d|%s", text, voiceType, language)))
	hash := hex.EncodeToString(sum[:8])
	return fmt.Sprintf("tts/%s.wav", hash)
}

// ttsCachedPublicURL returns the public URL when key already exists in store.
func ttsCachedPublicURL(store stores.Store, key string) (url string, hit bool, err error) {
	ok, err := store.Exists(key)
	if err != nil {
		return "", false, err
	}
	if !ok {
		return "", false, nil
	}
	return store.PublicURL(key), true, nil
}

// synthesizeTextToURL 合成语音并写入对象存储，返回公开 URL。
// voice 参数已忽略，始终使用默认音色 DefaultQCloudVoiceType。
// 相同 text/voice/lang 会复用已有对象，不重复调用 TTS。
func synthesizeTextToURL(ctx context.Context, text, voice, lang string) (string, error) {
	_ = voice
	text = strings.TrimSpace(text)
	if text == "" {
		return "", fmt.Errorf("文本为空")
	}
	if len([]rune(text)) > ttsMaxRunes {
		return "", fmt.Errorf("文本过长（最多 %d 字）", ttsMaxRunes)
	}

	cfg, err := synthesizer.NewQCloudConfig(synthesizer.QCloudOverrides{
		Lang: strings.TrimSpace(lang),
	})
	if err != nil {
		return "", err
	}

	store := stores.Default()
	key := ttsObjectKey(text, cfg.VoiceType, cfg.Language)
	if url, hit, err := ttsCachedPublicURL(store, key); err != nil {
		return "", err
	} else if hit {
		return url, nil
	}

	svc, err := synthesizer.NewWithConfig(cfg)
	if err != nil {
		return "", err
	}
	defer func() { _ = svc.Close() }()

	pcm, err := svc.Synthesize(ctx, text)
	if err != nil {
		return "", err
	}
	sampleRate := int(cfg.SampleRate)
	if sampleRate <= 0 {
		sampleRate = synthesizer.DefaultSampleRate
	}
	wav, err := synthesizer.EncodeWAV(pcm, sampleRate)
	if err != nil {
		return "", err
	}

	if err := store.Write(key, bytes.NewReader(wav)); err != nil {
		return "", err
	}
	return store.PublicURL(key), nil
}

func (h *Handlers) registerTTSRoutes(r *humax.Group) {
	r.POST("/tts", auth.Required, h.handleUserTTS)

	admin := r.Group("/admin")
	admin.Use(auth.Required, auth.AdminRequired)
	{
		admin.POST("/tts", h.handleAdminTTS)
	}
}

func (h *Handlers) handleTTS(c *gin.Context) {
	var req ttsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.FailI18n(c, "common.invalid_params", err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()

	url, err := synthesizeTextToURL(ctx, req.Text, req.Voice, req.Lang)
	if err != nil {
		response.FailI18n(c, "tts.failed", err.Error())
		return
	}

	response.SuccessI18n(c, "common.ok", gin.H{"url": url})
}

// handleUserTTS POST /api/tts  body: { text, voice?, lang? }  → { url }
func (h *Handlers) handleUserTTS(c *gin.Context) {
	h.handleTTS(c)
}

// handleAdminTTS POST /api/admin/tts  body: { text, voice?, lang? }  → { url }
func (h *Handlers) handleAdminTTS(c *gin.Context) {
	h.handleTTS(c)
}
