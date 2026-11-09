package models

import (
	"context"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/LingByte/ling-base/common/logger"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// 内存词条补全缓存：启动时从 words 表抽取去重词条。enrich 先读缓存，缺音标或读音时再按本次单词查库。
const (
	enrichCacheMaxEntries = 250_000
	enrichScanBatch       = 5_000
	enrichReloadInterval  = 12 * time.Hour
	// 启动后若缓存尚未就绪，enrich 最多等待这么久（等首批写入）
	enrichWaitReady = 8 * time.Second
)

type EnrichEntry struct {
	Phonetic         string
	PhoneticUS       string
	PhoneticUK       string
	Translation      string
	TranslationShort string
	AudioURL         string
}

var (
	enrichMu        sync.RWMutex
	enrichMap       = map[string]EnrichEntry{}
	enrichReady     atomic.Bool
	enrichOnce      sync.Once
	enrichReadyCh   = make(chan struct{})
	enrichReadyOnce sync.Once
)

func markEnrichReady() {
	enrichReady.Store(true)
	enrichReadyOnce.Do(func() { close(enrichReadyCh) })
}

func waitEnrichReady() {
	if enrichReady.Load() {
		return
	}
	select {
	case <-enrichReadyCh:
	case <-time.After(enrichWaitReady):
	}
}

// EnrichFromCache 仅用内存缓存补全；未命中保持原样（空字段也会返回）。
func EnrichFromCache(items []ParsedWord) []ParsedWord {
	if len(items) == 0 {
		return items
	}
	waitEnrichReady()
	if !enrichReady.Load() {
		return items
	}
	enrichMu.RLock()
	defer enrichMu.RUnlock()
	for i := range items {
		key := strings.ToLower(strings.TrimSpace(items[i].Word))
		if key == "" {
			continue
		}
		e, ok := enrichMap[key]
		if !ok {
			continue
		}
		items[i] = fillParsedFromEntry(items[i], e)
	}
	return items
}

// EnrichMissingFromDB 只查本次词表里缓存没补全的单词，避免扫整张词库。
func EnrichMissingFromDB(db *gorm.DB, items []ParsedWord) []ParsedWord {
	if db == nil || len(items) == 0 {
		return items
	}
	need := make([]string, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, it := range items {
		if it.Phonetic != "" && (it.Translation != "" || it.TranslationShort != "") && it.AudioURL != "" {
			continue
		}
		word := strings.TrimSpace(it.Word)
		if word == "" {
			continue
		}
		key := strings.ToLower(word)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		need = append(need, word)
	}
	if len(need) == 0 {
		return items
	}

	found := map[string]EnrichEntry{}
	const chunk = 200
	for start := 0; start < len(need); start += chunk {
		end := start + chunk
		if end > len(need) {
			end = len(need)
		}
		var rows []Word
		err := db.Model(&Word{}).
			Select("word, phonetic, phonetic_us, phonetic_uk, translation, translation_short, audio_url").
			Where("word IN ?", need[start:end]).
			Find(&rows).Error
		if err != nil {
			logger.Lg.Warn("custom word enrich db lookup failed", zap.Error(err), zap.Int("words", len(need)))
			return items
		}
		for _, row := range rows {
			key := strings.ToLower(strings.TrimSpace(row.Word))
			if key == "" {
				continue
			}
			found[key] = mergeEnrichEntry(found[key], EnrichEntry{
				Phonetic:         strings.TrimSpace(row.Phonetic),
				PhoneticUS:       strings.TrimSpace(row.PhoneticUS),
				PhoneticUK:       strings.TrimSpace(row.PhoneticUK),
				Translation:      strings.TrimSpace(row.Translation),
				TranslationShort: strings.TrimSpace(row.TranslationShort),
				AudioURL:         strings.TrimSpace(row.AudioURL),
			})
		}
	}
	if len(found) == 0 {
		return items
	}
	for i := range items {
		key := strings.ToLower(strings.TrimSpace(items[i].Word))
		entry, ok := found[key]
		if !ok {
			continue
		}
		items[i] = fillParsedFromEntry(items[i], entry)
	}
	return items
}

// BackfillCustomBookPronunciation 给已保存的自定义词库补上库里已有的音标和读音。
func BackfillCustomBookPronunciation(db *gorm.DB, bookID uint) {
	if db == nil || bookID == 0 {
		return
	}
	var rows []Word
	err := db.Select("id, word, phonetic, phonetic_us, phonetic_uk, audio_url").
		Where("word_book_id = ?", bookID).
		Where("(COALESCE(phonetic, '') = '' AND COALESCE(phonetic_us, '') = '' AND COALESCE(phonetic_uk, '') = '') OR COALESCE(audio_url, '') = ''").
		Limit(MaxWords).
		Find(&rows).Error
	if err != nil || len(rows) == 0 {
		return
	}
	items := make([]ParsedWord, len(rows))
	for i, row := range rows {
		items[i] = ParsedWord{
			Word:     row.Word,
			Phonetic: firstNonEmpty(row.Phonetic, row.PhoneticUS, row.PhoneticUK),
			AudioURL: row.AudioURL,
		}
	}
	filled := EnrichMissingFromDB(db, items)
	for i, item := range filled {
		updates := map[string]any{}
		if rows[i].Phonetic == "" && rows[i].PhoneticUS == "" && rows[i].PhoneticUK == "" && item.Phonetic != "" {
			updates["phonetic"] = item.Phonetic
		}
		if rows[i].AudioURL == "" && item.AudioURL != "" {
			updates["audio_url"] = item.AudioURL
		}
		if len(updates) == 0 {
			continue
		}
		if err := db.Model(&Word{}).Where("id = ? AND word_book_id = ?", rows[i].ID, bookID).Updates(updates).Error; err != nil {
			logger.Lg.Warn("custom wordbook pronunciation backfill failed", zap.Error(err), zap.Uint("wordId", rows[i].ID))
			return
		}
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func fillParsedFromEntry(item ParsedWord, entry EnrichEntry) ParsedWord {
	if item.Phonetic == "" {
		switch {
		case entry.Phonetic != "":
			item.Phonetic = entry.Phonetic
		case entry.PhoneticUS != "":
			item.Phonetic = entry.PhoneticUS
		default:
			item.Phonetic = entry.PhoneticUK
		}
	}
	if item.Translation == "" {
		item.Translation = entry.Translation
	}
	if item.TranslationShort == "" {
		item.TranslationShort = entry.TranslationShort
		if item.TranslationShort == "" {
			item.TranslationShort = entry.Translation
		}
	}
	if item.AudioURL == "" {
		item.AudioURL = entry.AudioURL
	}
	return item
}

// EnrichCacheSize 当前缓存词条数（测试/诊断用）
func EnrichCacheSize() int {
	enrichMu.RLock()
	defer enrichMu.RUnlock()
	return len(enrichMap)
}

// StartEnrichCacheLoader 后台加载并周期性刷新
func StartEnrichCacheLoader(db *gorm.DB) {
	if db == nil {
		return
	}
	enrichOnce.Do(func() {
		go func() {
			loadEnrichCache(db)
			ticker := time.NewTicker(enrichReloadInterval)
			defer ticker.Stop()
			for range ticker.C {
				loadEnrichCache(db)
			}
		}()
	})
}

func loadEnrichCache(db *gorm.DB) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	start := time.Now()
	next := make(map[string]EnrichEntry, 64_000)

	type row struct {
		ID               uint
		Word             string
		Phonetic         string
		PhoneticUS       string
		PhoneticUK       string
		Translation      string
		TranslationShort string
		AudioURL         string
	}

	var lastID uint
	scanned := 0

	publishSnapshot := func() {
		if len(next) == 0 {
			return
		}
		// 拷贝快照，避免读侧拿到正在写入的 map
		snap := make(map[string]EnrichEntry, len(next))
		for k, v := range next {
			snap[k] = v
		}
		enrichMu.Lock()
		enrichMap = snap
		enrichMu.Unlock()
		markEnrichReady()
	}

	for {
		if ctx.Err() != nil {
			break
		}
		if len(next) >= enrichCacheMaxEntries {
			break
		}
		var part []row
		err := db.WithContext(ctx).Model(&Word{}).
			Select("id, word, phonetic, phonetic_us, phonetic_uk, translation, translation_short, audio_url").
			Where("id > ?", lastID).
			Where("(phonetic <> '' OR phonetic_us <> '' OR phonetic_uk <> '' OR audio_url <> '' OR translation <> '' OR translation_short <> '')").
			Order("id ASC").
			Limit(enrichScanBatch).
			Find(&part).Error
		if err != nil {
			logger.Lg.Warn("custom word enrich cache load failed", zap.Error(err), zap.Int("loaded", len(next)))
			break
		}
		if len(part) == 0 {
			break
		}
		for _, r := range part {
			lastID = r.ID
			scanned++
			key := strings.ToLower(strings.TrimSpace(r.Word))
			if key == "" {
				continue
			}
			cur, exists := next[key]
			merged := mergeEnrichEntry(cur, EnrichEntry{
				Phonetic:         strings.TrimSpace(r.Phonetic),
				PhoneticUS:       strings.TrimSpace(r.PhoneticUS),
				PhoneticUK:       strings.TrimSpace(r.PhoneticUK),
				Translation:      strings.TrimSpace(r.Translation),
				TranslationShort: strings.TrimSpace(r.TranslationShort),
				AudioURL:         strings.TrimSpace(r.AudioURL),
			})
			if !exists || enrichScore(merged) > enrichScore(cur) {
				next[key] = merged
			}
			if len(next) >= enrichCacheMaxEntries {
				break
			}
		}
		// 首批起即可对外服务；周期刷新时旧缓存仍可用，直到最终 swap
		if !enrichReady.Load() {
			publishSnapshot()
		}
		if len(next) >= enrichCacheMaxEntries || len(part) < enrichScanBatch {
			break
		}
	}

	if len(next) == 0 {
		logger.Lg.Warn("custom word enrich cache empty after scan",
			zap.Int("scanned", scanned),
			zap.Duration("elapsed", time.Since(start)))
		return
	}

	publishSnapshot()
	logger.Lg.Info("custom word enrich cache ready",
		zap.Int("entries", len(next)),
		zap.Int("scanned", scanned),
		zap.Duration("elapsed", time.Since(start)))
}

func mergeEnrichEntry(a, b EnrichEntry) EnrichEntry {
	out := a
	if out.Phonetic == "" {
		out.Phonetic = b.Phonetic
	}
	if out.PhoneticUS == "" {
		out.PhoneticUS = b.PhoneticUS
	}
	if out.PhoneticUK == "" {
		out.PhoneticUK = b.PhoneticUK
	}
	if out.AudioURL == "" {
		out.AudioURL = b.AudioURL
	}
	if out.Translation == "" {
		out.Translation = b.Translation
	}
	if out.TranslationShort == "" {
		out.TranslationShort = b.TranslationShort
	}
	return out
}

func enrichScore(e EnrichEntry) int {
	n := 0
	if e.Phonetic != "" || e.PhoneticUS != "" || e.PhoneticUK != "" {
		n += 2
	}
	if e.AudioURL != "" {
		n++
	}
	if e.TranslationShort != "" {
		n += 2
	} else if e.Translation != "" {
		n++
	}
	return n
}
