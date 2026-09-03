package models

import (
	"context"
	"errors"
	"strings"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func testKnowledgeDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:knowledge_"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := db.AutoMigrate(&ReadingPassage{}, &ReadingQuestion{}, &UserReadingPassage{}, &UserReadingQuestion{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func TestParseReadingKnowledgeJSON(t *testing.T) {
	if pts, err := ParseReadingKnowledgeJSON(""); err != nil || pts != nil {
		t.Fatalf("empty: %v %v", pts, err)
	}
	pts, err := ParseReadingKnowledgeJSON(`[{"title":" A ","body":" B "},{"title":"","body":""}]`)
	if err != nil {
		t.Fatal(err)
	}
	if len(pts) != 1 || pts[0].Title != "A" || pts[0].Body != "B" {
		t.Fatalf("%+v", pts)
	}
	if !KnowledgeJSONReady("[]") {
		t.Fatal("[] should count as generated")
	}
}

func TestEnsureReadingPassageKnowledge_cacheHit(t *testing.T) {
	db := testKnowledgeDB(t)
	p := ReadingPassage{Title: "T", Content: "Hello world", Status: ReadingStatusPublished, KnowledgeJSON: `[{"title":"cached","body":"from db"}]`}
	if err := db.Create(&p).Error; err != nil {
		t.Fatal(err)
	}
	calls := 0
	pts, err := EnsureReadingPassageKnowledge(context.Background(), db, p.ID, func(context.Context, string, string) (string, error) {
		calls++
		return `[{"title":"new","body":"x"}]`, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 0 {
		t.Fatalf("chat called %d", calls)
	}
	if len(pts) != 1 || pts[0].Title != "cached" {
		t.Fatalf("%+v", pts)
	}
}

func TestEnsureReadingPassageKnowledge_generateAndStore(t *testing.T) {
	db := testKnowledgeDB(t)
	p := ReadingPassage{Title: "Cats", Content: "Cats sleep a lot.", Status: ReadingStatusPublished}
	if err := db.Create(&p).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&ReadingQuestion{
		PassageID: p.ID, Stem: "What do cats do?", Options: `[{"key":"A","text":"sleep"}]`,
		Answer: "A", Explanation: "The text says sleep.",
	}).Error; err != nil {
		t.Fatal(err)
	}
	calls := 0
	pts, err := EnsureReadingPassageKnowledge(context.Background(), db, p.ID, func(_ context.Context, system, user string) (string, error) {
		calls++
		if system == "" || !strings.Contains(user, "Cats sleep") {
			t.Fatalf("prompt missing content")
		}
		return "```json\n[{\"title\":\"睡眠\",\"body\":\"文中提到猫经常睡觉。\"}]\n```", nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 1 || len(pts) != 1 || pts[0].Title != "睡眠" {
		t.Fatalf("calls=%d pts=%+v", calls, pts)
	}
	var again ReadingPassage
	if err := db.First(&again, p.ID).Error; err != nil {
		t.Fatal(err)
	}
	if !KnowledgeJSONReady(again.KnowledgeJSON) {
		t.Fatal("not stored")
	}
	pts2, err := EnsureReadingPassageKnowledge(context.Background(), db, p.ID, func(context.Context, string, string) (string, error) {
		t.Fatal("should not regenerate")
		return "", errors.New("nope")
	})
	if err != nil || len(pts2) != 1 {
		t.Fatalf("%v %+v", err, pts2)
	}
}

func TestEnsureReadingPassageKnowledge_emptyArrayCached(t *testing.T) {
	db := testKnowledgeDB(t)
	p := ReadingPassage{Title: "T", Content: "x", Status: ReadingStatusPublished}
	if err := db.Create(&p).Error; err != nil {
		t.Fatal(err)
	}
	_, err := EnsureReadingPassageKnowledge(context.Background(), db, p.ID, func(context.Context, string, string) (string, error) {
		return "[]", nil
	})
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	pts, err := EnsureReadingPassageKnowledge(context.Background(), db, p.ID, func(context.Context, string, string) (string, error) {
		calls++
		return `[{"title":"x","body":"y"}]`, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 0 || len(pts) != 0 {
		t.Fatalf("calls=%d len=%d", calls, len(pts))
	}
}
