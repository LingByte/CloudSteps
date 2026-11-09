package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	"github.com/LingByte/CloudStepsGo/internal/models"
	lbconstants "github.com/LingByte/ling-base/common/constants"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestVocabSubmit_boundToStudentAppearsInStudentRecords(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := vocabStudentBindDB(t)
	teacher := mustCreateTeacher(t, db, "vt-coach")
	student := mustCreateStudent(t, db, "vt-stu")
	other := mustCreateStudent(t, db, "vt-other")
	mustCreateQuotaPair(t, db, teacher.ID, student.ID)
	mustCreateQuotaPair(t, db, teacher.ID, other.ID)
	q := mustCreateVocabQuestion(t, db)

	submitVocabAs(t, db, teacher, q, student.ID, q.CorrectAnswer)

	list := vocabRecordsForStudent(t, db, teacher, student.ID)
	if list.Stats.Vocab != 1 || len(list.List) != 1 {
		t.Fatalf("student records = vocab %d list %d, want 1 bound test", list.Stats.Vocab, len(list.List))
	}
	if list.List[0].Kind != "vocab_test" || list.List[0].VocabTest == nil {
		t.Fatalf("want vocab_test item, got %+v", list.List[0])
	}
	if list.List[0].VocabTest.StudentID != student.ID {
		t.Fatalf("record studentId=%d, want %d", list.List[0].VocabTest.StudentID, student.ID)
	}
	if list.List[0].VocabTest.CorrectCount != 1 {
		t.Fatalf("correctCount=%d, want 1", list.List[0].VocabTest.CorrectCount)
	}

	otherList := vocabRecordsForStudent(t, db, teacher, other.ID)
	if otherList.Stats.Vocab != 0 || len(otherList.List) != 0 {
		t.Fatalf("unrelated student got vocab %d list %d", otherList.Stats.Vocab, len(otherList.List))
	}
}

func TestVocabSubmit_rejectsStudentWithoutCoachingPair(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := vocabStudentBindDB(t)
	teacher := mustCreateTeacher(t, db, "vt-coach-b")
	stranger := mustCreateStudent(t, db, "vt-stranger")
	q := mustCreateVocabQuestion(t, db)

	w := submitVocabRaw(t, db, teacher, q, stranger.ID, q.CorrectAnswer)
	// ling-base response 层始终返回 HTTP 200，业务错误码在 envelope.code 中
	var envelope struct {
		Code  int    `json:"code"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Error != "FORBIDDEN" {
		t.Fatalf("status %d body %s, want FORBIDDEN business error", w.Code, w.Body.String())
	}
}

func vocabStudentBindDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.StudentTeacherCoachingQuota{},
		&models.VocabTestQuestion{},
		&models.VocabTestRecord{},
		&models.CoachingSessionRecord{},
		&models.StudySession{},
	); err != nil {
		t.Fatal(err)
	}
	return db
}

func mustCreateQuotaPair(t *testing.T, db *gorm.DB, teacherID, studentID uint) {
	t.Helper()
	q := models.StudentTeacherCoachingQuota{
		TeacherID:        teacherID,
		StudentID:        studentID,
		RemainingLessons: 1,
	}
	if err := db.Create(&q).Error; err != nil {
		t.Fatal(err)
	}
}

func mustCreateVocabQuestion(t *testing.T, db *gorm.DB) models.VocabTestQuestion {
	t.Helper()
	q := models.VocabTestQuestion{
		Word:            "apple",
		Options:         `["苹果","香蕉","桌子","椅子"]`,
		CorrectAnswer:   "苹果",
		Level:           "A1",
		DifficultyScore: 1,
	}
	if err := db.Create(&q).Error; err != nil {
		t.Fatal(err)
	}
	return q
}

func submitVocabAs(t *testing.T, db *gorm.DB, user *models.User, q models.VocabTestQuestion, studentID uint, answer string) {
	t.Helper()
	w := submitVocabRaw(t, db, user, q, studentID, answer)
	if w.Code != http.StatusOK {
		t.Fatalf("submit status %d body %s", w.Code, w.Body.String())
	}
	var envelope struct {
		Code int `json:"code"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Code != 200 {
		t.Fatalf("submit code %d body %s", envelope.Code, w.Body.String())
	}
}

func submitVocabRaw(t *testing.T, db *gorm.DB, user *models.User, q models.VocabTestQuestion, studentID uint, answer string) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		// studentId 与线上一致：雪花 ID 以字符串传递，避免 JSON number 精度/类型问题
		"studentId": fmt.Sprintf("%d", studentID),
		"answers": []map[string]any{{
			"questionId": q.ID,
			"answer":     answer,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest(http.MethodPost, "/vocab/submit", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req
	c.Set(lbconstants.DbField, db)
	c.Set(constants.UserField, user)
	h := &Handlers{}
	h.handleVocabTestSubmit(c)
	return w
}

type vocabStudentList struct {
	List []struct {
		Kind      string `json:"kind"`
		VocabTest *struct {
			StudentID    uint `json:"studentId"`
			CorrectCount int  `json:"correctCount"`
		} `json:"vocabTest"`
	} `json:"list"`
	Stats struct {
		Vocab int `json:"vocab"`
	} `json:"stats"`
}

func vocabRecordsForStudent(t *testing.T, db *gorm.DB, teacher *models.User, studentID uint) vocabStudentList {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest(
		http.MethodGet,
		fmt.Sprintf("/teacher/coaching/students/%d/vocab-records?q=vocab_test&limit=50", studentID),
		nil,
	)
	c.Request = req
	c.Params = gin.Params{{Key: "studentId", Value: fmt.Sprintf("%d", studentID)}}
	c.Set(lbconstants.DbField, db)
	c.Set(constants.UserField, teacher)
	h := &Handlers{}
	h.coachingTeacherStudentVocabRecords(c)
	if w.Code != http.StatusOK {
		t.Fatalf("list status %d body %s", w.Code, w.Body.String())
	}
	var envelope struct {
		Code int              `json:"code"`
		Data vocabStudentList `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Code != 200 {
		t.Fatalf("list code %d body %s", envelope.Code, w.Body.String())
	}
	return envelope.Data
}
