package models

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"
)

// ReadingKnowledgePoint is one AI-summarized teaching point for a passage.
type ReadingKnowledgePoint struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

// KnowledgeQuestionInput feeds the knowledge prompt (stem + answer key + explanation).
type KnowledgeQuestionInput struct {
	Stem        string
	Answer      string
	Explanation string
}

// KnowledgeChatFunc is the LLM seam used by Ensure*Knowledge (injectable in tests).
type KnowledgeChatFunc func(ctx context.Context, systemPrompt, userPrompt string) (string, error)

var (
	ErrKnowledgeChatRequired = errors.New("knowledge chat required")
	ErrKnowledgeParse        = errors.New("knowledge parse failed")
)

const readingKnowledgeSystemPrompt = `你是英语阅读理解助教。根据给定英文文章与题目，提炼对学习者有用的「知识点」。
要求：
1. 只输出 JSON 数组，不要 markdown 代码块或其它文字。格式：[{"title":"简短标题","body":"2-4句中文讲解，可含必要英文例句"}]
2. 关注：易混词、长难句结构、题干陷阱、篇章主旨/细节推理要点。每条聚焦一个点。
3. 若文章与题目确实没有值得单独总结的点，输出空数组 []。
4. 不要编造文章中不存在的事实；title/body 用中文为主。
5. 最多 8 条。`

// KnowledgeJSONReady reports whether knowledge was already generated (including empty []).
func KnowledgeJSONReady(raw string) bool {
	return strings.TrimSpace(raw) != ""
}

// ParseReadingKnowledgeJSON parses a cached knowledge payload. Empty input → nil, not ready.
func ParseReadingKnowledgeJSON(raw string) ([]ReadingKnowledgePoint, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil, nil
	}
	var points []ReadingKnowledgePoint
	if err := json.Unmarshal([]byte(s), &points); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrKnowledgeParse, err)
	}
	return sanitizeKnowledgePoints(points), nil
}

func sanitizeKnowledgePoints(in []ReadingKnowledgePoint) []ReadingKnowledgePoint {
	out := make([]ReadingKnowledgePoint, 0, len(in))
	for _, p := range in {
		title := strings.TrimSpace(p.Title)
		body := strings.TrimSpace(p.Body)
		if title == "" && body == "" {
			continue
		}
		if title == "" {
			title = "要点"
		}
		out = append(out, ReadingKnowledgePoint{Title: title, Body: body})
	}
	return out
}

func MarshalReadingKnowledgeJSON(points []ReadingKnowledgePoint) (string, error) {
	clean := sanitizeKnowledgePoints(points)
	if clean == nil {
		clean = []ReadingKnowledgePoint{}
	}
	b, err := json.Marshal(clean)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func BuildReadingKnowledgeUserPrompt(title, content string, questions []KnowledgeQuestionInput) string {
	var b strings.Builder
	b.WriteString("标题：")
	b.WriteString(strings.TrimSpace(title))
	b.WriteString("\n\n正文：\n")
	b.WriteString(strings.TrimSpace(content))
	b.WriteString("\n\n题目：\n")
	if len(questions) == 0 {
		b.WriteString("（无）\n")
	} else {
		for i, q := range questions {
			fmt.Fprintf(&b, "%d. 题干：%s\n   答案：%s\n", i+1, strings.TrimSpace(q.Stem), strings.TrimSpace(q.Answer))
			if exp := strings.TrimSpace(q.Explanation); exp != "" {
				fmt.Fprintf(&b, "   解析：%s\n", exp)
			}
		}
	}
	b.WriteString("\n请输出知识点 JSON 数组。")
	return b.String()
}

func extractJSONArray(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return s
	}
	if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```json")
		s = strings.TrimPrefix(s, "```JSON")
		s = strings.TrimPrefix(s, "```")
		s = strings.TrimSpace(s)
		if i := strings.LastIndex(s, "```"); i >= 0 {
			s = strings.TrimSpace(s[:i])
		}
	}
	if strings.HasPrefix(s, "[") {
		return s
	}
	start := strings.Index(s, "[")
	end := strings.LastIndex(s, "]")
	if start >= 0 && end > start {
		return s[start : end+1]
	}
	return s
}

func generateReadingKnowledge(
	ctx context.Context,
	title, content string,
	questions []KnowledgeQuestionInput,
	chat KnowledgeChatFunc,
) ([]ReadingKnowledgePoint, error) {
	if chat == nil {
		return nil, ErrKnowledgeChatRequired
	}
	raw, err := chat(ctx, readingKnowledgeSystemPrompt, BuildReadingKnowledgeUserPrompt(title, content, questions))
	if err != nil {
		return nil, err
	}
	payload := extractJSONArray(raw)
	points, err := ParseReadingKnowledgeJSON(payload)
	if err != nil {
		return nil, err
	}
	if points == nil {
		points = []ReadingKnowledgePoint{}
	}
	return points, nil
}

func ensureKnowledgeJSON(
	ctx context.Context,
	cached string,
	save func(json string) error,
	title, content string,
	questions []KnowledgeQuestionInput,
	chat KnowledgeChatFunc,
) ([]ReadingKnowledgePoint, error) {
	if KnowledgeJSONReady(cached) {
		points, err := ParseReadingKnowledgeJSON(cached)
		if err != nil {
			return nil, err
		}
		if points == nil {
			points = []ReadingKnowledgePoint{}
		}
		return points, nil
	}
	points, err := generateReadingKnowledge(ctx, title, content, questions, chat)
	if err != nil {
		return nil, err
	}
	encoded, err := MarshalReadingKnowledgeJSON(points)
	if err != nil {
		return nil, err
	}
	if err := save(encoded); err != nil {
		return nil, err
	}
	return points, nil
}

// EnsureReadingPassageKnowledge returns cached AI knowledge or generates and stores it.
func EnsureReadingPassageKnowledge(
	ctx context.Context,
	db *gorm.DB,
	passageID uint,
	chat KnowledgeChatFunc,
) ([]ReadingKnowledgePoint, error) {
	if db == nil || passageID == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	var passage ReadingPassage
	if err := db.First(&passage, passageID).Error; err != nil {
		return nil, err
	}
	var qs []ReadingQuestion
	if err := db.Where("passage_id = ?", passage.ID).
		Order("sort_order ASC, id ASC").
		Find(&qs).Error; err != nil {
		return nil, err
	}
	inputs := make([]KnowledgeQuestionInput, 0, len(qs))
	for _, q := range qs {
		inputs = append(inputs, KnowledgeQuestionInput{
			Stem: q.Stem, Answer: q.Answer, Explanation: q.Explanation,
		})
	}
	return ensureKnowledgeJSON(ctx, passage.KnowledgeJSON, func(encoded string) error {
		return db.Model(&ReadingPassage{}).Where("id = ?", passage.ID).
			Update("knowledge_json", encoded).Error
	}, passage.Title, passage.Content, inputs, chat)
}

// EnsureUserReadingPassageKnowledge returns cached AI knowledge or generates and stores it.
func EnsureUserReadingPassageKnowledge(
	ctx context.Context,
	db *gorm.DB,
	passageID, userID uint,
	chat KnowledgeChatFunc,
) ([]ReadingKnowledgePoint, error) {
	if db == nil || passageID == 0 || userID == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	var passage UserReadingPassage
	if err := db.Where("id = ? AND user_id = ?", passageID, userID).First(&passage).Error; err != nil {
		return nil, err
	}
	var qs []UserReadingQuestion
	if err := db.Where("passage_id = ?", passage.ID).
		Order("sort_order ASC, id ASC").
		Find(&qs).Error; err != nil {
		return nil, err
	}
	inputs := make([]KnowledgeQuestionInput, 0, len(qs))
	for _, q := range qs {
		inputs = append(inputs, KnowledgeQuestionInput{
			Stem: q.Stem, Answer: q.Answer, Explanation: q.Explanation,
		})
	}
	return ensureKnowledgeJSON(ctx, passage.KnowledgeJSON, func(encoded string) error {
		return db.Model(&UserReadingPassage{}).Where("id = ?", passage.ID).
			Update("knowledge_json", encoded).Error
	}, passage.Title, passage.Content, inputs, chat)
}

// ClearReadingPassageKnowledge invalidates cached knowledge (e.g. after content/questions change).
func ClearReadingPassageKnowledge(db *gorm.DB, passageID uint) error {
	if db == nil || passageID == 0 {
		return nil
	}
	return db.Model(&ReadingPassage{}).Where("id = ?", passageID).
		Update("knowledge_json", "").Error
}

// ClearUserReadingPassageKnowledge invalidates cached knowledge for a custom passage.
func ClearUserReadingPassageKnowledge(db *gorm.DB, passageID uint) error {
	if db == nil || passageID == 0 {
		return nil
	}
	return db.Model(&UserReadingPassage{}).Where("id = ?", passageID).
		Update("knowledge_json", "").Error
}
