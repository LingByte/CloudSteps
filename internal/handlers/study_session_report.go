package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/llm"
	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	lbconstants "github.com/LingByte/ling-base/common/constants"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type studySessionReportDTO struct {
	SessionID            string   `json:"sessionId"`
	WordBookID           uint     `json:"wordBookId"`
	WordBookName         string   `json:"wordBookName"`
	StudentName          string   `json:"studentName"`
	Status               string   `json:"status"`
	StartedAt            string   `json:"startedAt"`
	CompletedAt          string   `json:"completedAt,omitempty"`
	DurationMinutes      int      `json:"durationMinutes"`
	ScreenedKnownCount   int      `json:"screenedKnownCount"`
	ScreenedUnknownCount int      `json:"screenedUnknownCount"`
	WordCount            int      `json:"wordCount"`
	CorrectCount         int      `json:"correctCount"`
	ForgotCount          int      `json:"forgotCount"`
	AccuracyPercent      float64  `json:"accuracyPercent"`
	RemainPending        int64    `json:"remainPending"`
	WordBookWordCount    int64    `json:"wordBookWordCount"`
	LearnedCount         int64    `json:"learnedCount"`
	LessonCount          int64    `json:"lessonCount"`
	RemainingMinutes     int      `json:"remainingMinutes"`
	ForgotWords          []string `json:"forgotWords,omitempty"`
	StudiedWords         []string `json:"studiedWords,omitempty"`
	ReportSummary        string   `json:"reportSummary,omitempty"`
	AIAvailable          bool     `json:"aiAvailable"`
}

func (h *Handlers) loadStudySessionForReport(c *gin.Context) (*gorm.DB, *models.User, *models.StudySession, bool) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.authorization_required", nil)
		return nil, nil, nil, false
	}
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id64 == 0 {
		response.FailI18n(c, "coaching.session_not_found", nil)
		return nil, nil, nil, false
	}
	var session models.StudySession
	if err := db.Where("id = ?", uint(id64)).First(&session).Error; err != nil {
		response.FailI18n(c, "coaching.session_not_found", err)
		return nil, nil, nil, false
	}
	if session.UserID != user.ID {
		tid := coachingCoachingTeacherID(c)
		if tid == 0 || coachingTeacherHasStudentPair(db, tid, session.UserID) != nil {
			response.FailI18n(c, "coaching.no_session_access", nil)
			return nil, nil, nil, false
		}
	}
	return db, user, &session, true
}

func buildStudySessionReport(db *gorm.DB, session *models.StudySession) studySessionReportDTO {
	wbName := ""
	var wordBookWordCount int64
	var wb models.WordBook
	if err := db.Select("id", "name", "word_count").Where("id = ?", session.WordBookID).First(&wb).Error; err == nil {
		wbName = wb.Name
		wordBookWordCount = int64(wb.WordCount)
	}

	studentName := ""
	nameUserID := session.UserID
	if session.StudentID > 0 {
		nameUserID = session.StudentID
	}
	var u models.User
	if err := db.Select("id", "display_name", "username", "email").Where("id = ?", nameUserID).First(&u).Error; err == nil {
		studentName = strings.TrimSpace(u.DisplayName)
		if studentName == "" {
			studentName = strings.TrimSpace(u.Username)
		}
		if studentName == "" {
			studentName = strings.TrimSpace(u.Email)
		}
	}

	end := time.Now().UTC()
	completedAt := ""
	if session.CompletedAt != nil {
		end = session.CompletedAt.UTC()
		completedAt = session.CompletedAt.UTC().Format(time.RFC3339)
	}
	durMin := int(end.Sub(session.StartedAt.UTC()).Minutes() + 0.5)
	if durMin < 0 {
		durMin = 0
	}

	forgot := session.WordCount - session.CorrectCount
	if forgot < 0 {
		forgot = 0
	}
	acc := 0.0
	if session.WordCount > 0 {
		acc = float64(session.CorrectCount) * 100 / float64(session.WordCount)
	}

	var remain int64
	if wordBookWordCount == 0 {
		if n, err := models.GetWordCountByBookID(db, session.WordBookID); err == nil {
			wordBookWordCount = n
		} else {
			_ = db.Model(&models.WordLite{}).Where("word_book_id = ?", session.WordBookID).Count(&wordBookWordCount).Error
		}
	}

	// 已学进度：与灯塔一致，只计 learned/mastered（不含 learning 中）
	var learnedCount int64
	_ = db.Model(&models.UserWordState{}).
		Where("user_id = ? AND word_book_id = ? AND learn_status IN ?",
			session.UserID, session.WordBookID, []string{"learned", "mastered"}).
		Count(&learnedCount).Error

	// 剩余待学 = 词库总量 − 已学/已掌握（未入状态表的词也算待学）
	remain = wordBookWordCount - learnedCount
	if remain < 0 {
		remain = 0
	}

	ownerID := session.UserID
	var lessonCount int64
	_ = db.Model(&models.StudySession{}).
		Where("user_id = ? AND session_type = ? AND status = ?", ownerID, "learn", "completed").
		Count(&lessonCount).Error

	remainingMinutes := 0
	studentID := session.StudentID
	teacherID := session.UserID
	if studentID > 0 && teacherID > 0 && studentID != teacherID {
		if q, err := coachingGetQuota(db, teacherID, studentID); err == nil {
			remainingMinutes = q.RemainingMinutes
		}
	}

	studiedWords := loadSessionWordLabels(db, session, sessionWordFilterAll, 40)
	forgotWords := loadSessionWordLabels(db, session, sessionWordFilterForgot, 20)

	return studySessionReportDTO{
		SessionID:            fmt.Sprintf("%d", session.ID),
		WordBookID:           session.WordBookID,
		WordBookName:         wbName,
		StudentName:          studentName,
		Status:               session.Status,
		StartedAt:            session.StartedAt.UTC().Format(time.RFC3339),
		CompletedAt:          completedAt,
		DurationMinutes:      durMin,
		ScreenedKnownCount:   session.ScreenedKnownCount,
		ScreenedUnknownCount: session.ScreenedUnknownCount,
		WordCount:            session.WordCount,
		CorrectCount:         session.CorrectCount,
		ForgotCount:          forgot,
		AccuracyPercent:      acc,
		RemainPending:        remain,
		WordBookWordCount:    wordBookWordCount,
		LearnedCount:         learnedCount,
		LessonCount:          lessonCount,
		RemainingMinutes:     remainingMinutes,
		ForgotWords:          forgotWords,
		StudiedWords:         studiedWords,
		ReportSummary:        strings.TrimSpace(session.ReportSummary),
		AIAvailable:          llm.FromGlobal().Enabled(),
	}
}

type sessionWordFilter int

const (
	sessionWordFilterAll sessionWordFilter = iota
	sessionWordFilterForgot
	sessionWordFilterRemembered
)

func loadSessionForgotWordLabels(db *gorm.DB, session *models.StudySession) []string {
	return loadSessionWordLabels(db, session, sessionWordFilterForgot, 12)
}

func loadSessionWordLabels(db *gorm.DB, session *models.StudySession, filter sessionWordFilter, limit int) []string {
	q := db.Where("session_id = ?", session.ID)
	switch filter {
	case sessionWordFilterForgot:
		q = q.Where("remembered = ?", false)
	case sessionWordFilterRemembered:
		q = q.Where("remembered = ?", true)
	}
	var sessionWords []models.SessionWord
	_ = q.Order("id ASC").Find(&sessionWords).Error
	if len(sessionWords) == 0 {
		return nil
	}
	ids := make([]uint, 0, len(sessionWords))
	for _, sw := range sessionWords {
		ids = append(ids, sw.WordID)
	}
	var words []models.WordLite
	_ = db.Where("id IN ?", ids).Find(&words).Error
	models.OverlayWordLites(db, session.UserID, words)
	byID := make(map[uint]models.WordLite, len(words))
	for _, w := range words {
		byID[w.ID] = w
	}
	if limit <= 0 {
		limit = 40
	}
	out := make([]string, 0, len(sessionWords))
	for _, sw := range sessionWords {
		w, ok := byID[sw.WordID]
		if !ok || strings.TrimSpace(w.Word) == "" {
			continue
		}
		gloss := strings.TrimSpace(w.TranslationShort)
		if gloss == "" {
			gloss = models.FormatTranslationShort(w.Translation)
		}
		if gloss != "" {
			pos := abbreviatePartOfSpeech(w.PartOfSpeech)
			if pos != "" && !strings.HasPrefix(strings.ToLower(gloss), strings.ToLower(pos)) {
				out = append(out, fmt.Sprintf("%s  %s %s", w.Word, pos, gloss))
			} else {
				out = append(out, fmt.Sprintf("%s  %s", w.Word, gloss))
			}
		} else {
			out = append(out, w.Word)
		}
		if len(out) >= limit {
			break
		}
	}
	return out
}

func studySessionReportPrompts(report studySessionReportDTO) (systemPrompt, userPrompt string) {
	systemPrompt = "你是英语陪练老师的课堂助教，根据本节课数据写一段简短「教练点评」。" +
		"硬性要求：中文；严格 2-3 句；总长不超过 100 字；语气克制，像老师随手记的教学笔记；" +
		"禁止使用 emoji；禁止 Markdown；禁止复述用时、正确率、筛词数、识记数、剩余待学等界面已有量化数据；" +
		"只写表现判断与下一步建议；不要编造未提供的信息。"
	forgotLine := "无"
	if len(report.ForgotWords) > 0 {
		forgotLine = strings.Join(report.ForgotWords, "、")
	}
	studiedLine := "无"
	if len(report.StudiedWords) > 0 {
		studiedLine = strings.Join(report.StudiedWords, "、")
	}
	screenTotal := report.ScreenedKnownCount + report.ScreenedUnknownCount
	name := fallbackDash(report.StudentName)
	userPrompt = fmt.Sprintf(
		"学员：%s\n词库：%s\n用时：约 %d 分钟\n筛词：合计 %d（认识 %d / 新学 %d）\n本课识记：%d\n训后记住：%d / 未记住：%d\n正确率：%.0f%%\n词书剩余待学：%d\n本节学习词：%s\n需巩固词：%s\n请只输出教练点评正文。",
		name,
		fallbackDash(report.WordBookName),
		report.DurationMinutes,
		screenTotal,
		report.ScreenedKnownCount,
		report.ScreenedUnknownCount,
		report.WordCount,
		report.CorrectCount,
		report.ForgotCount,
		report.AccuracyPercent,
		report.RemainPending,
		studiedLine,
		forgotLine,
	)
	return systemPrompt, userPrompt
}

func fallbackDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "—"
	}
	return s
}

func abbreviatePartOfSpeech(raw string) string {
	p := strings.TrimSpace(strings.ToLower(raw))
	p = strings.TrimSuffix(p, ".")
	if p == "" {
		return ""
	}
	switch p {
	case "noun", "n":
		return "n."
	case "verb", "v":
		return "v."
	case "adjective", "adj", "a":
		return "adj."
	case "adverb", "adv":
		return "adv."
	case "pronoun", "pron":
		return "pron."
	case "preposition", "prep":
		return "prep."
	case "conjunction", "conj":
		return "conj."
	case "interjection", "int", "interj":
		return "int."
	default:
		if len(p) <= 6 {
			return p + "."
		}
		return ""
	}
}

func isCurrentSessionReportFormat(text string) bool {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return false
	}
	if strings.Contains(trimmed, "📚") || strings.Contains(trimmed, "🎯") || strings.Contains(trimmed, "家长您好") {
		return false
	}
	// Reject old long metric-dump paragraphs
	runes := []rune(trimmed)
	if len(runes) > 140 {
		return false
	}
	if strings.Contains(trimmed, "正确率达") ||
		strings.Contains(trimmed, "全程用时") ||
		strings.Contains(trimmed, "系统记录") ||
		strings.Contains(trimmed, "未触发熟词") ||
		(strings.Contains(trimmed, "正确率") && strings.Contains(trimmed, "剩余")) {
		return false
	}
	return true
}

// handleStudySessionReport GET /study/session/:id/report
func (h *Handlers) handleStudySessionReport(c *gin.Context) {
	db, _, session, ok := h.loadStudySessionForReport(c)
	if !ok {
		return
	}
	report := buildStudySessionReport(db, session)
	if report.ReportSummary != "" && !isCurrentSessionReportFormat(report.ReportSummary) {
		report.ReportSummary = ""
	}
	response.SuccessI18n(c, "common.success", report)
}

// handleStudySessionReportStream GET /study/session/:id/report/stream
// SSE: data JSON lines {"type":"delta"|"done"|"error"|"cached","text":"..."}
func (h *Handlers) handleStudySessionReportStream(c *gin.Context) {
	db, _, session, ok := h.loadStudySessionForReport(c)
	if !ok {
		return
	}
	report := buildStudySessionReport(db, session)

	flusher, canFlush := c.Writer.(http.Flusher)
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)
	if canFlush {
		flusher.Flush()
	}

	writeSSE := func(payload map[string]string) {
		b, _ := json.Marshal(payload)
		_, _ = fmt.Fprintf(c.Writer, "data: %s\n\n", b)
		if canFlush {
			flusher.Flush()
		}
	}

	if cached := strings.TrimSpace(report.ReportSummary); cached != "" && isCurrentSessionReportFormat(cached) {
		writeSSE(map[string]string{"type": "cached", "text": cached})
		writeSSE(map[string]string{"type": "done", "text": cached})
		return
	}

	cfg := llm.FromGlobal()
	if !cfg.Enabled() {
		writeSSE(map[string]string{"type": "error", "text": "llm_not_configured"})
		return
	}

	systemPrompt, userPrompt := studySessionReportPrompts(report)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()

	full, err := cfg.ChatStream(ctx, systemPrompt, userPrompt, func(delta string) {
		if delta == "" {
			return
		}
		writeSSE(map[string]string{"type": "delta", "text": delta})
	})
	if err != nil {
		msg := "ai_generate_failed"
		if err == llm.ErrNotConfigured {
			msg = "llm_not_configured"
		}
		writeSSE(map[string]string{"type": "error", "text": msg})
		return
	}

	_ = db.Model(session).Update("report_summary", full).Error
	writeSSE(map[string]string{"type": "done", "text": full})
}
