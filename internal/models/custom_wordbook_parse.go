package models

import (
	"bytes"
	"encoding/csv"
	"regexp"
	"strings"
	"unicode"

	"github.com/xuri/excelize/v2"
)

const MaxWords = 2000

// ParsedWord 解析预览词条（尚未落库）
// phonetic / translation 始终输出，便于前端直接展示（未命中时为空串）
type ParsedWord struct {
	Word             string `json:"word"`
	Phonetic         string `json:"phonetic"`
	Translation      string `json:"translation"`
	TranslationShort string `json:"translationShort,omitempty"`
	AudioURL         string `json:"audioUrl,omitempty"`
}

var (
	wordTokenRe = regexp.MustCompile(`(?i)^[a-z][a-z0-9'’\-./]*$`)
	headerHints = map[string]bool{
		"word": true, "单词": true, "english": true, "lemma": true,
		"vocabulary": true, "vocab": true, "词": true, "英文": true,
	}
)

// NormalizeWord 清洗单词：去首尾空白、去掉包裹标点
func NormalizeWord(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.Trim(s, "\"'`“”‘’[]()（）")
	s = strings.TrimSpace(s)
	return s
}

func isLikelyWord(s string) bool {
	if s == "" || len(s) > 64 {
		return false
	}
	// 允许短语：多个英文词用空格分隔
	parts := strings.Fields(s)
	if len(parts) == 0 || len(parts) > 6 {
		return false
	}
	for _, p := range parts {
		if !wordTokenRe.MatchString(p) {
			return false
		}
	}
	// 拒绝纯数字
	allDigit := true
	for _, r := range s {
		if !unicode.IsDigit(r) && r != ' ' && r != '-' {
			allDigit = false
			break
		}
	}
	return !allDigit
}

func looksLikeHeader(cell string) bool {
	return headerHints[strings.ToLower(strings.TrimSpace(cell))]
}

// MergeDedup 合并去重（大小写不敏感），保持首次出现顺序，截断到 MaxWords
func MergeDedup(items []ParsedWord) []ParsedWord {
	seen := make(map[string]struct{}, len(items))
	out := make([]ParsedWord, 0, len(items))
	for _, it := range items {
		w := NormalizeWord(it.Word)
		if !isLikelyWord(w) {
			continue
		}
		key := strings.ToLower(w)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		it.Word = w
		it.Phonetic = strings.TrimSpace(it.Phonetic)
		it.Translation = strings.TrimSpace(it.Translation)
		it.TranslationShort = strings.TrimSpace(it.TranslationShort)
		if it.TranslationShort == "" && it.Translation != "" {
			it.TranslationShort = truncateRunes(it.Translation, 32)
		}
		out = append(out, it)
		if len(out) >= MaxWords {
			break
		}
	}
	return out
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

// ParseManualText 每行一个单词；也支持 word\t释义 或 word 释义
func ParseManualText(text string) []ParsedWord {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	items := make([]ParsedWord, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		word, trans, phonetic := splitWordLine(line)
		items = append(items, ParsedWord{Word: word, Translation: trans, Phonetic: phonetic, TranslationShort: trans})
	}
	return MergeDedup(items)
}

func splitWordLine(line string) (word, translation, phonetic string) {
	if strings.Contains(line, "\t") {
		parts := strings.Split(line, "\t")
		word = parts[0]
		if len(parts) > 1 {
			translation = parts[1]
		}
		if len(parts) > 2 {
			phonetic = parts[2]
		}
		return
	}
	// "apple 苹果" / "apple - 苹果"
	fields := strings.Fields(line)
	if len(fields) == 1 {
		return fields[0], "", ""
	}
	// 找第一个含中文的分段作为释义起点
	for i, f := range fields {
		if containsHan(f) {
			return strings.Join(fields[:i], " "), strings.Join(fields[i:], " "), ""
		}
	}
	return fields[0], "", ""
}

func containsHan(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

// ParseCSVBytes 解析 CSV：首列单词，可选第2列释义、第3列音标
func ParseCSVBytes(data []byte) ([]ParsedWord, error) {
	r := csv.NewReader(bytes.NewReader(data))
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	rows, err := r.ReadAll()
	if err != nil {
		return nil, err
	}
	return rowsToWords(rows), nil
}

// ParseExcelBytes 解析 xlsx：取第一个工作表
func ParseExcelBytes(data []byte) ([]ParsedWord, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, nil
	}
	rows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, err
	}
	return rowsToWords(rows), nil
}

func rowsToWords(rows [][]string) []ParsedWord {
	items := make([]ParsedWord, 0, len(rows))
	for i, row := range rows {
		if len(row) == 0 {
			continue
		}
		cell0 := strings.TrimSpace(row[0])
		if cell0 == "" {
			continue
		}
		if i == 0 && looksLikeHeader(cell0) {
			continue
		}
		item := ParsedWord{Word: cell0}
		if len(row) > 1 {
			item.Translation = strings.TrimSpace(row[1])
			item.TranslationShort = item.Translation
		}
		if len(row) > 2 {
			item.Phonetic = strings.TrimSpace(row[2])
		}
		items = append(items, item)
	}
	return MergeDedup(items)
}

// ParseJSONWordList 从 LLM/OCR JSON 数组解析
func ParseJSONWordList(raw []map[string]any) []ParsedWord {
	items := make([]ParsedWord, 0, len(raw))
	for _, m := range raw {
		w, _ := m["word"].(string)
		if w == "" {
			if v, ok := m["Word"].(string); ok {
				w = v
			}
		}
		ph, _ := m["phonetic"].(string)
		if ph == "" {
			ph, _ = m["phoneticUs"].(string)
		}
		tr, _ := m["translation"].(string)
		if tr == "" {
			tr, _ = m["meaning"].(string)
		}
		if tr == "" {
			tr, _ = m["translationShort"].(string)
		}
		ts, _ := m["translationShort"].(string)
		items = append(items, ParsedWord{
			Word:             w,
			Phonetic:         ph,
			Translation:      tr,
			TranslationShort: ts,
		})
	}
	return MergeDedup(items)
}
