package utils

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/html"
)

const (
	// IcibaWordSiteRoot 金山词霸爱词吧背单词站点
	IcibaWordSiteRoot = "https://word.iciba.com/"
	// 使用常见浏览器 UA，降低被简单规则拦截的概率；仍须控制频率避免 429。
	defaultIcibaUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

	iciba429MaxAttempts = 12
	iciba429BackoffMin  = 3 * time.Second
	iciba429BackoffMax  = 120 * time.Second
)

func setIcibaHTMLHeaders(req *http.Request) {
	req.Header.Set("User-Agent", defaultIcibaUA)
	req.Header.Set("Accept", "text/html,application/xhtml+xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
}

// parseRetryAfter 解析 Retry-After（秒数或 HTTP-date），返回建议等待时长；无法解析返回 0。
func parseRetryAfter(h http.Header) time.Duration {
	v := strings.TrimSpace(h.Get("Retry-After"))
	if v == "" {
		return 0
	}
	if secs, err := strconv.Atoi(v); err == nil && secs >= 0 {
		return time.Duration(secs) * time.Second
	}
	if t, err := http.ParseTime(v); err == nil {
		d := time.Until(t)
		if d > 0 {
			return d
		}
	}
	return 0
}

// icibaFetchURL GET 爱词吧 HTML；遇 HTTP 429 时按 Retry-After 与指数退避重试，避免瞬时高频触发限流。
func icibaFetchURL(ctx context.Context, url string, reqTimeout time.Duration) ([]byte, error) {
	if reqTimeout <= 0 {
		reqTimeout = 30 * time.Second
	}
	backoff := iciba429BackoffMin
	var last429 time.Duration

	for attempt := 0; attempt < iciba429MaxAttempts; attempt++ {
		if attempt > 0 {
			wait := backoff
			if last429 > wait {
				wait = last429
			}
			if wait > iciba429BackoffMax {
				wait = iciba429BackoffMax
			}
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(wait):
			}
			backoff = time.Duration(float64(backoff) * 1.6)
			if backoff > iciba429BackoffMax {
				backoff = iciba429BackoffMax
			}
		}

		reqCtx, cancel := context.WithTimeout(ctx, reqTimeout)
		req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
		if err != nil {
			cancel()
			return nil, err
		}
		setIcibaHTMLHeaders(req)

		client := &http.Client{Timeout: reqTimeout}
		res, err := client.Do(req)
		if err != nil {
			cancel()
			return nil, fmt.Errorf("iciba request: %w", err)
		}
		body, rerr := io.ReadAll(res.Body)
		_ = res.Body.Close()
		cancel() // 须在读完 Body 之后再 cancel，否则读流会因 context 已取消而报 context canceled
		if rerr != nil {
			return nil, rerr
		}

		if res.StatusCode == http.StatusOK {
			return body, nil
		}
		if res.StatusCode == http.StatusTooManyRequests {
			last429 = parseRetryAfter(res.Header)
			if last429 <= 0 {
				last429 = backoff
			}
			if attempt < iciba429MaxAttempts-1 {
				log.Printf("[iciba] HTTP 429，约 %v 后重试（%d/%d）", last429, attempt+1, iciba429MaxAttempts)
			}
			if attempt == iciba429MaxAttempts-1 {
				return nil, fmt.Errorf("iciba http 429: 已重试 %d 次仍被限流，请加大抓取间隔后重试", iciba429MaxAttempts)
			}
			continue
		}
		return nil, fmt.Errorf("iciba http %d", res.StatusCode)
	}
	return nil, fmt.Errorf("iciba: 超过最大重试次数")
}

// 首页导航里链到课程列表的 classid=数字
var reIcibaClassID = regexp.MustCompile(`classid=(\d+)`)

// FetchIcibaClassIDs 从爱词吧首页解析出现的全部词书 class ID（去重后升序）。
func FetchIcibaClassIDs(ctx context.Context, perRequestTimeout time.Duration) ([]int, error) {
	u := strings.TrimSuffix(IcibaWordSiteRoot, "/") + "/"
	to := perRequestTimeout
	if to <= 0 {
		to = 30 * time.Second
	}
	body, err := icibaFetchURL(ctx, u, to)
	if err != nil {
		return nil, fmt.Errorf("iciba index: %w", err)
	}
	ids := ExtractIcibaClassIDsFromIndexHTML(body)
	if len(ids) == 0 {
		return nil, fmt.Errorf("iciba index: 未解析到任何 classid，页面结构可能已变")
	}
	return ids, nil
}

// ExtractIcibaClassIDsFromIndexHTML 从爱词吧首页 HTML 中提取 classid（去重、升序），供网络抓取与单测复用。
func ExtractIcibaClassIDsFromIndexHTML(body []byte) []int {
	seen := make(map[int]struct{})
	var ids []int
	for _, m := range reIcibaClassID.FindAllSubmatch(body, -1) {
		id, convErr := strconv.Atoi(string(m[1]))
		if convErr != nil {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	sort.Ints(ids)
	return ids
}

// IcibaWordEntry 从爱词吧课程页解析出的一条单词（已做空白与换行清洗）
type IcibaWordEntry struct {
	Word         string `json:"word"`
	Phonetic     string `json:"phonetic"`     // 含方括号，如 [iˈli:ɡəl]
	Translation  string `json:"translation"`  // 整行释义，如 adj. 不合法的，非法的
	PartOfSpeech string `json:"partOfSpeech"` // 从释义行拆出的词性（若能识别），否则为空
	GlossZH      string `json:"glossZh"`      // 去掉词性前缀后的中文部分（若能拆分），否则与 Translation 相同
	AudioURL     string `json:"audioUrl"`     // 发音 mp3，部分词条可能为空
	// LessonTitle 页面「第N课」标题（来自 div.word_h2），合并多课时写入每条词便于区分
	LessonTitle string `json:"lessonTitle"`
}

// IcibaWordPage 一页课程解析结果
type IcibaWordPage struct {
	SourceURL   string            `json:"sourceUrl"`
	ClassID     int               `json:"classId"`
	CourseID    int               `json:"courseId"`
	LessonTitle string            `json:"lessonTitle"` // 如「四级必备词汇 第3课」
	Words       []IcibaWordEntry  `json:"words"`
}

// IcibaWordsCourseURL 构造爱词吧「按课单词表」链接
// 示例: https://word.iciba.com/?action=words&class=11&course=3
func IcibaWordsCourseURL(classID, courseID int) string {
	return fmt.Sprintf("%s?action=words&class=%d&course=%d", strings.TrimSuffix(IcibaWordSiteRoot, "/"), classID, courseID)
}

// FetchIcibaWordPage 请求指定 class/course 的课程单词页并解析为结构化数据。
// 调用方须自行确保符合爱词霸/金山词霸服务条款（公开页面抓取仅限合规用途）。
// FetchIcibaWordPage 请求指定 class/course 的课程单词页。reqTimeout 为单次 GET（含 429 重试中每一次尝试）的超时，<=0 则用 30s。
func FetchIcibaWordPage(ctx context.Context, classID, courseID int, reqTimeout time.Duration) (*IcibaWordPage, error) {
	url := IcibaWordsCourseURL(classID, courseID)
	if reqTimeout <= 0 {
		reqTimeout = 30 * time.Second
	}
	body, err := icibaFetchURL(ctx, url, reqTimeout)
	if err != nil {
		return nil, err
	}
	return ParseIcibaWordPageHTML(bytes.NewReader(body), url, classID, courseID)
}

// FetchIcibaWordAllCourses 从 course=0 起按 course++ 逐课请求同一 class（不会跳号），合并所有非空页的单词。
// 空页跳过（例如 course=0 常无数据）；当连续 emptyStreak 节课都无词时视为全书已结束。HTTP 失败或达到 maxCourses 时返回已抓数据与错误。
// perRequestTimeout 为每次 HTTP GET 尝试的超时（遇 429 重试时每一跳单独计时）；maxCourses <= 0 时使用 2000；emptyStreak <= 0 时使用 5。
// pauseBetweenCourses 若 >0，在每次请求（含空页）之后休眠，减轻对站点压力。
// onEachCourse 非 nil 时，每试完一课回调一次：course 序号、本课词数、累计词数、连续空节、本页 HTML 中的课程标题（可能为空）。
// stopCourse 为最后一次请求的 course；正常结束时 err==nil。
func FetchIcibaWordAllCourses(ctx context.Context, classID int, perRequestTimeout time.Duration, maxCourses, emptyStreak int, pauseBetweenCourses time.Duration, onEachCourse func(course, pageWords, totalWords, consecutiveEmpty int, lessonTitle string)) (words []IcibaWordEntry, stopCourse int, err error) {
	if maxCourses <= 0 {
		maxCourses = 2000
	}
	if emptyStreak <= 0 {
		emptyStreak = 5
	}
	var all []IcibaWordEntry
	consecutiveEmpty := 0
	for course := 0; course < maxCourses; course++ {
		page, fetchErr := FetchIcibaWordPage(ctx, classID, course, perRequestTimeout)
		if fetchErr != nil {
			return all, course, fetchErr
		}

		pageN := len(page.Words)
		if pageN == 0 {
			consecutiveEmpty++
		} else {
			consecutiveEmpty = 0
			for _, w := range page.Words {
				w.LessonTitle = page.LessonTitle
				all = append(all, w)
			}
		}
		if onEachCourse != nil {
			onEachCourse(course, pageN, len(all), consecutiveEmpty, page.LessonTitle)
		}
		if pauseBetweenCourses > 0 {
			select {
			case <-ctx.Done():
				return all, course, ctx.Err()
			case <-time.After(pauseBetweenCourses):
			}
		}

		if pageN == 0 && consecutiveEmpty >= emptyStreak {
			return all, course, nil
		}
	}
	return all, maxCourses - 1, fmt.Errorf("iciba: 已达 maxCourses=%d 上限，共 %d 词", maxCourses, len(all))
}

// ParseIcibaWordPageHTML 从爱词吧 HTML 解析单词列表（便于单测或自建缓存）
func ParseIcibaWordPageHTML(r io.Reader, sourceURL string, classID, courseID int) (*IcibaWordPage, error) {
	doc, err := html.Parse(r)
	if err != nil {
		return nil, fmt.Errorf("parse html: %w", err)
	}
	out := &IcibaWordPage{
		SourceURL: sourceURL,
		ClassID:   classID,
		CourseID:  courseID,
		Words:     nil,
	}
	if title := findLessonTitle(doc); title != "" {
		out.LessonTitle = spaceClean(title)
	}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "ul" && hasClassToken(n, "word_main_list") {
			for li := n.FirstChild; li != nil; li = li.NextSibling {
				if li.Type == html.ElementNode && li.Data == "li" {
					if ent := parseWordLI(li); ent != nil && ent.Word != "" {
						out.Words = append(out.Words, *ent)
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return out, nil
}

func findLessonTitle(doc *html.Node) string {
	var title string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if title != "" {
			return
		}
		if n.Type == html.ElementNode && n.Data == "div" && hasClassToken(n, "word_h2") {
			for p := n.FirstChild; p != nil; p = p.NextSibling {
				if p.Type == html.ElementNode && p.Data == "p" {
					title = textBeforeSpan(p)
					return
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return title
}

func textBeforeSpan(p *html.Node) string {
	var b strings.Builder
	for c := p.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.TextNode {
			b.WriteString(c.Data)
		}
		if c.Type == html.ElementNode && c.Data == "span" {
			break
		}
	}
	return strings.TrimSpace(b.String())
}

func parseWordLI(li *html.Node) *IcibaWordEntry {
	ent := &IcibaWordEntry{}
	for div := li.FirstChild; div != nil; div = div.NextSibling {
		if div.Type != html.ElementNode || div.Data != "div" {
			continue
		}
		switch {
		case hasClassToken(div, "word_main_list_w"):
			ent.Word = spaceClean(firstTitleOrText(div))
		case hasClassToken(div, "word_main_list_y"):
			ent.Phonetic = spaceClean(phoneticFromY(div))
			ent.AudioURL = strings.TrimSpace(audioURLFromY(div))
		case hasClassToken(div, "word_main_list_s"):
			ent.Translation = spaceClean(translationFromS(div))
		}
	}
	ent.PartOfSpeech, ent.GlossZH = splitIcibaPOSGloss(ent.Translation)
	if ent.GlossZH == "" {
		ent.GlossZH = ent.Translation
	}
	return ent
}

func firstTitleOrText(root *html.Node) string {
	var title string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if title != "" {
			return
		}
		if n.Type == html.ElementNode && n.Data == "span" {
			if t := attr(n, "title"); t != "" {
				title = t
				return
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(root)
	if title != "" {
		return title
	}
	return strings.TrimSpace(nodeText(root))
}

func phoneticFromY(root *html.Node) string {
	for n := root.FirstChild; n != nil; n = n.NextSibling {
		if n.Type == html.ElementNode && n.Data == "strong" {
			return strings.TrimSpace(nodeText(n))
		}
	}
	return ""
}

func audioURLFromY(root *html.Node) string {
	for n := root.FirstChild; n != nil; n = n.NextSibling {
		if n.Type == html.ElementNode && n.Data == "a" && hasClassToken(n, "icon_s") {
			if id := attr(n, "id"); strings.HasPrefix(id, "http") {
				return id
			}
		}
	}
	return ""
}

func translationFromS(root *html.Node) string {
	for n := root.FirstChild; n != nil; n = n.NextSibling {
		if n.Type == html.ElementNode && n.Data == "span" {
			if t := attr(n, "title"); t != "" {
				return t
			}
			return strings.TrimSpace(nodeText(n))
		}
	}
	return strings.TrimSpace(nodeText(root))
}

// splitIcibaPOSGloss 从「adj. 释义」类行中拆分词性与中文；无法拆分时返回 "", full
func splitIcibaPOSGloss(line string) (pos, gloss string) {
	line = strings.TrimSpace(line)
	if line == "" {
		return "", ""
	}
	idx := strings.Index(line, ". ")
	if idx <= 0 || idx > 28 {
		return "", line
	}
	head := line[:idx+1]
	// 词性头一般较短，且以字母、&、小数点构成
	if !isProbablePOSHead(head) {
		return "", line
	}
	return strings.TrimSpace(head), strings.TrimSpace(line[idx+2:])
}

func isProbablePOSHead(s string) bool {
	s = strings.TrimSpace(s)
	if len(s) < 2 || len(s) > 24 {
		return false
	}
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || r == '.' || r == '&' {
			continue
		}
		return false
	}
	return strings.Contains(s, ".")
}

func hasClassToken(n *html.Node, token string) bool {
	if n.Type != html.ElementNode {
		return false
	}
	for _, a := range n.Attr {
		if a.Key == "class" {
			for _, c := range strings.Fields(a.Val) {
				if c == token {
					return true
				}
			}
		}
	}
	return false
}

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

func nodeText(n *html.Node) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.TextNode {
			b.WriteString(node.Data)
		}
		for c := node.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return b.String()
}

func spaceClean(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Join(strings.Fields(s), " ")
	return s
}
