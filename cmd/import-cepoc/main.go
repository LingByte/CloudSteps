// Package main: CEPOC 完形填空数据集导入工具
//
// 将 CEPOC（Cambridge Exams Publishing Open Cloze）数据集导入 CloudSteps 的
// cloze_passages + cloze_blanks 表。
//
// CEPOC 每个 JSON 行是一套 open cloze 测试，字段：
//
//	id    int       测试编号
//	title string    标题
//	text  string    正文（用 _ 标记空位）
//	gaps  []gap     空位列表 [{item, answers}]
//
// CEPOC 是 open cloze（无选项），需用 LLM 为每个空位生成 3 个干扰选项。
// 若 LLM 未配置，则导入为 draft 状态（选项仅含正确答案），后续可在后台补充。
//
// 用法:
//
//	# 克隆 CEPOC 仓库后
//	go run ./cmd/import-cepoc --dir /path/to/cepoc
//	go run ./cmd/import-cepoc --dir /path/to/cepoc --exam FCE --dry-run
//	go run ./cmd/import-cepoc --dir /path/to/cepoc --no-llm
//
// 难度映射: KET→初阶 PET→初阶 FCE→中阶 CAE→高阶 CPE→高阶
package main

import (
	"bufio"
	"context"
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
	"github.com/LingByte/CloudStepsGo/pkg/llm"
	"gorm.io/gorm"
)

// cepocGap CEPOC 空位。
type cepocGap struct {
	Item    int      `json:"item"`
	Answers []string `json:"answers"`
}

// cepocTest CEPOC 单套测试。
type cepocTest struct {
	ID    int        `json:"id"`
	Title string     `json:"title"`
	Text  string     `json:"text"`
	Gaps  []cepocGap `json:"gaps"`
	Exam  string     `json:"-"` // 由文件名注入，非 JSON 字段
}

// llmDistractorResponse LLM 生成的干扰项响应。
type llmDistractorResponse struct {
	Blanks []struct {
		Item        int      `json:"item"`
		Distractors []string `json:"distractors"`
	} `json:"blanks"`
}

func main() {
	dir := flag.String("dir", "", "CEPOC 仓库目录（含 KET.json/PET.json/FCE.json/CAE.json/CPE.json）")
	examFilter := flag.String("exam", "all", "只导入指定考试: all / KET / PET / FCE / CAE / CPE")
	dryRun := flag.Bool("dry-run", false, "只统计不写入")
	noLLM := flag.Bool("no-llm", false, "不使用 LLM 生成干扰项（导入为 draft）")
	flag.Parse()

	if *dir == "" {
		fmt.Fprintln(os.Stderr, "用法: import-cepoc --dir /path/to/cepoc [--exam FCE] [--dry-run] [--no-llm]")
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

	llmCfg := llm.FromGlobal()
	useLLM := !*noLLM && llmCfg.Enabled()
	if useLLM {
		fmt.Printf("LLM 已配置 (%s)，将生成干扰选项\n", llmCfg.Model)
	} else {
		fmt.Println("LLM 未配置或 --no-llm，导入为 draft 状态（仅含正确答案）")
	}

	tests, err := collectCEPOCTests(*dir, *examFilter)
	if err != nil {
		fmt.Fprintf(os.Stderr, "读取 CEPOC 数据失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("共收集 %d 套 CEPOC 测试\n", len(tests))
	if *dryRun {
		fmt.Println("dry-run 模式，未写入")
		printCEPOCSample(tests)
		return
	}

	imported, skipped := importCEPOC(db, tests, useLLM, llmCfg)
	fmt.Printf("完成: 导入 %d 套，跳过 %d 套\n", imported, skipped)
}

// collectCEPOCTests 收集 CEPOC 所有考试的测试。
func collectCEPOCTests(root, examFilter string) ([]cepocTest, error) {
	exams := []string{"KET", "PET", "FCE", "CAE", "CPE"}
	if examFilter != "all" {
		exams = []string{strings.ToUpper(examFilter)}
	}

	var result []cepocTest
	for _, exam := range exams {
		path := filepath.Join(root, exam+".json")
		tests, err := parseCEPOCFile(path, exam)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		result = append(result, tests...)
	}
	return result, nil
}

// parseCEPOCFile 解析 CEPOC JSON 文件（每行一个 JSON 对象）。
func parseCEPOCFile(path, exam string) ([]cepocTest, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var result []cepocTest
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)
	lineNo := 0
	for scanner.Scan() {
		lineNo++
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var t cepocTest
		if err := json.Unmarshal([]byte(line), &t); err != nil {
			fmt.Fprintf(os.Stderr, "跳过 %s 第 %d 行: %v\n", exam, lineNo, err)
			continue
		}
		if t.Text == "" || len(t.Gaps) == 0 {
			continue
		}
		t.Exam = exam
		result = append(result, t)
	}
	return result, scanner.Err()
}

// importCEPOC 批量导入 CEPOC 数据。
func importCEPOC(db *gorm.DB, tests []cepocTest, useLLM bool, llmCfg llm.Config) (int, int) {
	imported, skipped := 0, 0
	for i, t := range tests {
		exam := detectExam(t)
		title := fmt.Sprintf("CEPOC-%s-%d: %s", exam, t.ID, t.Title)

		var count int64
		db.Model(&models.ClozePassage{}).Where("title = ?", title).Count(&count)
		if count > 0 {
			skipped++
			continue
		}

		content, blankCount := convertCEPOCTtext(t.Text)
		if blankCount == 0 {
			skipped++
			continue
		}

		// 生成干扰选项
		var distractors map[int][]string
		if useLLM {
			d, err := generateDistractors(llmCfg, t)
			if err != nil {
				fmt.Fprintf(os.Stderr, "LLM 生成干扰项失败 %s: %v，仅用正确答案\n", title, err)
			} else {
				distractors = d
			}
		}

		status := models.ClozeStatusPublished
		if !useLLM || distractors == nil {
			status = models.ClozeStatusDraft
		}

		passage := models.ClozePassage{
			Title:            title,
			Level:            examToLevel(exam),
			Content:          content,
			Summary:          fmt.Sprintf("CEPOC %s - %s", exam, t.Title),
			Tags:             "CEPOC," + exam,
			Status:           status,
			BlankCount:       blankCount,
			EstimatedMinutes: estimateClozeMinutes(blankCount),
			SortOrder:        i + 100,
		}
		passage.SetCreateInfo("import-cepoc")
		if err := db.Create(&passage).Error; err != nil {
			fmt.Fprintf(os.Stderr, "创建 cloze passage %s 失败: %v\n", title, err)
			skipped++
			continue
		}

		ok := true
		for _, gap := range t.Gaps {
			answer := gap.Answers[0]
			opts := buildClozeOptions(answer, distractors[gap.Item])

			optsJSON, _ := json.Marshal(opts)
			bb := models.ClozeBlank{
				PassageID:   passage.ID,
				BlankNo:     gap.Item,
				Options:     string(optsJSON),
				Answer:      "A", // 正确答案始终为 A
				Explanation: fmt.Sprintf("正确答案: %s", strings.Join(gap.Answers, " / ")),
			}
			bb.SetCreateInfo("import-cepoc")
			if err := db.Create(&bb).Error; err != nil {
				fmt.Fprintf(os.Stderr, "创建 cloze blank %s#%d 失败: %v\n", title, gap.Item, err)
				ok = false
				break
			}
		}
		if ok {
			imported++
		} else {
			skipped++
		}

		if (i+1)%20 == 0 {
			fmt.Printf("进度: %d / %d\n", i+1, len(tests))
		}
	}
	return imported, skipped
}

// blankRegex 匹配 CEPOC 文本中的空位标记（单个下划线，前后有空格）。
var blankRegex = regexp.MustCompile(`\s_\s`)

// convertCEPOCTtext 将 CEPOC 文本中的 _ 替换为 {{n}} 格式。
func convertCEPOCTtext(text string) (string, int) {
	count := 0
	result := blankRegex.ReplaceAllStringFunc(text, func(_ string) string {
		count++
		return fmt.Sprintf(" {{%d}} ", count)
	})
	return result, count
}

// buildClozeOptions 构建完形填空选项列表，正确答案固定为 A。
func buildClozeOptions(answer string, distractors []string) []map[string]string {
	keys := []string{"A", "B", "C", "D"}
	opts := []map[string]string{
		{"key": "A", "text": answer},
	}
	for i, d := range distractors {
		if i >= 3 {
			break
		}
		if d == "" || d == answer {
			continue
		}
		opts = append(opts, map[string]string{
			"key":  keys[i+1],
			"text": d,
		})
	}
	// 不足 4 选项时补充占位（确保至少 4 选项）
	for len(opts) < 4 {
		opts = append(opts, map[string]string{
			"key":  keys[len(opts)],
			"text": "—",
		})
	}
	return opts
}

// generateDistractors 使用 LLM 为所有空位生成干扰选项。
func generateDistractors(llmCfg llm.Config, t cepocTest) (map[int][]string, error) {
	systemPrompt := `你是英语完形填空出题助手。给定一篇 open cloze 文章和每个空位的正确答案，为每个空位生成 3 个干扰选项。
要求：
1. 干扰项必须是英语单词，与正确答案词性相同、长度相近。
2. 干扰项必须语法上能填入空位但语义不正确。
3. 干扰项不能与正确答案相同。
4. 只输出 JSON，格式：{"blanks":[{"item":1,"distractors":["word1","word2","word3"]}]}`

	var gapDesc []string
	for _, g := range t.Gaps {
		gapDesc = append(gapDesc, fmt.Sprintf("空位 %d: 正确答案 \"%s\"", g.Item, g.Answers[0]))
	}
	userPrompt := fmt.Sprintf("文章:\n%s\n\n空位:\n%s", t.Text, strings.Join(gapDesc, "\n"))

	ctx := context.Background()
	resp, err := llmCfg.Chat(ctx, systemPrompt, userPrompt)
	if err != nil {
		return nil, err
	}

	resp = strings.TrimSpace(resp)
	resp = stripMarkdownFence(resp)

	var parsed llmDistractorResponse
	if err := json.Unmarshal([]byte(resp), &parsed); err != nil {
		return nil, fmt.Errorf("解析 LLM 响应失败: %w (响应: %s)", err, truncate(resp, 200))
	}

	result := make(map[int][]string)
	for _, b := range parsed.Blanks {
		result[b.Item] = b.Distractors
	}
	return result, nil
}

// stripMarkdownFence 去掉 LLM 响应中可能的 markdown 代码块标记。
func stripMarkdownFence(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```json")
		s = strings.TrimPrefix(s, "```")
		s = strings.TrimSuffix(s, "```")
	}
	return strings.TrimSpace(s)
}

// detectExam 从测试数据获取考试类型（由文件解析时注入）。
func detectExam(t cepocTest) string {
	if t.Exam != "" {
		return t.Exam
	}
	return "FCE"
}

// examToLevel 将 CEPOC 考试类型映射到我们的分级。
func examToLevel(exam string) string {
	switch strings.ToUpper(exam) {
	case "KET", "PET":
		return "初阶"
	case "FCE":
		return "中阶"
	case "CAE", "CPE":
		return "高阶"
	default:
		return "中阶"
	}
}

// estimateClozeMinutes 根据空位数估测算用时。
func estimateClozeMinutes(blankCount int) int {
	minutes := blankCount / 2
	if minutes < 3 {
		minutes = 3
	}
	if minutes > 15 {
		minutes = 15
	}
	return minutes
}

// printCEPOCSample 打印样本。
func printCEPOCSample(tests []cepocTest) {
	for i, t := range tests {
		if i >= 3 {
			break
		}
		fmt.Printf("\n=== 样本 %d: ID=%d Title=%s ===\n", i+1, t.ID, t.Title)
		fmt.Printf("正文前 200 字: %s\n", truncate(t.Text, 200))
		fmt.Printf("空位数: %d\n", len(t.Gaps))
		if len(t.Gaps) > 0 {
			fmt.Printf("第 1 空: item=%d answers=%v\n", t.Gaps[0].Item, t.Gaps[0].Answers)
		}
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
