package handlers

import (
	"net/http"
	"reflect"
	"strings"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/danielgtaylor/huma/v2"
)

// ── OpenAPI 文档用 DTO（补充 humax 默认仅有路径的文档）──

// APIEnvelope 统一成功响应。
type APIEnvelope struct {
	Code    int    `json:"code" doc:"业务状态码，200 表示成功" example:"200"`
	Message string `json:"msg" doc:"提示信息" example:"ok"`
	Data    any    `json:"data,omitempty" doc:"业务数据"`
}

// APIErrorEnvelope 统一错误响应。
type APIErrorEnvelope struct {
	Code    int            `json:"code" doc:"业务错误码" example:"1000"`
	Message string         `json:"msg" doc:"错误信息"`
	Error   string         `json:"error,omitempty" doc:"稳定错误标识，如 UNAUTHORIZED"`
	Data    any            `json:"data,omitempty"`
	Details map[string]any `json:"details,omitempty"`
}

// VersionData GET /api/version 的 data（字段顺序即 JSON 顺序）。
type VersionData struct {
	Name      string `json:"name" doc:"应用名称"`
	Version   string `json:"version" doc:"版本号"`
	BuildTime string `json:"buildTime" doc:"构建时间"`
	GitCommit string `json:"gitCommit" doc:"Git 提交"`
}

type HealthData struct {
	Status string `json:"status" example:"up"`
	Time   string `json:"time"`
}

// LoginPasswordRequest 密码登录。
type LoginPasswordRequest struct {
	Username     string `json:"username" doc:"用户名或邮箱" minLength:"2"`
	Password     string `json:"password" doc:"密码" minLength:"1"`
	Remember     bool   `json:"remember,omitempty"`
	CaptchaID    string `json:"captchaId,omitempty"`
	CaptchaType  string `json:"captchaType,omitempty"`
	CaptchaValue string `json:"captchaValue,omitempty"`
	Timezone     string `json:"timezone,omitempty"`
	Source       string `json:"source,omitempty"`
}

// LoginEmailRequest 邮箱验证码登录。
type LoginEmailRequest struct {
	Username     string `json:"username" doc:"用户名或邮箱"`
	Email        string `json:"email,omitempty"`
	Code         string `json:"code" doc:"邮箱验证码"`
	Remember     bool   `json:"remember,omitempty"`
	CaptchaID    string `json:"captchaId,omitempty"`
	CaptchaType  string `json:"captchaType,omitempty"`
	CaptchaValue string `json:"captchaValue,omitempty"`
	Timezone     string `json:"timezone,omitempty"`
}

// RegisterRequest 注册。
type RegisterRequest struct {
	Username     string `json:"username" doc:"用户名"`
	Password     string `json:"password" doc:"密码"`
	Email        string `json:"email,omitempty"`
	Code         string `json:"code,omitempty" doc:"邮箱验证码（邮箱注册时必填）"`
	DisplayName  string `json:"displayName,omitempty"`
	CaptchaID    string `json:"captchaId,omitempty"`
	CaptchaType  string `json:"captchaType,omitempty"`
	CaptchaValue string `json:"captchaValue,omitempty"`
	Timezone     string `json:"timezone,omitempty"`
	Source       string `json:"source,omitempty"`
	InviteCode   string `json:"inviteCode,omitempty" doc:"邀请码（可选）"`
}

// SendEmailCodeRequest 发送邮箱验证码。
type SendEmailCodeRequest struct {
	Email string `json:"email" format:"email"`
}

// CheckInStatusData 签到状态（文档用，字段对齐 models）。
type CheckInStatusData struct {
	CheckedInToday bool `json:"checkedInToday"`
	StreakDays     int  `json:"streakDays"`
	TodayRewardMin int  `json:"todayRewardMinutes"`
	PoolMinutes    int  `json:"poolMinutes"`
}

// AnnouncementMarkReadRequest 标记公告已读（路径参数 id）。
type EmptyObject struct{}

// EnrichOpenAPI 为 humax 已注册的路径补齐：
// - 统一响应信封 Schema
// - POST/PUT/PATCH 默认 JSON body
// - 核心业务接口的精确请求/响应模型
func EnrichOpenAPI(api huma.API) {
	if api == nil || api.OpenAPI() == nil {
		return
	}
	oapi := api.OpenAPI()
	if oapi.Components == nil {
		oapi.Components = &huma.Components{}
	}
	if oapi.Components.Schemas == nil {
		oapi.Components.Schemas = huma.NewMapRegistry("#/components/schemas/", huma.DefaultSchemaNamer)
	}
	reg := oapi.Components.Schemas

	ref := func(v any) *huma.Schema {
		return reg.Schema(reflect.TypeOf(v), true, "")
	}

	envelopeRef := ref(APIEnvelope{})
	errorRef := ref(APIErrorEnvelope{})
	jsonObject := &huma.Schema{Type: huma.TypeObject, AdditionalProperties: true}

	jsonContent := func(schema *huma.Schema) map[string]*huma.MediaType {
		return map[string]*huma.MediaType{
			"application/json": {Schema: schema},
		}
	}

	attachStandardResponses := func(op *huma.Operation, successSchema *huma.Schema) {
		if op == nil {
			return
		}
		if op.Responses == nil {
			op.Responses = map[string]*huma.Response{}
		}
		if successSchema == nil {
			successSchema = envelopeRef
		}
		op.Responses["200"] = &huma.Response{
			Description: "成功（HTTP 200，业务码见 body.code）",
			Content:     jsonContent(successSchema),
		}
		op.Responses["400"] = &huma.Response{Description: "请求参数错误", Content: jsonContent(errorRef)}
		op.Responses["401"] = &huma.Response{Description: "未授权", Content: jsonContent(errorRef)}
		op.Responses["403"] = &huma.Response{Description: "无权限", Content: jsonContent(errorRef)}
		op.Responses["404"] = &huma.Response{Description: "资源不存在", Content: jsonContent(errorRef)}
		op.Responses["429"] = &huma.Response{Description: "限流", Content: jsonContent(errorRef)}
		op.Responses["500"] = &huma.Response{Description: "服务器错误", Content: jsonContent(errorRef)}
	}

	setBody := func(op *huma.Operation, schema *huma.Schema, required bool) {
		if op == nil || schema == nil {
			return
		}
		op.RequestBody = &huma.RequestBody{
			Required: required,
			Content:  jsonContent(schema),
		}
	}

	// 精确路由文档
	type routeDoc struct {
		method   string
		path     string
		summary  string
		req      any
		respData any // wrapped in envelope as data tip; we still use full envelope
	}
	precise := []routeDoc{
		{http.MethodGet, "/health", "健康检查", nil, HealthData{}},
		{http.MethodGet, "/live", "存活探针", nil, nil},
		{http.MethodGet, "/ready", "就绪探针", nil, nil},
		{http.MethodGet, "/api/version", "服务版本", nil, VersionData{}},

		{http.MethodPost, "/api/auth/login/password", "密码登录", LoginPasswordRequest{}, models.User{}},
		{http.MethodPost, "/api/auth/login/email", "邮箱验证码登录", LoginEmailRequest{}, models.User{}},
		{http.MethodPost, "/api/auth/register", "用户名密码注册", RegisterRequest{}, models.User{}},
		{http.MethodPost, "/api/auth/register/email", "邮箱注册", RegisterRequest{}, models.User{}},
		{http.MethodPost, "/api/auth/send/email", "发送邮箱验证码", SendEmailCodeRequest{}, nil},
		{http.MethodGet, "/api/auth/info", "当前用户信息", nil, models.User{}},
		{http.MethodGet, "/api/auth/logout", "退出登录", nil, nil},
		{http.MethodGet, "/api/auth/captcha", "获取图形验证码", nil, nil},
		{http.MethodGet, "/api/auth/salt", "获取密码加密盐", nil, nil},

		{http.MethodGet, "/api/invite/me", "我的邀请码与记录", nil, models.InviteOverview{}},
		{http.MethodPost, "/api/invite/rotate", "更换邀请码", nil, models.InviteOverview{}},
		{http.MethodGet, "/api/admin/invite/records", "后台邀请记录", nil, models.AdminInviteList{}},
		{http.MethodGet, "/api/admin/invite/reward", "邀请奖励设置", nil, models.InviteRewardSetting{}},
		{http.MethodPut, "/api/admin/invite/reward", "保存邀请奖励设置", models.InviteRewardSetting{}, models.InviteRewardSetting{}},
		{http.MethodGet, "/api/teacher/checkin", "教师签到状态", nil, CheckInStatusData{}},
		{http.MethodPost, "/api/teacher/checkin", "教师每日签到", nil, CheckInStatusData{}},

		{http.MethodGet, "/api/announcements/pending-popup", "待弹窗公告列表", nil, nil},
		{http.MethodGet, "/api/announcements", "公告列表", nil, nil},
		{http.MethodPost, "/api/announcements/{id}/read", "标记公告已读", EmptyObject{}, nil},

		{http.MethodPost, "/api/wordbooks/custom", "创建自定义词书", customCreateBody{}, nil},
		{http.MethodPost, "/api/wordbooks/custom/enrich", "自定义词书补全", customEnrichBody{}, nil},

		{http.MethodPost, "/api/teacher/coaching/appointments", "老师创建排课", coachingTeacherApptBody{}, nil},
		{http.MethodPost, "/api/teacher/coaching/quotas", "配置学员课时配额", coachingTeacherQuotaBody{}, nil},
		{http.MethodPost, "/api/teacher/coaching/students", "老师创建学员", coachingTeacherCreateStudentBody{}, nil},
		{http.MethodPost, "/api/teacher/coaching/practice/start", "开始练习计费", coachingPracticeStartBody{}, nil},
	}

	for _, d := range precise {
		pi := oapi.Paths[d.path]
		if pi == nil {
			continue
		}
		op := opOf(pi, d.method)
		if op == nil {
			continue
		}
		if d.summary != "" {
			op.Summary = d.summary
			op.Description = d.summary
		}
		if d.req != nil {
			setBody(op, ref(d.req), true)
		}
		success := envelopeRef
		if d.respData != nil {
			// 仍用统一信封；data 形状在 description 中提示
			op.Description = strings.TrimSpace(op.Description + "；data 为业务对象")
		}
		attachStandardResponses(op, success)
	}

	// 其余路径：补默认 envelope + JSON body
	for path, pi := range oapi.Paths {
		if pi == nil {
			continue
		}
		_ = path
		for _, op := range []*huma.Operation{pi.Get, pi.Post, pi.Put, pi.Patch, pi.Delete} {
			if op == nil {
				continue
			}
			if op.Responses == nil || op.Responses["200"] == nil || op.Responses["200"].Content == nil {
				attachStandardResponses(op, envelopeRef)
			}
			switch op.Method {
			case http.MethodPost, http.MethodPut, http.MethodPatch:
				if op.RequestBody == nil {
					setBody(op, jsonObject, false)
				}
			}
		}
	}

	// SecuritySchemes：Bearer
	if oapi.Components.SecuritySchemes == nil {
		oapi.Components.SecuritySchemes = map[string]*huma.SecurityScheme{}
	}
	oapi.Components.SecuritySchemes["BearerAuth"] = &huma.SecurityScheme{
		Type:         "http",
		Scheme:       "bearer",
		BearerFormat: "JWT/Token",
		Description:  "Authorization: Bearer <token>；也可使用 Cookie Session",
	}

	applyModuleTags(oapi)
}

// applyModuleTags 按业务模块重写 OpenAPI Tags（humax 默认按路径第 3 段打英文标签，分类混乱）。
func applyModuleTags(oapi *huma.OpenAPI) {
	if oapi == nil {
		return
	}

	type tagDef struct {
		Name string
		Desc string
	}
	ordered := []tagDef{
		{"系统", "健康检查与版本"},
		{"认证", "登录注册与账号"},
		{"用户", "用户资料与管理"},
		{"词库", "词书与单词"},
		{"学习", "识记、复习与学习进度"},
		{"词汇测试", "词汇量测试"},
		{"阅读", "阅读练习"},
		{"完形填空", "完形填空"},
		{"语法", "语法课程"},
		{"通知", "站内通知与邮件"},
		{"公告", "系统公告"},
		{"签到", "教师每日签到"},
		{"陪练", "排课、配额与练习计费"},
		{"情景对话", "情景对话练习"},
		{"反馈", "用户反馈"},
		{"语音", "TTS 与语音相关"},
		{"指标", "运行指标"},
		{"安全", "安全与风控"},
		{"管理后台", "后台管理接口"},
		{"其他", "未归类接口"},
	}

	for path, pi := range oapi.Paths {
		if pi == nil {
			continue
		}
		tag := moduleTagForPath(path)
		for _, op := range []*huma.Operation{pi.Get, pi.Post, pi.Put, pi.Patch, pi.Delete} {
			if op == nil {
				continue
			}
			op.Tags = []string{tag}
		}
	}

	oapi.Tags = make([]*huma.Tag, 0, len(ordered))
	used := map[string]bool{}
	for path, pi := range oapi.Paths {
		_ = path
		if pi == nil {
			continue
		}
		for _, op := range []*huma.Operation{pi.Get, pi.Post, pi.Put, pi.Patch, pi.Delete} {
			if op == nil || len(op.Tags) == 0 {
				continue
			}
			used[op.Tags[0]] = true
		}
	}
	for _, t := range ordered {
		if !used[t.Name] {
			continue
		}
		oapi.Tags = append(oapi.Tags, &huma.Tag{Name: t.Name, Description: t.Desc})
	}
}

func moduleTagForPath(path string) string {
	p := strings.Trim(path, "/")
	parts := strings.Split(p, "/")
	if len(parts) == 0 || parts[0] == "" {
		return "系统"
	}

	switch parts[0] {
	case "health", "live", "ready", "docs", "openapi":
		return "系统"
	}

	if parts[0] != "api" {
		return "其他"
	}
	if len(parts) == 1 {
		return "系统"
	}

	rest := strings.Join(parts[1:], "/")
	switch {
	case rest == "version":
		return "系统"
	case strings.HasPrefix(rest, "auth"):
		return "认证"
	case strings.HasPrefix(rest, "users"):
		return "用户"
	case strings.HasPrefix(rest, "wordbooks"), strings.HasPrefix(rest, "words"):
		return "词库"
	case strings.HasPrefix(rest, "learning"), strings.HasPrefix(rest, "study"), strings.HasPrefix(rest, "review"):
		return "学习"
	case strings.HasPrefix(rest, "vocab"):
		return "词汇测试"
	case strings.HasPrefix(rest, "reading"):
		return "阅读"
	case strings.HasPrefix(rest, "cloze"):
		return "完形填空"
	case strings.HasPrefix(rest, "grammar"):
		return "语法"
	case strings.HasPrefix(rest, "notification"),
		strings.HasPrefix(rest, "admin/notification"),
		strings.HasPrefix(rest, "admin/mail"),
		strings.HasPrefix(rest, "admin/inbox"),
		strings.HasPrefix(rest, "admin/me/inbox"):
		return "通知"
	case strings.HasPrefix(rest, "announcements"), strings.HasPrefix(rest, "admin/announcements"):
		return "公告"
	case strings.HasPrefix(rest, "teacher/checkin"):
		return "签到"
	case strings.HasPrefix(rest, "teacher/coaching"),
		strings.HasPrefix(rest, "student/coaching"),
		strings.HasPrefix(rest, "coaching"):
		return "陪练"
	case strings.HasPrefix(rest, "scenario-dialogue"), strings.HasPrefix(rest, "admin/scenarios"):
		return "情景对话"
	case strings.HasPrefix(rest, "feedback"), strings.HasPrefix(rest, "admin/feedbacks"):
		return "反馈"
	case strings.HasPrefix(rest, "admin/tts"), strings.Contains(rest, "/tts"):
		return "语音"
	case strings.HasPrefix(rest, "metrics"):
		return "指标"
	case strings.HasPrefix(rest, "security"):
		return "安全"
	case strings.HasPrefix(rest, "admin"):
		return "管理后台"
	default:
		return "其他"
	}
}

func opOf(pi *huma.PathItem, method string) *huma.Operation {
	switch method {
	case http.MethodGet:
		return pi.Get
	case http.MethodPost:
		return pi.Post
	case http.MethodPut:
		return pi.Put
	case http.MethodPatch:
		return pi.Patch
	case http.MethodDelete:
		return pi.Delete
	default:
		return nil
	}
}
