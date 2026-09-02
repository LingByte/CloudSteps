// Package wordimport extracts vocabulary entries from scanned PDF pages (image-heavy
// wordbooks) using vision-capable LLMs, then normalizes into models.ParsedWord.
package wordimport

import (
	"context"
	"fmt"
	"strings"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/llm"
)

const pageVisionSystemPrompt = `你是词书 OCR 助手。用户会提供一页「单词卡片」扫描图（每页约 4–6 个词）。
请识别页面上每个单词卡片，忽略页眉页脚、页码、品牌水印。

只输出 JSON 数组，不要 markdown 代码块，格式：
[
  {
    "word": "英文单词或短语",
    "phonetic": "音标，可空",
    "translation": "中文释义，可含词性",
    "definition": "英文释义，可空",
    "example": "英文例句，可空",
    "exampleZh": "例句中文，可空"
  }
]

要求：word 必填；按页面从上到下顺序；不要编造页面上没有的词。`

// PageImage is one rendered PDF page.
type PageImage struct {
	Page int
	Data []byte
	MIME string
}

// Options controls PDF word extraction.
type Options struct {
	LLM        llm.Config
	MaxPages   int  // 0 = all
	StartPage  int  // 1-based inclusive
	OnProgress func(done, total int, page int)
}

// ExtractFromPages runs vision OCR on each page image and merges/dedupes words.
func ExtractFromPages(ctx context.Context, pages []PageImage, opt Options) ([]models.ParsedWord, error) {
	if len(pages) == 0 {
		return nil, fmt.Errorf("no page images")
	}
	if strings.TrimSpace(opt.LLM.APIKey) == "" {
		return nil, fmt.Errorf("LLM not configured")
	}

	start := opt.StartPage
	if start < 1 {
		start = 1
	}
	filtered := make([]PageImage, 0, len(pages))
	for _, p := range pages {
		if p.Page < start {
			continue
		}
		if opt.MaxPages > 0 && len(filtered) >= opt.MaxPages {
			break
		}
		filtered = append(filtered, p)
	}
	if len(filtered) == 0 {
		return nil, fmt.Errorf("no pages in range")
	}

	all := make([]models.ParsedWord, 0, len(filtered)*5)
	for i, page := range filtered {
		if opt.OnProgress != nil {
			opt.OnProgress(i, len(filtered), page.Page)
		}
		words, err := ExtractWordsFromPage(ctx, page, opt.LLM)
		if err != nil {
			return nil, fmt.Errorf("page %d: %w", page.Page, err)
		}
		all = append(all, words...)
	}
	if opt.OnProgress != nil {
		opt.OnProgress(len(filtered), len(filtered), 0)
	}
	return models.MergeDedup(all), nil
}

// ExtractWordsFromPage uses a vision model to parse one page image.
func ExtractWordsFromPage(ctx context.Context, page PageImage, cfg llm.Config) ([]models.ParsedWord, error) {
	mime := page.MIME
	if mime == "" {
		mime = "image/jpeg"
	}
	userPrompt := fmt.Sprintf("请提取本页所有单词卡片（PDF 第 %d 页）。", page.Page)
	raw, err := cfg.ChatVision(ctx, pageVisionSystemPrompt, userPrompt, page.Data, mime)
	if err != nil {
		return nil, err
	}
	arr, err := llm.ParseJSONArray(raw)
	if err != nil {
		return nil, fmt.Errorf("parse model JSON: %w", err)
	}
	items := models.ParseJSONWordList(arr)
	for i := range items {
		items[i] = enrichTranslation(items[i], arr[i])
	}
	return items, nil
}

func enrichTranslation(pw models.ParsedWord, raw map[string]any) models.ParsedWord {
	if strings.TrimSpace(pw.Translation) != "" {
		return pw
	}
	def, _ := raw["definition"].(string)
	ex, _ := raw["example"].(string)
	exZh, _ := raw["exampleZh"].(string)
	var parts []string
	if d := strings.TrimSpace(def); d != "" {
		parts = append(parts, d)
	}
	if e := strings.TrimSpace(ex); e != "" {
		parts = append(parts, e)
	}
	if z := strings.TrimSpace(exZh); z != "" {
		parts = append(parts, z)
	}
	if len(parts) > 0 {
		pw.Translation = strings.Join(parts, " · ")
		if pw.TranslationShort == "" {
			pw.TranslationShort = truncateRunes(pw.Translation, 32)
		}
	}
	return pw
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
