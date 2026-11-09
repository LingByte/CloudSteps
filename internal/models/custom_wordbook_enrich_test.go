package models

import "testing"

func TestEnrichFromCacheMissKeepsEmpty(t *testing.T) {
	enrichMu.Lock()
	enrichMap = map[string]EnrichEntry{}
	enrichReady.Store(true)
	enrichMu.Unlock()

	got := EnrichFromCache([]ParsedWord{{Word: "zzzznotaword"}})
	if got[0].Translation != "" || got[0].Phonetic != "" {
		t.Fatalf("miss should stay empty: %+v", got[0])
	}
	if got[0].Word != "zzzznotaword" {
		t.Fatalf("word should stay: %+v", got[0])
	}
}

func TestEnrichFromCacheHit(t *testing.T) {
	enrichMu.Lock()
	enrichMap = map[string]EnrichEntry{
		"apple": {Phonetic: "/ˈæpl/", TranslationShort: "苹果", Translation: "苹果"},
	}
	enrichReady.Store(true)
	enrichMu.Unlock()

	got := EnrichFromCache([]ParsedWord{{Word: "Apple"}})
	if got[0].Phonetic != "/ˈæpl/" || got[0].TranslationShort != "苹果" || got[0].Translation != "苹果" {
		t.Fatalf("hit enrich failed: %+v", got[0])
	}
}

func TestFillParsedFromEntryUsesUKPhoneticAndAudio(t *testing.T) {
	got := fillParsedFromEntry(ParsedWord{Word: "colour", Translation: "颜色"}, EnrichEntry{
		PhoneticUK: "/ˈkʌlə/",
		AudioURL:   "https://cdn.example/colour.mp3",
	})
	if got.Phonetic != "/ˈkʌlə/" || got.AudioURL != "https://cdn.example/colour.mp3" || got.Translation != "颜色" {
		t.Fatalf("fill failed: %+v", got)
	}
	kept := fillParsedFromEntry(ParsedWord{Word: "colour", Phonetic: "/keep/"}, EnrichEntry{Phonetic: "/ˈkʌlə/"})
	if kept.Phonetic != "/keep/" {
		t.Fatalf("existing phonetic overwritten: %+v", kept)
	}
}

func TestEnrichScore(t *testing.T) {
	a := EnrichEntry{Phonetic: "x"}
	b := EnrichEntry{Phonetic: "x", TranslationShort: "苹果"}
	if enrichScore(b) <= enrichScore(a) {
		t.Fatal("expected richer entry to score higher")
	}
}

func TestPublishBatchMarksReady(t *testing.T) {
	// 重置 ready 通道不便；仅验证 merge 后 size
	enrichMu.Lock()
	enrichMap = map[string]EnrichEntry{}
	enrichMu.Unlock()
	enrichReady.Store(false)

	enrichMu.Lock()
	enrichMap["apple"] = EnrichEntry{Phonetic: "/ˈæpl/", Translation: "苹果"}
	enrichMu.Unlock()
	markEnrichReady()

	if !enrichReady.Load() {
		t.Fatal("should be ready after mark")
	}
	if EnrichCacheSize() != 1 {
		t.Fatalf("size=%d", EnrichCacheSize())
	}
}
