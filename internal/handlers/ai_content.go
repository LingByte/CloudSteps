package handlers

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/CloudStepsGo/pkg/llm"
	"github.com/LingByte/ling-base/apidocs/humax"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) registerAIContentRoutes(r *humax.Group) {
	admin := r.Group("admin/ai")
	admin.Use(auth.Required, auth.AdminRequired)
	{
		admin.POST("/generate-content", h.handleAdminGenerateContent)
	}
}

type generateContentReq struct {
	Kind   string `json:"kind" binding:"required"` // announcement | wechat_mp_article
	Title  string `json:"title"`
	Prompt string `json:"prompt" binding:"required"`
	Digest string `json:"digest"`
}

type generateContentResp struct {
	Title   string `json:"title"`
	Content string `json:"content"`
	Digest  string `json:"digest,omitempty"`
}

func (h *Handlers) handleAdminGenerateContent(c *gin.Context) {
	var req generateContentReq
	if err := c.BindJSON(&req); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}

	kind := strings.TrimSpace(req.Kind)
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		response.Fail(c, "请描述你想生成的内容", nil)
		return
	}

	cfg := llm.FromGlobal()
	if !cfg.Enabled() {
		response.Fail(c, "未配置 LLM（请在服务端设置 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL）", nil)
		return
	}

	systemPrompt, userPrompt := buildContentGenerationPrompts(kind, req.Title, req.Digest, prompt)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()

	raw, err := cfg.Chat(ctx, systemPrompt, userPrompt)
	if err != nil {
		if err == llm.ErrNotConfigured {
			response.Fail(c, "未配置 LLM", nil)
			return
		}
		response.Fail(c, "AI 生成失败，请稍后重试", err)
		return
	}

	out := parseGeneratedContent(raw)
	if strings.TrimSpace(req.Title) != "" && strings.TrimSpace(out.Title) == "" {
		out.Title = strings.TrimSpace(req.Title)
	}
	if strings.TrimSpace(out.Content) == "" {
		out.Content = strings.TrimSpace(raw)
	}

	response.Success(c, out)
}

func buildContentGenerationPrompts(kind, title, digest, userPrompt string) (string, string) {
	var system string
	switch kind {
	case "wechat_mp_article":
		system = `你是微信公众号内容编辑。根据用户要求撰写图文，语气亲切、结构清晰，适合家长与学员阅读。
输出必须是合法 JSON，且只输出 JSON，不要 markdown 代码块：
{"title":"标题，不超过32字","digest":"摘要，不超过120字","content":"正文，Markdown 格式，可用小标题与列表"}
正文避免夸张营销语；信息准确、可执行。`
	default:
		system = `你是教育产品「解忧 CloudSteps」的运营编辑。根据用户要求撰写系统公告，语气专业、简洁、友好。
输出必须是合法 JSON，且只输出 JSON，不要 markdown 代码块：
{"title":"公告标题","content":"正文，Markdown 格式，可用小标题与列表"}
正文说明清楚变更点、影响范围与建议操作。`
	}

	var b strings.Builder
	b.WriteString("用户需求：\n")
	b.WriteString(userPrompt)
	if t := strings.TrimSpace(title); t != "" {
		b.WriteString("\n\n已有标题（可优化）：")
		b.WriteString(t)
	}
	if d := strings.TrimSpace(digest); d != "" {
		b.WriteString("\n\n已有摘要（可优化）：")
		b.WriteString(d)
	}
	return system, b.String()
}

func parseGeneratedContent(raw string) generateContentResp {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var out generateContentResp
	if err := json.Unmarshal([]byte(raw), &out); err == nil {
		return out
	}
	return generateContentResp{Content: raw}
}
