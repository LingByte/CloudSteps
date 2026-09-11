// Package main: 批量为主题文章打标签
//
// 用 LLM 分析文章内容，为已有的 ReadingPassage / ClozePassage 批量生成主题标签，
// 追加到现有 Tags 字段（保留来源标签）。
//
// 用法:
//
//	# 为所有缺主题标签的阅读理解文章打标签
//	go run ./cmd/tag-passages --type reading --batch 20
//
//	# 为所有缺主题标签的完形填空打标签
//	go run ./cmd/tag-passages --type cloze --batch 20
//
//	# 只处理某难度
//	go run ./cmd/tag-passages --type reading --level 中阶
//
//	# 预览不写入
//	go run ./cmd/tag-passages --type reading --dry-run
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/LingByte/CloudStepsGo/internal/app"
	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/llm"
	"gorm.io/gorm"
)

// 预设主题标签词表（LLM 从中选择）
const topicList = `故事,人物,科普,科技,自然,环境,动物,植物,历史,文化,教育,健康,体育,音乐,艺术,旅行,美食,生活,社会,经济,新闻,幽默,寓言,校园,家庭,友谊,冒险,励志,环保,安全,节日,天气,交通,购物,职业,邮件,广告,说明文,议论文,记叙文`

// llmTagResponse LLM 标签响应。
type llmTagResponse struct {
	Tags []string `json:"tags"`
}

func main() {
	typ := flag.String("type", "reading", "类型: reading / cloze")
	level := flag.String("level", "", "只处理某难度，空=全部")
	batch := flag.Int("batch", 50, "每批处理条数")
	dryRun := flag.Bool("dry-run", false, "只预览不写入")
	limit := flag.Int("limit", 0, "最多处理条数，0=全部")
	flag.Parse()

	if _, err := configs.Load("configs/config.yaml"); err != nil {
		fmt.Fprintf(os.Stderr, "加载配置失败: %v\n", err)
		os.Exit(1)
	}

	llmCfg := llm.FromGlobal()
	if !llmCfg.Enabled() {
		fmt.Fprintln(os.Stderr, "LLM 未配置，请先在 config.yaml 中配置 LLM_API_KEY 等")
		os.Exit(1)
	}
	fmt.Printf("LLM: %s @ %s\n", llmCfg.Model, llmCfg.BaseURL)

	db, err := app.Connect(os.Stdout)
	if err != nil {
		fmt.Fprintf(os.Stderr, "数据库连接失败: %v\n", err)
		os.Exit(1)
	}

	switch *typ {
	case "reading":
		tagReadingPassages(db, llmCfg, *level, *batch, *limit, *dryRun)
	case "cloze":
		tagClozePassages(db, llmCfg, *level, *batch, *limit, *dryRun)
	default:
		fmt.Fprintf(os.Stderr, "未知类型: %s（支持 reading / cloze）\n", *typ)
		os.Exit(1)
	}
}

// hasTopicTags 判断标签中是否已含主题标签（非来源标签）。
func hasTopicTags(tags string) bool {
	sourcePrefixes := []string{"RACE", "CEPOC", "KET", "PET", "FCE", "CAE", "CPE"}
	for _, t := range strings.Split(tags, ",") {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		isSource := false
		for _, p := range sourcePrefixes {
			if strings.HasPrefix(t, p) {
				isSource = true
				break
			}
		}
		if !isSource {
			return true
		}
	}
	return false
}

// tagReadingPassages 为阅读理解文章批量打主题标签。
func tagReadingPassages(db *gorm.DB, llmCfg llm.Config, level string, batchSize, limit int, dryRun bool) {
	q := db.Model(&models.ReadingPassage{}).Where("status = ?", models.ReadingStatusPublished)
	if level != "" {
		q = q.Where("level = ?", level)
	}
	// 只处理还没有主题标签的
	q = q.Where("tags = '' OR tags IS NULL OR (tags NOT LIKE '%故事%' AND tags NOT LIKE '%科普%' AND tags NOT LIKE '%人物%' AND tags NOT LIKE '%科技%' AND tags NOT LIKE '%自然%' AND tags NOT LIKE '%历史%' AND tags NOT LIKE '%文化%' AND tags NOT LIKE '%教育%' AND tags NOT LIKE '%生活%' AND tags NOT LIKE '%社会%')")

	var total int64
	q.Count(&total)
	fmt.Printf("待打标签阅读理解文章: %d 篇\n", total)
	if total == 0 {
		return
	}

	processed := 0
	tagged := 0
	maxItems := int(total)
	if limit > 0 && limit < maxItems {
		maxItems = limit
	}

	for processed < maxItems {
		var passages []models.ReadingPassage
		q.Order("id ASC").Offset(processed).Limit(batchSize).Find(&passages)
		if len(passages) == 0 {
			break
		}

		for _, p := range passages {
			if processed >= maxItems {
				break
			}
			topics, err := generateTopicTags(llmCfg, p.Content, p.Title)
			if err != nil {
				fmt.Fprintf(os.Stderr, "LLM 失败 id=%d: %v\n", p.ID, err)
				processed++
				continue
			}
			newTags := mergeTags(strings.Split(p.Tags, ","), topics)
			fmt.Printf("[%d/%d] %s → %s\n", processed+1, maxItems, p.Title, newTags)
			if !dryRun {
				if err := db.Model(&models.ReadingPassage{}).Where("id = ?", p.ID).Update("tags", newTags).Error; err != nil {
					fmt.Fprintf(os.Stderr, "更新失败 id=%d: %v\n", p.ID, err)
				} else {
					tagged++
				}
			}
			processed++
		}
		fmt.Printf("进度: %d / %d (已打标签 %d)\n", processed, maxItems, tagged)
	}
	fmt.Printf("完成: 处理 %d 篇，打标签 %d 篇\n", processed, tagged)
}

// tagClozePassages 为完形填空批量打主题标签。
func tagClozePassages(db *gorm.DB, llmCfg llm.Config, level string, batchSize, limit int, dryRun bool) {
	q := db.Model(&models.ClozePassage{}).Where("status = ?", models.ClozeStatusPublished)
	if level != "" {
		q = q.Where("level = ?", level)
	}
	q = q.Where("tags = '' OR tags IS NULL OR (tags NOT LIKE '%故事%' AND tags NOT LIKE '%科普%' AND tags NOT LIKE '%人物%' AND tags NOT LIKE '%科技%' AND tags NOT LIKE '%自然%' AND tags NOT LIKE '%历史%' AND tags NOT LIKE '%文化%' AND tags NOT LIKE '%教育%' AND tags NOT LIKE '%生活%' AND tags NOT LIKE '%社会%')")

	var total int64
	q.Count(&total)
	fmt.Printf("待打标签完形填空: %d 篇\n", total)
	if total == 0 {
		return
	}

	processed := 0
	tagged := 0
	maxItems := int(total)
	if limit > 0 && limit < maxItems {
		maxItems = limit
	}

	for processed < maxItems {
		var passages []models.ClozePassage
		q.Order("id ASC").Offset(processed).Limit(batchSize).Find(&passages)
		if len(passages) == 0 {
			break
		}

		for _, p := range passages {
			if processed >= maxItems {
				break
			}
			// 去掉 {{n}} 标记再送 LLM
			cleanContent := stripClozeMarkers(p.Content)
			topics, err := generateTopicTags(llmCfg, cleanContent, p.Title)
			if err != nil {
				fmt.Fprintf(os.Stderr, "LLM 失败 id=%d: %v\n", p.ID, err)
				processed++
				continue
			}
			newTags := mergeTags(strings.Split(p.Tags, ","), topics)
			fmt.Printf("[%d/%d] %s → %s\n", processed+1, maxItems, p.Title, newTags)
			if !dryRun {
				if err := db.Model(&models.ClozePassage{}).Where("id = ?", p.ID).Update("tags", newTags).Error; err != nil {
					fmt.Fprintf(os.Stderr, "更新失败 id=%d: %v\n", p.ID, err)
				} else {
					tagged++
				}
			}
			processed++
		}
		fmt.Printf("进度: %d / %d (已打标签 %d)\n", processed, maxItems, tagged)
	}
	fmt.Printf("完成: 处理 %d 篇，打标签 %d 篇\n", processed, tagged)
}

// generateTopicTags 用 LLM 生成主题标签。
func generateTopicTags(llmCfg llm.Config, content, title string) ([]string, error) {
	// 截取前 500 字符避免 token 过多
	preview := content
	if len(preview) > 500 {
		preview = preview[:500]
	}

	systemPrompt := fmt.Sprintf(`你是英语文章分类助手。根据文章标题和内容，从以下标签中选择 1-3 个最匹配的主题标签。
标签列表: %s
要求：
1. 只输出 JSON，格式: {"tags":["标签1","标签2"]}
2. 最多 3 个标签，最少 1 个。
3. 标签必须来自上面的标签列表。`, topicList)

	userPrompt := fmt.Sprintf("标题: %s\n\n内容:\n%s", title, preview)

	ctx := context.Background()
	resp, err := llmCfg.Chat(ctx, systemPrompt, userPrompt)
	if err != nil {
		return nil, err
	}
	resp = stripMarkdownFence(strings.TrimSpace(resp))

	var parsed llmTagResponse
	if err := json.Unmarshal([]byte(resp), &parsed); err != nil {
		return nil, fmt.Errorf("解析失败: %w (响应: %s)", err, truncate(resp, 150))
	}

	// 过滤：只保留标签列表中的
	validSet := make(map[string]struct{})
	for _, t := range strings.Split(topicList, ",") {
		validSet[strings.TrimSpace(t)] = struct{}{}
	}
	var result []string
	for _, t := range parsed.Tags {
		t = strings.TrimSpace(t)
		if _, ok := validSet[t]; ok {
			result = append(result, t)
		}
	}
	if len(result) == 0 {
		return nil, fmt.Errorf("无有效标签")
	}
	return result, nil
}

// mergeTags 合并来源标签和主题标签，去重。
func mergeTags(existing, topics []string) string {
	seen := make(map[string]struct{})
	var all []string
	for _, t := range existing {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		if _, ok := seen[t]; !ok {
			seen[t] = struct{}{}
			all = append(all, t)
		}
	}
	for _, t := range topics {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		if _, ok := seen[t]; !ok {
			seen[t] = struct{}{}
			all = append(all, t)
		}
	}
	return strings.Join(all, ",")
}

// stripClozeMarkers 去掉 {{n}} 标记。
func stripClozeMarkers(content string) string {
	return strings.NewReplacer(
		"{{1}}", "___", "{{2}}", "___", "{{3}}", "___",
		"{{4}}", "___", "{{5}}", "___", "{{6}}", "___",
		"{{7}}", "___", "{{8}}", "___", "{{9}}", "___",
		"{{10}}", "___", "{{11}}", "___", "{{12}}", "___",
	).Replace(content)
}

// stripMarkdownFence 去掉 markdown 代码块标记。
func stripMarkdownFence(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```json")
		s = strings.TrimPrefix(s, "```")
		s = strings.TrimSuffix(s, "```")
	}
	return strings.TrimSpace(s)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
