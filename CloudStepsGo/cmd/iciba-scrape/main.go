// Command iciba-scrape 从金山词霸爱词吧抓取单词并写出 Excel（与后台导入模板列一致）。
//
// 默认：从首页解析全部词书 class，每个词书一个 xlsx；文件名尽量用词书标题（来自页面「第N课」标题）+ _class<id>，无法解析时回退 class_<id>.xlsx。
//
//	go run ./cmd/iciba-scrape -out-dir ./iciba_export
//
// 只抓一本书：
//
//	go run ./cmd/iciba-scrape -class 11 -out ./四级必备.xlsx
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/LingByte/CloudStepsGo/pkg/utils"
	"github.com/xuri/excelize/v2"
)

func main() {
	var (
		classID     = flag.Int("class", -1, ">=0 只抓该词书并写入 -out；-1 表示从首页抓取全部词书各一份到 -out-dir")
		outPath     = flag.String("out", "iciba_words.xlsx", "仅 -class>=0 时：输出路径；若保持默认 iciba_words.xlsx，则自动改为 词书标题_class<id>.xlsx")
		outDir      = flag.String("out-dir", "iciba_export", "全量模式：输出目录；文件名为 词书标题_class<id>.xlsx（无标题时为 class_<id>.xlsx）")
		diff        = flag.Int("difficulty", 1, "写入每行的 difficulty（1-5）")
		perFetch    = flag.Duration("per-fetch", 30*time.Second, "单次 HTTP 请求超时")
		maxCourses  = flag.Int("max-courses", 2000, "每个 class 内 course 从 0 开始每次 +1，最多试到该序号")
		emptyStreak = flag.Int("empty-streak", 5, "每个 class 内连续多少节无单词则判定该书记完")
		courseDelay = flag.Duration("course-delay", 600*time.Millisecond, "同一 class 内每节 course 请求后的间隔，减轻 429 限流（可再加大）")
		delay       = flag.Duration("delay", 5*time.Second, "全量模式下两个 class 之间的间隔")
		verbose     = flag.Bool("verbose", false, "打印每个 course：本课词数、累计词数、连续空节数")
	)
	flag.Parse()

	if *diff < 1 || *diff > 5 {
		log.Fatal("difficulty 须在 1-5 之间")
	}

	ctx := context.Background()

	if *classID >= 0 {
		runSingleClass(ctx, *classID, *outPath, *diff, *perFetch, *maxCourses, *emptyStreak, *courseDelay, *verbose)
		return
	}

	ids, err := utils.FetchIcibaClassIDs(ctx, *perFetch)
	if err != nil {
		log.Fatalf("读取词书列表失败: %v", err)
	}
	if err := os.MkdirAll(*outDir, 0o755); err != nil {
		log.Fatalf("创建输出目录: %v", err)
	}

	log.Printf("首页共 %d 个 class，将逐个抓取；每个 class 内 course 从 0 逐节 +1 请求", len(ids))
	log.Printf("单本词书课节多时会较久才出现下一条；可加 -verbose 查看每一节，或关注下方阶段性进度")
	ok, skip := 0, 0
	for i, cid := range ids {
		if i > 0 && *delay > 0 {
			time.Sleep(*delay)
		}
		log.Printf("[iciba-scrape] [%d/%d] 开始词书 class=%d（课间间隔 %v）", i+1, len(ids), cid, *courseDelay)
		prog := icibaCourseProgress(cid, *verbose, i+1, len(ids))
		words, stopCourse, fetchErr := utils.FetchIcibaWordAllCourses(ctx, cid, *perFetch, *maxCourses, *emptyStreak, *courseDelay, prog)
		if fetchErr != nil && len(words) == 0 {
			log.Printf("class=%d 跳过: %v", cid, fetchErr)
			skip++
			continue
		}
		if fetchErr != nil {
			log.Printf("class=%d 警告: %v（仍写入已抓 %d 条）", cid, fetchErr, len(words))
		}
		if len(words) == 0 {
			log.Printf("class=%d 跳过: 无单词（结束 course≈%d）", cid, stopCourse)
			skip++
			continue
		}
		fpath := filepath.Join(*outDir, icibaExcelBasename(cid, words)+".xlsx")
		if err := writeWordsXLSX(fpath, words, *diff); err != nil {
			log.Printf("class=%d 写出失败: %v", cid, err)
			skip++
			continue
		}
		fmt.Fprintf(os.Stderr, "class=%d → %s（%d 词，末 course=%d）\n", cid, fpath, len(words), stopCourse)
		ok++
	}
	fmt.Fprintf(os.Stderr, "完成：成功 %d 个文件，跳过 %d 个 class\n", ok, skip)
}

// icibaCourseProgress 进度里带上页面解析出的课程标题（如「四级必备词汇 第3课」），course 仅为 URL 参数序号。
func icibaCourseProgress(classID int, verbose bool, bookIndex, bookTotal int) func(course, pageWords, totalWords, consecutiveEmpty int, lessonTitle string) {
	if verbose {
		return func(course, pageWords, totalWords, consecutiveEmpty int, lessonTitle string) {
			title := lessonTitle
			if title == "" {
				title = "(无标题)"
			}
			log.Printf("class=%d course=%d 「%s」本课%d词 累计%d词 连续空节=%d", classID, course, title, pageWords, totalWords, consecutiveEmpty)
		}
	}
	return func(course, pageWords, totalWords, consecutiveEmpty int, lessonTitle string) {
		if course == 0 || (course+1)%12 == 0 {
			title := lessonTitle
			if title == "" {
				title = "—"
			}
			log.Printf("[iciba-scrape] [%d/%d] class=%d course=%d 「%s」本课%d词 累计%d词", bookIndex, bookTotal, classID, course, title, pageWords, totalWords)
		}
	}
}

func runSingleClass(ctx context.Context, classID int, out string, diff int, perFetch time.Duration, maxCourses, emptyStreak int, courseDelay time.Duration, verbose bool) {
	words, stopCourse, err := utils.FetchIcibaWordAllCourses(ctx, classID, perFetch, maxCourses, emptyStreak, courseDelay, icibaCourseProgress(classID, verbose, 1, 1))
	if err != nil {
		if len(words) == 0 {
			log.Fatalf("抓取失败: %v", err)
		}
		log.Printf("警告: %v（已保留此前 %d 条）", err, len(words))
	}
	if len(words) == 0 {
		log.Fatalf("未解析到任何单词：class=%d（末 course=%d）", classID, stopCourse)
	}
	finalOut := resolveIcibaSingleOutPath(out, classID, words)
	if err := writeWordsXLSX(finalOut, words, diff); err != nil {
		log.Fatalf("写出 Excel 失败: %v", err)
	}
	fmt.Fprintf(os.Stderr, "已写入 %d 条 → %s（class=%d，结束于 course=%d）\n", len(words), finalOut, classID, stopCourse)
}

// 与后台导入模板列一致（8 列）
var sheetHeaders = []string{
	"word", "phonetic", "translation", "exampleSentence", "audioUrl", "imageUrl", "difficulty", "sortOrder",
}

var icibaLessonTitleBookRE = regexp.MustCompile(`^(.+?)\s*第\s*\d+\s*课`)

func icibaBookLabelFromWords(words []utils.IcibaWordEntry) string {
	for _, w := range words {
		t := strings.TrimSpace(w.LessonTitle)
		if t == "" {
			continue
		}
		if m := icibaLessonTitleBookRE.FindStringSubmatch(t); len(m) > 1 {
			return strings.TrimSpace(m[1])
		}
		return t
	}
	return ""
}

func sanitizeExcelFileStem(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range s {
		switch r {
		case '/', '\\', ':', '*', '?', '"', '<', '>', '|':
			b.WriteRune('-')
		case '\r', '\n', '\t':
			b.WriteRune(' ')
		default:
			if unicode.IsControl(r) {
				continue
			}
			b.WriteRune(r)
		}
	}
	out := strings.Join(strings.Fields(b.String()), " ")
	if len([]rune(out)) > 80 {
		out = string([]rune(out)[:80])
		out = strings.TrimSpace(out)
	}
	return out
}

func icibaExcelBasename(classID int, words []utils.IcibaWordEntry) string {
	stem := sanitizeExcelFileStem(icibaBookLabelFromWords(words))
	if stem != "" {
		return fmt.Sprintf("%s_class%d", stem, classID)
	}
	return fmt.Sprintf("class_%d", classID)
}

// 若用户未改默认输出名，则用词书标题生成文件名，仍写在同一目录下。
func resolveIcibaSingleOutPath(userOut string, classID int, words []utils.IcibaWordEntry) string {
	if filepath.Base(userOut) != "iciba_words.xlsx" {
		return userOut
	}
	return filepath.Join(filepath.Dir(userOut), icibaExcelBasename(classID, words)+".xlsx")
}

func writeWordsXLSX(path string, words []utils.IcibaWordEntry, difficulty int) error {
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()

	sheet := f.GetSheetName(0)
	for i, h := range sheetHeaders {
		cell, err := excelize.CoordinatesToCellName(i+1, 1)
		if err != nil {
			return err
		}
		if err := f.SetCellValue(sheet, cell, h); err != nil {
			return err
		}
	}

	for i, w := range words {
		row := i + 2
		transJSON, err := translationToJSONArray(w.Translation)
		if err != nil {
			return fmt.Errorf("word %q: %w", w.Word, err)
		}
		vals := []any{
			w.Word,
			phoneticToSlashStyle(w.Phonetic),
			transJSON,
			"",
			w.AudioURL,
			"",
			difficulty,
			i + 1,
		}
		for col, v := range vals {
			cell, err := excelize.CoordinatesToCellName(col+1, row)
			if err != nil {
				return err
			}
			if err := f.SetCellValue(sheet, cell, v); err != nil {
				return err
			}
		}
	}

	return f.SaveAs(path)
}

func phoneticToSlashStyle(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if strings.HasPrefix(s, "/") && strings.HasSuffix(s, "/") {
		return s
	}
	s = strings.TrimPrefix(s, "[")
	s = strings.TrimSuffix(s, "]")
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	return "/" + s + "/"
}

func translationToJSONArray(line string) (string, error) {
	line = strings.TrimSpace(line)
	var arr []string
	if line != "" {
		arr = []string{line}
	}
	b, err := json.Marshal(arr)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
