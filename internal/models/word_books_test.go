package models

import (
	"database/sql"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	sqlite3 "github.com/mattn/go-sqlite3"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// greatestDriverOnce registers a sqlite3 driver variant that exposes a
// GREATEST() function (MySQL-specific) so DeleteWord/BatchDeleteWords — which
// use gorm.Expr("GREATEST(word_count - 1, 0)") — work under the in-memory
// SQLite test database.
var greatestDriverOnce sync.Once

func registerGreatestDriver() {
	greatestDriverOnce.Do(func() {
		sql.Register("sqlite3_greatest", &sqlite3.SQLiteDriver{
			ConnectHook: func(conn *sqlite3.SQLiteConn) error {
				return conn.RegisterFunc("GREATEST", func(args ...int64) int64 {
					if len(args) == 0 {
						return 0
					}
					m := args[0]
					for _, v := range args[1:] {
						if v > m {
							m = v
						}
					}
					return m
				}, true)
			},
		})
	})
}

func testWordBooksDB(t *testing.T) *gorm.DB {
	t.Helper()
	registerGreatestDriver()
	db, err := gorm.Open(sqlite.New(sqlite.Config{
		DriverName: "sqlite3_greatest",
		DSN:        "file:wordbooks_" + t.Name() + "?mode=memory&cache=shared",
	}), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(
		&WordBook{}, &Word{}, &WordBookProgress{}, &UserWordProgress{},
		&UserWordBook{}, &UserWordState{}, &ReviewQueue{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func TestWordBook_TableName(t *testing.T) {
	if (WordBook{}).TableName() != constants.TABLE_WORD_BOOKS {
		t.Fatalf("WordBook table name = %q, want %q",
			(WordBook{}).TableName(), constants.TABLE_WORD_BOOKS)
	}
}

func TestWord_TableName(t *testing.T) {
	if (Word{}).TableName() != constants.TABLE_WORDS {
		t.Fatalf("Word table name = %q, want %q",
			(Word{}).TableName(), constants.TABLE_WORDS)
	}
}

func TestWordLite_TableName(t *testing.T) {
	if (WordLite{}).TableName() != constants.TABLE_WORDS {
		t.Fatalf("WordLite table name = %q, want %q",
			(WordLite{}).TableName(), constants.TABLE_WORDS)
	}
}

func TestWordBookProgress_TableName(t *testing.T) {
	if (WordBookProgress{}).TableName() != constants.TABLE_WORD_BOOK_PROGRESS {
		t.Fatalf("WordBookProgress table name = %q, want %q",
			(WordBookProgress{}).TableName(), constants.TABLE_WORD_BOOK_PROGRESS)
	}
}

func TestUserWordProgress_TableName(t *testing.T) {
	if (UserWordProgress{}).TableName() != constants.TABLE_USER_WORD_PROGRESS {
		t.Fatalf("UserWordProgress table name = %q, want %q",
			(UserWordProgress{}).TableName(), constants.TABLE_USER_WORD_PROGRESS)
	}
}

func TestToPublicWordBook_omitsAdminFields(t *testing.T) {
	b := WordBook{
		Name:        "CET4",
		Description: "admin-only intro text",
		Level:       "B1",
		WordCount:   100,
		CoverURL:    "https://cdn.example/cover.png",
		IsActive:    true,
		Category:    CategoryVocabulary,
		Language:    "en",
		SourceName:  "hxword:1",
		SourceURL:   "https://example.com",
		LicenseNote: "internal",
		Author:      "hxword",
		Publisher:   "hxword",
	}
	b.ID = 42
	pub := ToPublicWordBook(b)
	if pub.ID != 42 || pub.Name != "CET4" || pub.WordCount != 100 || pub.CoverURL == "" {
		t.Fatalf("public payload missing learner fields: %+v", pub)
	}
	raw, err := json.Marshal(pub)
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	for _, forbidden := range []string{
		"description", "sourceName", "sourceUrl", "licenseNote", "author", "publisher", "admin-only",
	} {
		if strings.Contains(s, forbidden) {
			t.Fatalf("public json still contains %q: %s", forbidden, s)
		}
	}
}

func TestCreateWordBook_andGetByID(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{
		Name:        "CET4",
		Description: "desc",
		Level:       "B1",
		WordCount:   0,
		IsActive:    true,
		SortOrder:   1,
		Category:    CategoryVocabulary,
		Language:    "en",
		Difficulty:  3,
	}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatalf("create: %v", err)
	}
	if book.ID == 0 {
		t.Fatal("expected id assigned")
	}

	got, err := GetWordBookByID(db, book.ID)
	if err != nil {
		t.Fatalf("get by id: %v", err)
	}
	if got.Name != "CET4" || got.Level != "B1" || got.Category != CategoryVocabulary {
		t.Fatalf("unexpected: %+v", got)
	}

	// Not found
	if _, err := GetWordBookByID(db, 999999); err == nil {
		t.Fatal("expected error for missing book")
	}
}

func TestCreateWord_syncsCount(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	w1 := &Word{WordBookID: book.ID, Word: "apple", SortOrder: 1}
	if err := CreateWord(db, w1); err != nil {
		t.Fatalf("create word: %v", err)
	}
	w2 := &Word{WordBookID: book.ID, Word: "banana", SortOrder: 2}
	if err := CreateWord(db, w2); err != nil {
		t.Fatalf("create word: %v", err)
	}
	got, _ := GetWordBookByID(db, book.ID)
	if got.WordCount != 2 {
		t.Fatalf("expected word_count=2, got %d", got.WordCount)
	}
}

func TestBatchCreateWords_syncsCount(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	words := []Word{
		{WordBookID: book.ID, Word: "a", SortOrder: 1},
		{WordBookID: book.ID, Word: "b", SortOrder: 2},
		{WordBookID: book.ID, Word: "c", SortOrder: 3},
	}
	if err := BatchCreateWords(db, words); err != nil {
		t.Fatalf("batch create: %v", err)
	}
	got, _ := GetWordBookByID(db, book.ID)
	if got.WordCount != 3 {
		t.Fatalf("expected word_count=3, got %d", got.WordCount)
	}
	// Empty batch is noop
	if err := BatchCreateWords(db, nil); err != nil {
		t.Fatalf("empty batch should be noop: %v", err)
	}
}

func TestDeleteWord_syncsCount(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	w := &Word{WordBookID: book.ID, Word: "apple", SortOrder: 1}
	if err := CreateWord(db, w); err != nil {
		t.Fatal(err)
	}
	if err := DeleteWord(db, w.ID, "tester"); err != nil {
		t.Fatalf("delete word: %v", err)
	}
	got, _ := GetWordBookByID(db, book.ID)
	if got.WordCount != 0 {
		t.Fatalf("expected word_count=0 after delete, got %d", got.WordCount)
	}
	// Soft deleted word hidden from normal queries
	if _, err := GetWordByID(db, w.ID); err == nil {
		t.Fatal("expected deleted word hidden")
	}
}

func TestBatchDeleteWords_syncsCount(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	words := []Word{
		{WordBookID: book.ID, Word: "a", SortOrder: 1},
		{WordBookID: book.ID, Word: "b", SortOrder: 2},
	}
	if err := BatchCreateWords(db, words); err != nil {
		t.Fatal(err)
	}
	ids := []uint{words[0].ID, words[1].ID}
	if err := BatchDeleteWords(db, ids); err != nil {
		t.Fatalf("batch delete: %v", err)
	}
	got, _ := GetWordBookByID(db, book.ID)
	if got.WordCount != 0 {
		t.Fatalf("expected word_count=0, got %d", got.WordCount)
	}
	// Empty ids is noop
	if err := BatchDeleteWords(db, nil); err != nil {
		t.Fatalf("empty batch delete should be noop: %v", err)
	}
}

func TestWordExists_caseInsensitive(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	if err := CreateWord(db, &Word{WordBookID: book.ID, Word: "Apple", SortOrder: 1}); err != nil {
		t.Fatal(err)
	}
	exists, err := WordExists(db, book.ID, "apple")
	if err != nil {
		t.Fatal(err)
	}
	if !exists {
		t.Fatal("expected case-insensitive match for 'apple'")
	}
	exists2, err := WordExists(db, book.ID, "APPLE")
	if err != nil {
		t.Fatal(err)
	}
	if !exists2 {
		t.Fatal("expected case-insensitive match for 'APPLE'")
	}
	exists3, err := WordExists(db, book.ID, "banana")
	if err != nil {
		t.Fatal(err)
	}
	if exists3 {
		t.Fatal("expected 'banana' to not exist")
	}
}

func TestGetWordsByBookID_pagination(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 5; i++ {
		if err := CreateWord(db, &Word{WordBookID: book.ID, Word: string(rune('a' + i)), SortOrder: i}); err != nil {
			t.Fatal(err)
		}
	}
	// limit only
	ws, err := GetWordsByBookID(db, book.ID, 2, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(ws) != 2 {
		t.Fatalf("expected 2, got %d", len(ws))
	}
	// offset
	ws2, err := GetWordsByBookID(db, book.ID, 2, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(ws2) != 2 || ws2[0].SortOrder != 2 {
		t.Fatalf("unexpected offset result: %+v", ws2)
	}
	// no limit returns all
	ws3, err := GetWordsByBookID(db, book.ID, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(ws3) != 5 {
		t.Fatalf("expected 5, got %d", len(ws3))
	}
}

func TestListWordBooks_filterAndPagination(t *testing.T) {
	db := testWordBooksDB(t)
	books := []WordBook{
		{Name: "A", Level: "A1", IsActive: true, SortOrder: 2},
		{Name: "B", Level: "B1", IsActive: true, SortOrder: 1},
		{Name: "C", Level: "A1", IsActive: true, SortOrder: 3},
	}
	for i := range books {
		if err := CreateWordBook(db, &books[i]); err != nil {
			t.Fatal(err)
		}
	}
	// Deactivate book "B" (GORM applies default:true when IsActive is zero value,
	// so we create it active then update it to inactive).
	if err := db.Model(&WordBook{}).Where("name = ?", "B").Update("is_active", false).Error; err != nil {
		t.Fatal(err)
	}
	// All
	list, total, err := ListWordBooks(db, "", false, 1, 10)
	if err != nil {
		t.Fatal(err)
	}
	if total != 3 || len(list) != 3 {
		t.Fatalf("expected total=3 list=3, got total=%d list=%d", total, len(list))
	}
	// Sorted by sort_order ASC
	if list[0].Name != "B" {
		t.Fatalf("expected B first, got %q", list[0].Name)
	}
	// Filter by level
	list2, total2, err := ListWordBooks(db, "A1", false, 1, 10)
	if err != nil {
		t.Fatal(err)
	}
	if total2 != 2 || len(list2) != 2 {
		t.Fatalf("expected 2 A1 books, got %d", total2)
	}
	// Only active
	list3, total3, err := ListWordBooks(db, "", true, 1, 10)
	if err != nil {
		t.Fatal(err)
	}
	if total3 != 2 {
		t.Fatalf("expected 2 active, got %d", total3)
	}
	for _, b := range list3 {
		if !b.IsActive {
			t.Fatalf("expected only active, got inactive %q", b.Name)
		}
	}
	// Pagination
	list4, total4, err := ListWordBooks(db, "", false, 1, 2)
	if err != nil {
		t.Fatal(err)
	}
	if total4 != 3 || len(list4) != 2 {
		t.Fatalf("expected total=3 page=2, got total=%d list=%d", total4, len(list4))
	}
}

func TestUpdateWordBook_andSetWordBookActive(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true, Level: "A1"}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	if err := UpdateWordBook(db, book.ID, map[string]any{"name": "Updated", "level": "B2"}); err != nil {
		t.Fatalf("update: %v", err)
	}
	got, _ := GetWordBookByID(db, book.ID)
	if got.Name != "Updated" || got.Level != "B2" {
		t.Fatalf("unexpected: %+v", got)
	}
	// Set inactive
	if err := SetWordBookActive(db, book.ID, false); err != nil {
		t.Fatalf("set active: %v", err)
	}
	got2, _ := GetWordBookByID(db, book.ID)
	if got2.IsActive {
		t.Fatal("expected inactive after SetWordBookActive false")
	}
}

func TestSyncWordBookCount(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true, WordCount: 100}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	// Manually create 2 words without using CreateWord (so count stays stale)
	for i := 0; i < 2; i++ {
		if err := db.Create(&Word{WordBookID: book.ID, Word: string(rune('a' + i)), SortOrder: i}).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := SyncWordBookCount(db, book.ID); err != nil {
		t.Fatalf("sync: %v", err)
	}
	got, _ := GetWordBookByID(db, book.ID)
	if got.WordCount != 2 {
		t.Fatalf("expected synced count=2, got %d", got.WordCount)
	}
}

func TestGetWordCountByBookID(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true, WordCount: 42}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	cnt, err := GetWordCountByBookID(db, book.ID)
	if err != nil {
		t.Fatalf("get count: %v", err)
	}
	if cnt != 42 {
		t.Fatalf("expected 42, got %d", cnt)
	}
}

func TestGetWordByID_andUpdateWord(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	w := &Word{WordBookID: book.ID, Word: "apple", SortOrder: 1}
	if err := CreateWord(db, w); err != nil {
		t.Fatal(err)
	}
	got, err := GetWordByID(db, w.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Word != "apple" {
		t.Fatalf("unexpected: %+v", got)
	}
	if err := UpdateWord(db, w.ID, map[string]any{"word": "APPLE"}); err != nil {
		t.Fatalf("update: %v", err)
	}
	got2, _ := GetWordByID(db, w.ID)
	if got2.Word != "APPLE" {
		t.Fatalf("expected updated word, got %q", got2.Word)
	}
}

func TestListWords_keywordSearch(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	words := []Word{
		{WordBookID: book.ID, Word: "apple", Translation: "苹果", SortOrder: 1},
		{WordBookID: book.ID, Word: "banana", Translation: "香蕉", SortOrder: 2},
		{WordBookID: book.ID, Word: "cherry", Translation: "樱桃", SortOrder: 3},
	}
	if err := BatchCreateWords(db, words); err != nil {
		t.Fatal(err)
	}
	// No keyword -> all
	list, total, err := ListWords(db, book.ID, "", 1, 10)
	if err != nil {
		t.Fatal(err)
	}
	if total != 3 || len(list) != 3 {
		t.Fatalf("expected 3, got %d", total)
	}
	// Keyword "app"
	list2, total2, err := ListWords(db, book.ID, "app", 1, 10)
	if err != nil {
		t.Fatal(err)
	}
	if total2 != 1 || list2[0].Word != "apple" {
		t.Fatalf("expected apple, got %+v", list2)
	}
	// Keyword matches translation
	list3, total3, err := ListWords(db, book.ID, "香蕉", 1, 10)
	if err != nil {
		t.Fatal(err)
	}
	if total3 != 1 || list3[0].Word != "banana" {
		t.Fatalf("expected banana via translation, got %+v", list3)
	}
}

func TestGetAllWords_andGetWordsByIDs(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	words := []Word{
		{WordBookID: book.ID, Word: "a", SortOrder: 2},
		{WordBookID: book.ID, Word: "b", SortOrder: 1},
	}
	if err := BatchCreateWords(db, words); err != nil {
		t.Fatal(err)
	}
	all, err := GetAllWords(db, book.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("expected 2, got %d", len(all))
	}
	// Ordered by sort_order ASC
	if all[0].Word != "b" {
		t.Fatalf("expected b first (sort_order=1), got %q", all[0].Word)
	}

	// GetWordsByIDs
	ids := []uint{words[0].ID, words[1].ID}
	got, err := GetWordsByIDs(db, ids)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2, got %d", len(got))
	}
	// Empty ids -> nil
	got2, err := GetWordsByIDs(db, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got2 != nil {
		t.Fatalf("expected nil for empty ids, got %+v", got2)
	}
}

func TestGetWordIDsByBookID(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	if err := BatchCreateWords(db, []Word{
		{WordBookID: book.ID, Word: "a", SortOrder: 2},
		{WordBookID: book.ID, Word: "b", SortOrder: 1},
	}); err != nil {
		t.Fatal(err)
	}
	ids, err := GetWordIDsByBookID(db, book.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 2 {
		t.Fatalf("expected 2 ids, got %d", len(ids))
	}
	// Ordered by sort_order ASC so 'b' (sort_order=1) first
	first, _ := GetWordByID(db, ids[0])
	if first.Word != "b" {
		t.Fatalf("expected b first, got %q", first.Word)
	}
}

func TestGetNextWordAfterCursor(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	if err := BatchCreateWords(db, []Word{
		{WordBookID: book.ID, Word: "a", SortOrder: 1},
		{WordBookID: book.ID, Word: "b", SortOrder: 2},
		{WordBookID: book.ID, Word: "c", SortOrder: 3},
	}); err != nil {
		t.Fatal(err)
	}
	// No cursor -> first word
	w, err := GetNextWordAfterCursor(db, book.ID, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if w.Word != "a" {
		t.Fatalf("expected a, got %q", w.Word)
	}
	// Cursor after 'a' -> 'b'
	w2, err := GetNextWordAfterCursor(db, book.ID, w.SortOrder, w.ID)
	if err != nil {
		t.Fatal(err)
	}
	if w2.Word != "b" {
		t.Fatalf("expected b, got %q", w2.Word)
	}
}

func TestWordBookProgress_CRUD(t *testing.T) {
	db := testWordBooksDB(t)
	p := &WordBookProgress{
		UserID:       1,
		WordBookID:   2,
		TotalWords:   100,
		LearnedWords: 50,
	}
	if err := db.Create(p).Error; err != nil {
		t.Fatalf("create: %v", err)
	}
	got, err := GetWordProgress(db, 1, 2)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.TotalWords != 100 || got.LearnedWords != 50 {
		t.Fatalf("unexpected: %+v", got)
	}
	// Update
	if err := UpdateWordProgress(db, 1, 2, 100, 75, 20); err != nil {
		t.Fatalf("update: %v", err)
	}
	got2, _ := GetWordProgress(db, 1, 2)
	if got2.LearnedWords != 75 || got2.MasteredWords != 20 {
		t.Fatalf("unexpected after update: %+v", got2)
	}
	if got2.Progress != 75.0 {
		t.Fatalf("expected progress=75.0, got %f", got2.Progress)
	}
	// totalWords=0 -> progress 0
	if err := UpdateWordProgress(db, 1, 2, 0, 0, 0); err != nil {
		t.Fatal(err)
	}
	got3, _ := GetWordProgress(db, 1, 2)
	if got3.Progress != 0 {
		t.Fatalf("expected progress=0, got %f", got3.Progress)
	}
}

func TestUserWordProgress_createAndUpdate(t *testing.T) {
	db := testWordBooksDB(t)
	// First update creates the record (correct)
	if err := UpdateUserWordProgress(db, 1, 10, true, 5); err != nil {
		t.Fatalf("create via update: %v", err)
	}
	got, err := GetUserWordProgress(db, 1, 10)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.StudyCount != 1 || got.CorrectCount != 1 || got.WrongCount != 0 {
		t.Fatalf("unexpected: %+v", got)
	}
	if got.StudyTime != 5 {
		t.Fatalf("expected study time 5, got %d", got.StudyTime)
	}

	// Second update (wrong) increments wrong count
	if err := UpdateUserWordProgress(db, 1, 10, false, 3); err != nil {
		t.Fatalf("update: %v", err)
	}
	got2, _ := GetUserWordProgress(db, 1, 10)
	if got2.StudyCount != 2 || got2.WrongCount != 1 {
		t.Fatalf("unexpected after wrong: %+v", got2)
	}
	if got2.StudyTime != 8 {
		t.Fatalf("expected study time 8, got %d", got2.StudyTime)
	}
}

func TestListWordBooksWithSearch(t *testing.T) {
	db := testWordBooksDB(t)
	books := []WordBook{
		{Name: "小学英语", Level: "A1", Category: CategoryVocabulary, IsActive: true, SortOrder: 1, OwnerUserID: 0},
		{Name: "初中英语", Level: "A2", Category: CategoryVocabulary, IsActive: true, SortOrder: 2, OwnerUserID: 0},
		{Name: "My Custom", Level: "B1", Category: CategoryVocabulary, IsActive: true, SortOrder: 3, OwnerUserID: 5},
	}
	for i := range books {
		if err := CreateWordBook(db, &books[i]); err != nil {
			t.Fatal(err)
		}
	}
	// Keyword search
	list, total, err := ListWordBooksWithSearch(db, "小学", "", "", "", false, 1, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || list[0].Name != "小学英语" {
		t.Fatalf("expected 小学英语, got %+v total=%d", list, total)
	}
	// Default group excludes custom (owner_user_id=0 only)
	list2, total2, err := ListWordBooksWithSearch(db, "", "", "", "", false, 1, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if total2 != 2 {
		t.Fatalf("expected 2 system books, got %d", total2)
	}
	for _, b := range list2 {
		if b.OwnerUserID != 0 {
			t.Fatalf("expected only system books, got custom %q", b.Name)
		}
	}
	// group=custom with ownerUserID returns only that user's custom books
	list3, total3, err := ListWordBooksWithSearch(db, "", "", "", "custom", false, 1, 10, 5)
	if err != nil {
		t.Fatal(err)
	}
	if total3 != 1 || list3[0].Name != "My Custom" {
		t.Fatalf("expected My Custom, got %+v total=%d", list3, total3)
	}
	// group=custom with ownerUserID=0 returns empty
	_, total4, err := ListWordBooksWithSearch(db, "", "", "", "custom", false, 1, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if total4 != 0 {
		t.Fatalf("expected 0 for custom without owner, got %d", total4)
	}
	// onlyActive filter
	_, total5, err := ListWordBooksWithSearch(db, "", "", "", "", true, 1, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if total5 != 2 {
		t.Fatalf("expected 2 active system, got %d", total5)
	}
}

func TestGroupPatterns(t *testing.T) {
	cases := []struct {
		group string
		want  int
	}{
		{"primary", 7},
		{"middle", 5},
		{"high", 4},
		{"cet4", 4},
		{"cet6", 4},
		{"kaoyan", 1},
		{"abroad", 6},
		{"tem", 4},
		{"textbook", 15},
		{"unknown", 0},
	}
	for _, tc := range cases {
		got := GroupPatterns(tc.group)
		if len(got) != tc.want {
			t.Fatalf("GroupPatterns(%q) returned %d patterns, want %d", tc.group, len(got), tc.want)
		}
	}
}

func TestGroupNames(t *testing.T) {
	names := GroupNames()
	if len(names) == 0 {
		t.Fatal("expected group names")
	}
	// First entry should be "全部" with empty key
	if names[0]["key"] != "" || names[0]["label"] != "全部" {
		t.Fatalf("expected first entry 全部, got %+v", names[0])
	}
	// Ensure keys are unique
	seen := map[string]bool{}
	for _, n := range names {
		if seen[n["key"]] {
			t.Fatalf("duplicate group key: %q", n["key"])
		}
		seen[n["key"]] = true
	}
}

func TestListWordsLite_andGetWordLiteByID(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	if err := BatchCreateWords(db, []Word{
		{WordBookID: book.ID, Word: "apple", Translation: "苹果", SortOrder: 1},
		{WordBookID: book.ID, Word: "banana", Translation: "香蕉", SortOrder: 2},
	}); err != nil {
		t.Fatal(err)
	}
	list, total, err := ListWordsLite(db, book.ID, "app", 1, 10)
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || list[0].Word != "apple" {
		t.Fatalf("expected apple, got %+v total=%d", list, total)
	}
	// Get by ID
	got, err := GetWordLiteByID(db, list[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Word != "apple" {
		t.Fatalf("expected apple, got %q", got.Word)
	}
}

func TestGetWordsLiteByIDs(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	words := []Word{
		{WordBookID: book.ID, Word: "a", SortOrder: 2},
		{WordBookID: book.ID, Word: "b", SortOrder: 1},
	}
	if err := BatchCreateWords(db, words); err != nil {
		t.Fatal(err)
	}
	got, err := GetWordsLiteByIDs(db, []uint{words[0].ID, words[1].ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2, got %d", len(got))
	}
	// Ordered by sort_order ASC
	if got[0].Word != "b" {
		t.Fatalf("expected b first, got %q", got[0].Word)
	}
	// Empty ids -> nil
	got2, err := GetWordsLiteByIDs(db, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got2 != nil {
		t.Fatalf("expected nil for empty ids, got %+v", got2)
	}
}

func TestDeleteWordBook_hardDeletesChildRecords(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	w := &Word{WordBookID: book.ID, Word: "a", SortOrder: 1}
	if err := CreateWord(db, w); err != nil {
		t.Fatal(err)
	}
	uwb := &UserWordBook{UserID: 1, WordBookID: book.ID, Status: "active"}
	if err := db.Create(uwb).Error; err != nil {
		t.Fatal(err)
	}
	progress := &WordBookProgress{UserID: 1, WordBookID: book.ID, TotalWords: 1}
	if err := db.Create(progress).Error; err != nil {
		t.Fatal(err)
	}

	if err := DeleteWordBook(db, book.ID, "admin"); err != nil {
		t.Fatalf("delete book: %v", err)
	}
	// Word records are hard-deleted by the cascade (Unscoped delete).
	var wordCount int64
	db.Unscoped().Model(&Word{}).Where("word_book_id = ?", book.ID).Count(&wordCount)
	if wordCount != 0 {
		t.Fatalf("expected words hard-deleted, got %d", wordCount)
	}
}

func TestListStudyWordsLite_excludesLearned(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	words := []Word{
		{WordBookID: book.ID, Word: "a", SortOrder: 1},
		{WordBookID: book.ID, Word: "b", SortOrder: 2},
		{WordBookID: book.ID, Word: "c", SortOrder: 3},
	}
	if err := BatchCreateWords(db, words); err != nil {
		t.Fatal(err)
	}
	// Mark the first word ('a') as learned, using its real (snowflake) ID.
	now := time.Now()
	if err := db.Create(&UserWordState{
		UserID: 1, WordID: words[0].ID, WordBookID: book.ID, LearnStatus: "learned", FirstLearnedAt: &now,
	}).Error; err != nil {
		t.Fatal(err)
	}
	// Non-shuffle: should return b and c only
	list, total, err := ListStudyWordsLite(db, book.ID, 1, 1, 10, false, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 2 {
		t.Fatalf("expected total=2 (excluding learned), got %d", total)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2 words, got %d", len(list))
	}
	for _, w := range list {
		if w.Word == "a" {
			t.Fatal("learned word 'a' should be excluded")
		}
	}
}

func TestListStudyWordsLite_emptyAndShuffle(t *testing.T) {
	db := testWordBooksDB(t)
	book := &WordBook{Name: "B", IsActive: true}
	if err := CreateWordBook(db, book); err != nil {
		t.Fatal(err)
	}
	// No words -> empty
	list, total, err := ListStudyWordsLite(db, book.ID, 1, 1, 10, false, 0)
	if err != nil {
		t.Fatal(err)
	}
	if total != 0 || len(list) != 0 {
		t.Fatalf("expected empty, got total=%d list=%d", total, len(list))
	}

	// Add words and shuffle with seed -> stable across pages
	if err := BatchCreateWords(db, []Word{
		{WordBookID: book.ID, Word: "a", SortOrder: 1},
		{WordBookID: book.ID, Word: "b", SortOrder: 2},
		{WordBookID: book.ID, Word: "c", SortOrder: 3},
		{WordBookID: book.ID, Word: "d", SortOrder: 4},
	}); err != nil {
		t.Fatal(err)
	}
	page1, _, err := ListStudyWordsLite(db, book.ID, 1, 1, 2, true, 12345)
	if err != nil {
		t.Fatalf("shuffle page1: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("expected 2 on page1, got %d", len(page1))
	}
	page2, _, err := ListStudyWordsLite(db, book.ID, 1, 2, 2, true, 12345)
	if err != nil {
		t.Fatalf("shuffle page2: %v", err)
	}
	if len(page2) != 2 {
		t.Fatalf("expected 2 on page2, got %d", len(page2))
	}
	// Same seed -> page1 contains the same elements as first call
	page1Again, _, err := ListStudyWordsLite(db, book.ID, 1, 1, 2, true, 12345)
	if err != nil {
		t.Fatal(err)
	}
	if page1[0].ID != page1Again[0].ID || page1[1].ID != page1Again[1].ID {
		t.Fatalf("expected same seed to produce same order: %+v vs %+v", page1, page1Again)
	}
}
