package handlers

import (
	"context"
	"errors"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/utils"
	lbconstants "github.com/LingByte/ling-base/common/constants"
	"github.com/LingByte/ling-base/common/logger"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type wordBookBatchAudioJob struct {
	mu            sync.Mutex
	BookID        uint   `json:"bookId"`
	Status        string `json:"status"`
	Total         int    `json:"total"`
	Processed     int    `json:"processed"`
	Success       int    `json:"success"`
	Failed        int    `json:"failed"`
	Error         string `json:"error,omitempty"`
	Keyword       string `json:"keyword,omitempty"`
	TaskID        string `json:"taskId,omitempty"`
	StartedAt     time.Time
	FinishedAt    time.Time
	cancel        context.CancelFunc
	stopRequested bool
}

var wordBookBatchAudioJobs sync.Map // bookID -> *wordBookBatchAudioJob

func wordBookBatchAudioGap() time.Duration {
	ms := 8
	if v := os.Getenv("WORDBOOK_BATCH_AUDIO_GAP_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			ms = n
		}
	}
	return time.Duration(ms) * time.Millisecond
}

func wordBookTTSRequestGap() time.Duration {
	ms := 8
	if v := os.Getenv("WORDBOOK_TTS_REQUEST_GAP_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			ms = n
		}
	}
	return time.Duration(ms) * time.Millisecond
}

// wordBookTTSMaxAttempts 单词合成最大尝试次数（含首次），默认 3。
func wordBookTTSMaxAttempts() int {
	n := 3
	if v := os.Getenv("WORDBOOK_TTS_MAX_RETRIES"); v != "" {
		// 兼容：既可配「重试次数」也可配「总尝试次数」；这里按「额外重试次数」理解
		if extra, err := strconv.Atoi(v); err == nil && extra >= 0 {
			n = extra + 1
		}
	}
	if v := os.Getenv("WORDBOOK_TTS_MAX_ATTEMPTS"); v != "" {
		if a, err := strconv.Atoi(v); err == nil && a > 0 {
			n = a
		}
	}
	if n < 1 {
		n = 1
	}
	return n
}

func wordBookTTSRetryBase() time.Duration {
	ms := 800
	if v := os.Getenv("WORDBOOK_TTS_RETRY_BASE_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			ms = n
		}
	}
	return time.Duration(ms) * time.Millisecond
}

// isPermanentTTSError 不可重试的错误（额度/鉴权/未开通等）。
func isPermanentTTSError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) {
		return true
	}
	s := err.Error()
	permanents := []string{
		"ServerNotOpen",
		"PkgExhausted",
		"Unauthorized",
		"AuthorizationFailed",
		"AuthFailure",
		"InvalidParameter",
		"文本为空",
		"文本过长",
		"缺少腾讯云 TTS 凭证",
	}
	for _, p := range permanents {
		if strings.Contains(s, p) {
			return true
		}
	}
	return false
}

func getWordBookBatchAudioJob(bookID uint) *wordBookBatchAudioJob {
	if v, ok := wordBookBatchAudioJobs.Load(bookID); ok {
		return v.(*wordBookBatchAudioJob)
	}
	j := &wordBookBatchAudioJob{BookID: bookID, Status: batchAudioIdle}
	actual, _ := wordBookBatchAudioJobs.LoadOrStore(bookID, j)
	return actual.(*wordBookBatchAudioJob)
}

func (j *wordBookBatchAudioJob) snapshot() gin.H {
	j.mu.Lock()
	defer j.mu.Unlock()
	out := gin.H{
		"bookId":    j.BookID,
		"status":    j.Status,
		"total":     j.Total,
		"processed": j.Processed,
		"success":   j.Success,
		"failed":    j.Failed,
		"error":     j.Error,
	}
	if j.Keyword != "" {
		out["keyword"] = j.Keyword
	}
	if j.TaskID != "" {
		out["taskId"] = j.TaskID
	}
	if !j.StartedAt.IsZero() {
		out["startedAt"] = j.StartedAt.UTC().Format(time.RFC3339)
	}
	if !j.FinishedAt.IsZero() {
		out["finishedAt"] = j.FinishedAt.UTC().Format(time.RFC3339)
	}
	return out
}

func (j *wordBookBatchAudioJob) isActiveLocked() bool {
	return j.Status == batchAudioQueued || j.Status == batchAudioRunning
}

// tryQueue 将任务标记为排队中（尚未真正开始合成）。
func (j *wordBookBatchAudioJob) tryQueue(total int, keyword, taskID string) bool {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.isActiveLocked() {
		return false
	}
	j.Status = batchAudioQueued
	j.Total = total
	j.Processed = 0
	j.Success = 0
	j.Failed = 0
	j.Error = ""
	j.Keyword = keyword
	j.TaskID = taskID
	j.StartedAt = time.Now()
	j.FinishedAt = time.Time{}
	j.cancel = nil
	j.stopRequested = false
	return true
}

// beginRun 由队列 worker 取出任务后调用，queued → running。
func (j *wordBookBatchAudioJob) beginRun() (context.Context, bool) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.Status != batchAudioQueued || j.stopRequested {
		return nil, false
	}
	ctx, cancel := context.WithCancel(context.Background())
	j.Status = batchAudioRunning
	j.cancel = cancel
	return ctx, true
}

func (j *wordBookBatchAudioJob) requestStop() bool {
	j.mu.Lock()
	status := j.Status
	cancel := j.cancel
	taskID := j.TaskID
	if status == batchAudioQueued {
		j.stopRequested = true
		j.Status = batchAudioStopped
		j.FinishedAt = time.Now()
		j.cancel = nil
		j.mu.Unlock()
		cancelQueuedWordBookBatchAudio(taskID)
		return true
	}
	j.mu.Unlock()
	if status == batchAudioRunning && cancel != nil {
		cancel()
		return true
	}
	return false
}

func (j *wordBookBatchAudioJob) markProgress(processed, success, failed int) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Processed = processed
	j.Success = success
	j.Failed = failed
}

func (j *wordBookBatchAudioJob) finish(status, errMsg string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = status
	j.Error = errMsg
	j.FinishedAt = time.Now()
	j.cancel = nil
	j.stopRequested = false
}

// adminListWordBookBatchAudioJobs GET /wordbooks/batch-audio/jobs
// 一次返回所有排队/运行中的词库批量 TTS 任务，供列表页轮询（避免对每本书各打一次状态接口）。
func (h *Handlers) adminListWordBookBatchAudioJobs(c *gin.Context) {
	reqCtx := c.Request.Context()
	jobs := make([]gin.H, 0, 8)
	hasQueued := false

	wordBookBatchAudioJobs.Range(func(key, value any) bool {
		if reqCtx.Err() != nil {
			return false
		}
		job, ok := value.(*wordBookBatchAudioJob)
		if !ok || job == nil {
			wordBookBatchAudioJobs.Delete(key)
			return true
		}
		snap := job.snapshot()
		status, _ := snap["status"].(string)
		if status != batchAudioQueued && status != batchAudioRunning {
			wordBookBatchAudioJobs.Delete(key)
			return true
		}
		if status == batchAudioQueued {
			hasQueued = true
		}
		jobs = append(jobs, snap)
		return true
	})

	if reqCtx.Err() != nil {
		return
	}

	wordBookBatchAudioQueueMu.Lock()
	workers := wordBookBatchAudioWorkers
	q := wordBookBatchAudioQ
	wordBookBatchAudioQueueMu.Unlock()

	if hasQueued && q != nil {
		for i := range jobs {
			status, _ := jobs[i]["status"].(string)
			if status != batchAudioQueued {
				continue
			}
			taskID, _ := jobs[i]["taskId"].(string)
			if taskID == "" {
				continue
			}
			posCtx, cancel := context.WithTimeout(reqCtx, 2*time.Second)
			pos, err := q.Position(posCtx, taskID)
			cancel()
			if err == nil && pos >= 0 {
				jobs[i]["queuePosition"] = pos
			}
		}
	}

	out := gin.H{
		"jobs":         jobs,
		"queueWorkers": workers,
	}
	if hasQueued && q != nil {
		statsCtx, cancel := context.WithTimeout(reqCtx, 2*time.Second)
		stats, err := q.Stats(statsCtx)
		cancel()
		if err == nil {
			out["queuePending"] = stats.Pending
			out["queueRunning"] = stats.Running
		}
	}
	response.SuccessI18n(c, "common.success", out)
}

type wordBookBatchAudioReq struct {
	Keyword string `json:"keyword"`
}

// adminBatchWordBookAudio POST /wordbooks/:id/words/batch-audio
func (h *Handlers) adminBatchWordBookAudio(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	bookID, err := parseBookIDParam(c)
	if err != nil || bookID == 0 {
		response.FailI18n(c, "wordbook.invalid_id", nil)
		return
	}
	job := getWordBookBatchAudioJob(bookID)
	if snap := job.snapshot(); snap["status"] == batchAudioRunning || snap["status"] == batchAudioQueued {
		response.SuccessI18n(c, "wordbook.job_running", snap)
		return
	}

	var req wordBookBatchAudioReq
	_ = c.ShouldBindJSON(&req)
	keyword := strings.TrimSpace(req.Keyword)

	q := db.Model(&models.Word{}).
		Where("word_book_id = ? AND (audio_url IS NULL OR audio_url = '')", bookID)
	if keyword != "" {
		q = q.Where("word LIKE ? OR translation LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}
	if total == 0 {
		response.SuccessI18n(c, "wordbook.all_audio_exists", gin.H{
			"bookId":  bookID,
			"status":  batchAudioDone,
			"total":   0,
			"success": 0,
			"started": false,
		})
		return
	}

	out, err := enqueueWordBookBatchAudio(bookID, keyword, int(total))
	if err != nil {
		if out != nil {
			response.SuccessI18n(c, "wordbook.job_running", out)
			return
		}
		response.FailI18n(c, "common.operation_failed", nil)
		return
	}
	response.SuccessI18n(c, "wordbook.audio_queued", out)
}

// adminBatchWordBookAudioStatus GET /wordbooks/:id/words/batch-audio
func (h *Handlers) adminBatchWordBookAudioStatus(c *gin.Context) {
	bookID, err := parseBookIDParam(c)
	if err != nil || bookID == 0 {
		response.FailI18n(c, "wordbook.invalid_id", nil)
		return
	}
	job := getWordBookBatchAudioJob(bookID)
	out := job.snapshot()
	if status, _ := out["status"].(string); status == batchAudioQueued {
		wordBookBatchAudioQueueMu.Lock()
		q := wordBookBatchAudioQ
		workers := wordBookBatchAudioWorkers
		wordBookBatchAudioQueueMu.Unlock()
		out["queueWorkers"] = workers
		if q != nil {
			if taskID, _ := out["taskId"].(string); taskID != "" {
				if pos, err := q.Position(context.Background(), taskID); err == nil && pos >= 0 {
					out["queuePosition"] = pos
				}
			}
			if stats, err := q.Stats(context.Background()); err == nil {
				out["queuePending"] = stats.Pending
				out["queueRunning"] = stats.Running
			}
		}
	}
	response.SuccessI18n(c, "common.success", out)
}

// adminBatchWordBookAudioStop POST /wordbooks/:id/words/batch-audio/stop
func (h *Handlers) adminBatchWordBookAudioStop(c *gin.Context) {
	bookID, err := parseBookIDParam(c)
	if err != nil || bookID == 0 {
		response.FailI18n(c, "wordbook.invalid_id", nil)
		return
	}
	job := getWordBookBatchAudioJob(bookID)
	if !job.requestStop() {
		response.SuccessI18n(c, "wordbook.no_running_job", job.snapshot())
		return
	}
	response.SuccessI18n(c, "wordbook.audio_stop_requested", job.snapshot())
}

func runWordBookBatchAudioJob(ctx context.Context, db *gorm.DB, bookID uint, keyword string, job *wordBookBatchAudioJob) {
	defer func() {
		if r := recover(); r != nil {
			logger.Error("wordbook batch-audio panic", zap.Uint("bookId", bookID), zap.Any("recover", r))
			job.finish(batchAudioFailed, "内部错误")
		}
	}()

	q := db.Model(&models.Word{}).
		Where("word_book_id = ? AND (audio_url IS NULL OR audio_url = '')", bookID)
	if keyword != "" {
		q = q.Where("word LIKE ? OR translation LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}

	var words []models.Word
	if err := q.Select("id, word, translation").
		Order("sort_order ASC, id ASC").
		Find(&words).Error; err != nil {
		logger.Error("wordbook batch-audio query failed", zap.Uint("bookId", bookID), zap.Error(err))
		job.finish(batchAudioFailed, err.Error())
		return
	}

	job.mu.Lock()
	job.Total = len(words)
	job.mu.Unlock()

	success := 0
	failed := 0
	wordGap := wordBookBatchAudioGap()
	segGap := wordBookTTSRequestGap()

	for i, w := range words {
		if ctx.Err() != nil {
			job.markProgress(i, success, failed)
			job.finish(batchAudioStopped, "")
			return
		}

		reqCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
		audioURL, err := synthesizeWordBookAudioURLsWithRetry(reqCtx, w.Word, w.Translation, segGap)
		cancel()
		if err != nil {
			failed++
			logger.Warn("wordbook batch-audio tts failed",
				zap.Uint("bookId", bookID),
				zap.Uint("wordId", w.ID),
				zap.String("word", w.Word),
				zap.Error(err),
			)
		} else {
			cleaned := utils.DeduplicateSlots(audioURL)
			if err := db.Model(&models.Word{}).
				Where("id = ?", w.ID).
				Update("audio_url", cleaned).Error; err != nil {
				failed++
				logger.Warn("wordbook batch-audio save failed",
					zap.Uint("bookId", bookID),
					zap.Uint("wordId", w.ID),
					zap.Error(err),
				)
			} else {
				success++
			}
		}

		job.markProgress(i+1, success, failed)

		if i+1 < len(words) && wordGap > 0 {
			select {
			case <-ctx.Done():
				job.finish(batchAudioStopped, "")
				return
			case <-time.After(wordGap):
			}
		}
	}

	job.finish(batchAudioDone, "")
	logger.Info("wordbook batch-audio finished",
		zap.Uint("bookId", bookID),
		zap.Int("total", len(words)),
		zap.Int("success", success),
		zap.Int("failed", failed),
	)
}

func synthesizeWordBookAudioURLsWithRetry(ctx context.Context, word, translation string, segGap time.Duration) (string, error) {
	attempts := wordBookTTSMaxAttempts()
	base := wordBookTTSRetryBase()
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		url, err := synthesizeWordBookAudioURLs(ctx, word, translation, segGap)
		if err == nil {
			if attempt > 1 {
				logger.Info("wordbook batch-audio tts retry succeeded",
					zap.String("word", word),
					zap.Int("attempt", attempt),
				)
			}
			return url, nil
		}
		lastErr = err
		if isPermanentTTSError(err) || attempt >= attempts {
			break
		}
		delay := base * time.Duration(1<<(attempt-1)) // 0.8s, 1.6s, 3.2s...
		if delay > 8*time.Second {
			delay = 8 * time.Second
		}
		logger.Warn("wordbook batch-audio tts retrying",
			zap.String("word", word),
			zap.Int("attempt", attempt),
			zap.Int("maxAttempts", attempts),
			zap.Duration("backoff", delay),
			zap.Error(err),
		)
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(delay):
		}
	}
	return "", lastErr
}

func synthesizeWordBookAudioURLs(ctx context.Context, word, translation string, segGap time.Duration) (string, error) {
	_ = translation // 英文音色只念单词；释义不进 TTS（与 admin lingecho-tts 一致）
	texts := buildWordAudioTexts(word)
	urls := make([]string, 0, len(texts))
	for i, text := range texts {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		reqCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
		url, err := synthesizeTextToURL(reqCtx, text, "", "")
		cancel()
		if err != nil {
			return "", err
		}
		urls = append(urls, url)
		if i+1 < len(texts) && segGap > 0 {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(segGap):
			}
		}
	}
	return strings.Join(urls, ";"), nil
}

// buildWordAudioTexts 词库音频两槽：0=单词一遍，1=单词三遍连读。
func buildWordAudioTexts(word string) []string {
	w := strings.TrimSpace(word)
	if w == "" {
		return nil
	}
	return []string{w, w + " " + w + " " + w}
}
