// Package main: CLOTH 完形填空数据集导入工具
//
// 将 CLOTH（CLOze test by TeacHers）数据集导入 CloudSteps 的
// cloze_passages + cloze_blanks 表。
//
// CLOTH 每个 JSON 文件是一篇文章，字段：
//
//	article  string       正文（用 _ 标记空位）
//	options  [][]string   每个空位的 4 个选项
//	answers  []string     每个空位的正确答案字母 (A/B/C/D)
//	source   string       文章来源 ID
//
// CLOTH 已有选项和答案，无需 LLM 生成干扰项。
//
// 用法:
//
//	go run ./cmd/import-cloth --dir /path/to/CLOTH
//	go run ./cmd/import-cloth --dir /path/to/CLOTH --split train --level middle --dry-run
//
// 难度映射: middle→中阶 high→高阶
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/LingByte/CloudStepsGo/internal/app"
	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/CloudStepsGo/internal/models"
	"gorm.io/gorm"
)

// clothArticle CLOTH 文章。
type clothArticle struct {
	Article string     `json:"article"`
	Options [][]string `json:"options"`
	Answers []string   `json:"answers"`
	Source  string     `json:"source"`
}

func main() {
	dir := flag.String("dir", "", "CLOTH 数据目录（含 train/valid/test 子目录）")
	splitFilter := flag.String("split", "all", "只导入指定 split: all / train / valid / test")
	levelFilter := flag.String("level", "all", "只导入指定级别: all / middle / high")
	dryRun := flag.Bool("dry-run", false, "只统计不写入")
	flag.Parse()

	if *dir == "" {
		fmt.Fprintln(os.Stderr, "用法: import-cloth --dir /path/to/CLOTH [--split train] [--level middle] [--dry-run]")
		os.Exit(1)
	}

	if _, err := configs.Load("configs/config.yaml"); err != nil {
		fmt.Fprintf(os.Stderr, "加载配置失败: %v\n", err)
		os.Exit(1)
	}

	db, err := app.Connect(os.Stdout)
	if err != nil {
		fmt.Fprintf(os.Stderr, "数据库连接失败: %v\n", err)
		os.Exit(1)
	}

	articles, err := collectCLOTHArticles(*dir, *splitFilter, *levelFilter)
	if err != nil {
		fmt.Fprintf(os.Stderr, "读取 CLOTH 数据失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("共收集 %d 篇 CLOTH 文章\n", len(articles))
	if *dryRun {
		fmt.Println("dry-run 模式，未写入")
		printCLOTHSample(articles)
		return
	}

	imported, skipped := importCLOTH(db, articles)
	fmt.Printf("完成: 导入 %d 篇，跳过 %d 篇\n", imported, skipped)
}

// collectCLOTHArticles 收集 CLOTH 所有 split 和级别的文章。
func collectCLOTHArticles(root, splitFilter, levelFilter string) ([]clothArticle, error) {
	splits := []string{"train", "valid", "test"}
	if splitFilter != "all" {
		splits = []string{splitFilter}
	}
	levels := []string{"middle", "high"}
	if levelFilter != "all" {
		levels = []string{levelFilter}
	}

	var result []clothArticle
	for _, split := range splits {
		for _, level := range levels {
			dir := filepath.Join(root, split, level)
			files, err := os.ReadDir(dir)
			if err != nil {
				if os.IsNotExist(err) {
					continue
				}
				return nil, err
			}
			for _, f := range files {
				if !strings.HasSuffix(f.Name(), ".json") {
					continue
				}
				path := filepath.Join(dir, f.Name())
				a, err := parseCLOTHFile(path)
				if err != nil {
					fmt.Fprintf(os.Stderr, "跳过 %s: %v\n", path, err)
					continue
				}
				if a.Article == "" || len(a.Options) == 0 || len(a.Answers) == 0 {
					continue
				}
				if a.Source == "" {
					a.Source = strings.TrimSuffix(f.Name(), ".json")
				}
				result = append(result, a)
			}
		}
	}
	return result, nil
}

// parseCLOTHFile 解析 CLOTH JSON 文件。
func parseCLOTHFile(path string) (clothArticle, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return clothArticle{}, err
	}
	var a clothArticle
	if err := json.Unmarshal(data, &a); err != nil {
		return clothArticle{}, err
	}
	return a, nil
}

// importCLOTH 批量导入 CLOTH 数据。
func importCLOTH(db *gorm.DB, articles []clothArticle) (int, int) {
	imported, skipped := 0, 0
	for i, a := range articles {
		level := clothLevel(a.Source)
		title := fmt.Sprintf("CLOTH-%s", a.Source)

		// 去重
		var count int64
		db.Model(&models.ClozePassage{}).Where("title = ?", title).Count(&count)
		if count > 0 {
			skipped++
			continue
		}

		content, blankCount := convertCLOTHArticle(a.Article)
		if blankCount == 0 {
			skipped++
			continue
		}

		// 验证空位数与选项/答案数一致
		if blankCount != len(a.Options) || blankCount != len(a.Answers) {
			fmt.Fprintf(os.Stderr, "跳过 %s: 空位数 %d != 选项数 %d / 答案数 %d\n",
				title, blankCount, len(a.Options), len(a.Answers))
			skipped++
			continue
		}

		passage := models.ClozePassage{
			Title:            title,
			Level:            level,
			Content:          normalizeParagraphs(content),
			Summary:          clothSummary(a.Article),
			Tags:             "CLOTH," + clothLevelTag(a.Source),
			Status:           models.ClozeStatusPublished,
			BlankCount:       blankCount,
			EstimatedMinutes: estimateClozeMinutes(blankCount),
			SortOrder:        i + 200,
		}
		passage.SetCreateInfo("import-cloth")
		if err := db.Create(&passage).Error; err != nil {
			fmt.Fprintf(os.Stderr, "创建 cloze passage %s 失败: %v\n", title, err)
			skipped++
			continue
		}

		ok := true
		for bi := 0; bi < blankCount; bi++ {
			opts := buildCLOTHOptions(a.Options[bi], a.Answers[bi])
			optsJSON, _ := json.Marshal(opts)
			bb := models.ClozeBlank{
				PassageID:   passage.ID,
				BlankNo:     bi + 1,
				Options:     string(optsJSON),
				Answer:      a.Answers[bi],
				Explanation: fmt.Sprintf("正确答案: %s", a.Answers[bi]),
			}
			bb.SetCreateInfo("import-cloth")
			if err := db.Create(&bb).Error; err != nil {
				fmt.Fprintf(os.Stderr, "创建 cloze blank %s#%d 失败: %v\n", title, bi+1, err)
				ok = false
				break
			}
		}
		if ok {
			imported++
		} else {
			skipped++
		}

		if (i+1)%100 == 0 {
			fmt.Printf("进度: %d / %d (导入 %d, 跳过 %d)\n", i+1, len(articles), imported, skipped)
		}
	}
	return imported, skipped
}

// blankRegexCLOTH 匹配 CLOTH 文章中的空位标记（单个下划线 _）。
var blankRegexCLOTH = regexp.MustCompile(`_`)

// convertCLOTHArticle 将 CLOTH 文章中的 _ 替换为 {{n}} 格式。
func convertCLOTHArticle(article string) (string, int) {
	count := 0
	result := blankRegexCLOTH.ReplaceAllStringFunc(article, func(_ string) string {
		count++
		return fmt.Sprintf("{{%d}}", count)
	})
	return result, count
}

// buildCLOTHOptions 构建完形填空选项列表，保持原始选项顺序。
func buildCLOTHOptions(opts []string, answer string) []map[string]string {
	keys := []string{"A", "B", "C", "D", "E", "F"}
	result := make([]map[string]string, 0, len(opts))
	for i, text := range opts {
		if i >= len(keys) {
			break
		}
		result = append(result, map[string]string{
			"key":  keys[i],
			"text": strings.TrimSpace(text),
		})
	}
	return result
}

// clothLevel 根据来源判断难度。
func clothLevel(source string) string {
	if strings.HasPrefix(source, "middle") {
		return "中阶"
	}
	return "高阶"
}

// clothLevelTag 根据来源判断标签。
func clothLevelTag(source string) string {
	if strings.HasPrefix(source, "middle") {
		return "CLOTH初中"
	}
	return "CLOTH高中"
}

// clothSummary 生成摘要。
func clothSummary(article string) string {
	s := strings.TrimSpace(article)
	if len(s) > 80 {
		s = s[:80]
		if idx := strings.LastIndex(s, " "); idx > 40 {
			s = s[:idx]
		}
		s += "..."
	}
	return s
}

// estimateClozeMinutes 估算完成时间。
func estimateClozeMinutes(blanks int) int {
	minutes := blanks * 2
	if minutes < 3 {
		minutes = 3
	}
	if minutes > 30 {
		minutes = 30
	}
	return minutes
}

// normalizeParagraphs 将单换行符转为空行分段。
func normalizeParagraphs(s string) string {
	if s == "" {
		return s
	}
	if strings.Contains(s, "\n\n") {
		return s
	}
	return strings.ReplaceAll(s, "\n", "\n\n")
}

// printCLOTHSample 打印样本。
func printCLOTHSample(articles []clothArticle) {
	for i, a := range articles {
		if i >= 3 {
			break
		}
		fmt.Printf("=== %s (level=%s, blanks=%d) ===\n", a.Source, clothLevel(a.Source), len(a.Answers))
		fmt.Printf("文章前 200 字: %s\n", a.Article[:min(200, len(a.Article))])
		if len(a.Options) > 0 {
			fmt.Printf("第1题选项: %v 答案: %s\n", a.Options[0], a.Answers[0])
		}
		fmt.Println()
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
