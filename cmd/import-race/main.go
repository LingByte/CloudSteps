// Package main: RACE 数据集导入工具
//
// 将 RACE 阅读理解数据集（http://www.cs.cmu.edu/~glai1/data/race/）导入
// CloudSteps 的 reading_passages + reading_questions 表。
//
// RACE 每个文件是一篇 passage 的 JSON，字段：
//
//	article  string     正文
//	questions []string   题干（可能含 _ 占位符）
//	options   [][]string 每题 4 选项
//	answers   []string  每题答案 "A"/"B"/"C"/"D"
//	id        string    如 "middle1011.txt"
//
// 用法:
//
//	# 下载并解压 RACE.tar.gz 后
//	go run ./cmd/import-race --dir /path/to/RACE
//	go run ./cmd/import-race --dir /path/to/RACE --limit 100 --dry-run
//	go run ./cmd/import-race --dir /path/to/RACE --level middle
//
// 难度映射: middle → 中阶, high → 高阶
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/LingByte/CloudStepsGo/internal/app"
	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/CloudStepsGo/internal/models"
	"gorm.io/gorm"
)

// racePassage 对应 RACE 单个 JSON 文件结构。
type racePassage struct {
	ID       string   `json:"id"`
	Article  string   `json:"article"`
	Answers  []string `json:"answers"`
	Options  [][]string `json:"options"`
	Questions []string `json:"questions"`
}

func main() {
	dir := flag.String("dir", "", "RACE 解压目录（含 train/dev/test 子目录）")
	limit := flag.Int("limit", 0, "最多导入篇数，0=全部")
	levelFilter := flag.String("level", "all", "只导入指定难度: all / middle / high")
	dryRun := flag.Bool("dry-run", false, "只统计不写入")
	splitSet := flag.String("split", "all", "只导入指定 split: all / train / dev / test")
	flag.Parse()

	if *dir == "" {
		fmt.Fprintln(os.Stderr, "用法: import-race --dir /path/to/RACE [--limit N] [--level middle|high|all] [--split train|dev|test|all] [--dry-run]")
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

	passages, err := collectRACEPassages(*dir, *levelFilter, *splitSet, *limit)
	if err != nil {
		fmt.Fprintf(os.Stderr, "读取 RACE 数据失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("共收集 %d 篇 RACE 文章\n", len(passages))
	if *dryRun {
		fmt.Println("dry-run 模式，未写入")
		printSample(passages)
		return
	}

	imported, skipped := importRACE(db, passages)
	fmt.Printf("完成: 导入 %d 篇，跳过 %d 篇（已存在）\n", imported, skipped)
}

// collectRACEPassages 遍历 RACE 目录收集所有 passage。
func collectRACEPassages(root, levelFilter, splitFilter string, limit int) ([]racePassage, error) {
	splits := []string{"train", "dev", "test"}
	if splitFilter != "all" {
		splits = []string{splitFilter}
	}
	levels := []string{"middle", "high"}
	if levelFilter != "all" {
		levels = []string{levelFilter}
	}

	var result []racePassage
	for _, split := range splits {
		for _, level := range levels {
			subDir := filepath.Join(root, split, level)
			entries, err := os.ReadDir(subDir)
			if err != nil {
				if os.IsNotExist(err) {
					continue
				}
				return nil, fmt.Errorf("read dir %s: %w", subDir, err)
			}
			for _, entry := range entries {
				if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".txt") {
					continue
				}
				path := filepath.Join(subDir, entry.Name())
				p, err := parseRACEFile(path)
				if err != nil {
					fmt.Fprintf(os.Stderr, "跳过 %s: %v\n", path, err)
					continue
				}
				result = append(result, p)
				if limit > 0 && len(result) >= limit {
					return result, nil
				}
			}
		}
	}
	return result, nil
}

// parseRACEFile 解析单个 RACE JSON 文件。
func parseRACEFile(path string) (racePassage, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return racePassage{}, err
	}
	var p racePassage
	if err := json.Unmarshal(data, &p); err != nil {
		return racePassage{}, fmt.Errorf("unmarshal %s: %w", path, err)
	}
	if p.Article == "" || len(p.Questions) == 0 {
		return racePassage{}, fmt.Errorf("空文章或无题目: %s", path)
	}
	if len(p.Questions) != len(p.Answers) || len(p.Questions) != len(p.Options) {
		return racePassage{}, fmt.Errorf("题目/答案/选项数量不匹配: %s", p.ID)
	}
	return p, nil
}

// importRACE 批量导入 RACE 数据到数据库，按标题去重。
func importRACE(db *gorm.DB, passages []racePassage) (int, int) {
	imported, skipped := 0, 0
	for i, p := range passages {
		level := raceLevelToOurs(p.ID)
		title := raceTitle(p)

		var count int64
		db.Model(&models.ReadingPassage{}).Where("title = ?", title).Count(&count)
		if count > 0 {
			skipped++
			continue
		}

		passage := models.ReadingPassage{
			Title:            title,
			Level:            level,
			Content:          normalizeParagraphs(strings.TrimSpace(p.Article)),
			Summary:          raceSummary(p.Article),
			Tags:             raceSourceTag(p.ID),
			Status:           models.ReadingStatusPublished,
			WordCount:        countWords(p.Article),
			EstimatedMinutes: estimateMinutes(p.Article),
			SortOrder:        i + 1000,
		}
		passage.SetCreateInfo("import-race")
		if err := db.Create(&passage).Error; err != nil {
			fmt.Fprintf(os.Stderr, "创建 passage %s 失败: %v\n", title, err)
			skipped++
			continue
		}

		ok := true
		for j, q := range p.Questions {
			opts := raceOptionsToOurs(p.Options[j])
			optsJSON, _ := json.Marshal(opts)
			qq := models.ReadingQuestion{
				PassageID:   passage.ID,
				Stem:        cleanRACEStem(q),
				Options:     string(optsJSON),
				Answer:      p.Answers[j],
				Explanation: "", // RACE 不提供解析
				SortOrder:   j + 1,
			}
			qq.SetCreateInfo("import-race")
			if err := db.Create(&qq).Error; err != nil {
				fmt.Fprintf(os.Stderr, "创建 question %s#%d 失败: %v\n", title, j+1, err)
				ok = false
				break
			}
		}
		if ok {
			imported++
		} else {
			skipped++
		}

		if (i+1)%500 == 0 {
			fmt.Printf("进度: %d / %d\n", i+1, len(passages))
		}
	}
	return imported, skipped
}

// raceSourceTag 根据 RACE id 生成来源标签。
func raceSourceTag(raceID string) string {
	if strings.HasPrefix(raceID, "middle") {
		return "RACE初中"
	}
	return "RACE高中"
}

// raceLevelToOurs 将 RACE 难度映射到我们的分级。
func raceLevelToOurs(raceID string) string {
	if strings.HasPrefix(raceID, "middle") {
		return "中阶"
	}
	return "高阶"
}

// raceTitle 从 RACE id 生成标题。
func raceTitle(p racePassage) string {
	id := strings.TrimSuffix(p.ID, ".txt")
	return "RACE-" + id
}

// raceSummary 从文章前 80 个字符生成摘要。
// normalizeParagraphs 将单换行符转为空行分段，使前端能正确识别段落。
func normalizeParagraphs(s string) string {
	if s == "" {
		return s
	}
	// 已有空行分段的保持不变
	if strings.Contains(s, "\n\n") {
		return s
	}
	// 单换行符 → 双换行符
	return strings.ReplaceAll(s, "\n", "\n\n")
}

func raceSummary(article string) string {
	s := strings.TrimSpace(article)
	if len(s) > 80 {
		// 截到最近的空格
		s = s[:80]
		if idx := strings.LastIndex(s, " "); idx > 40 {
			s = s[:idx]
		}
		s += "..."
	}
	return s
}

// raceOptionsToOurs 将 RACE 选项列表转为我们的格式。
func raceOptionsToOurs(opts []string) []map[string]string {
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

// cleanRACEStem 清理 RACE 题干：去掉开头多余的点号，规范化空格。
func cleanRACEStem(stem string) string {
	s := strings.TrimSpace(stem)
	// RACE 有些题干以 "." 开头
	s = strings.TrimLeft(s, ".")
	s = strings.TrimSpace(s)
	// 将 " _ " 替换为 "______"
	s = strings.ReplaceAll(s, "  _  ", " ______ ")
	s = strings.ReplaceAll(s, " _ ", " ______ ")
	return s
}

// countWords 统计英文词数。
func countWords(s string) int {
	n := 0
	inWord := false
	for _, r := range s {
		if unicode.IsLetter(r) {
			if !inWord {
				n++
				inWord = true
			}
		} else {
			inWord = false
		}
	}
	return n
}

// estimateMinutes 根据词数估算阅读时间。
func estimateMinutes(article string) int {
	wc := countWords(article)
	minutes := wc / 100 // 约每分钟 100 词
	if minutes < 3 {
		minutes = 3
	}
	if minutes > 15 {
		minutes = 15
	}
	return minutes
}

// printSample 打印前 3 条样本。
func printSample(passages []racePassage) {
	for i, p := range passages {
		if i >= 3 {
			break
		}
		fmt.Printf("\n=== 样本 %d: %s ===\n", i+1, p.ID)
		fmt.Printf("文章前 200 字: %s\n", truncate(p.Article, 200))
		fmt.Printf("题目数: %d\n", len(p.Questions))
		if len(p.Questions) > 0 {
			fmt.Printf("第 1 题: %s\n", cleanRACEStem(p.Questions[0]))
			fmt.Printf("选项: %v\n", p.Options[0])
			fmt.Printf("答案: %s\n", p.Answers[0])
		}
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
