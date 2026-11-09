package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	auth "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/ling-base/apidocs/humax"
	lbconstants "github.com/LingByte/ling-base/common/constants"

	"io"
	"math"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/stores"
	"github.com/LingByte/ling-base/common/logger"
	lbresponse "github.com/LingByte/ling-base/common/response"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

func (h *Handlers) registerVocabTestRoutes(r *humax.Group) {
	vt := r.Group("vocab")
	{
		// 用户端（需登录）
		user := vt.Group("")
		user.Use(auth.Required)
		user.GET("/start", h.handleVocabTestStart)
		user.GET("/pool-revision", h.handleVocabPoolRevision)
		user.POST("/next", h.handleVocabTestNext)
		user.POST("/submit", h.handleVocabTestSubmit)
		user.GET("/result", h.handleVocabTestResult)
		user.GET("/records", h.handleVocabTestRecords)
		user.GET("/records/:id", h.handleVocabTestRecordDetail)

		// 管理端（需登录 + isStaff）
		admin := vt.Group("")
		admin.Use(auth.Required, auth.AdminRequired)
		admin.POST("/questions", h.handleCreateQuestion)
		admin.GET("/questions", h.handleListQuestions)
		admin.PUT("/questions/:id", h.handleUpdateQuestion)
		admin.DELETE("/questions/:id", h.handleDeleteQuestion)
		admin.POST("/questions/batch", h.handleBatchCreateQuestions)
		admin.POST("/questions/purge-bad-audio", h.handlePurgeBadAudio)
		admin.POST("/questions/purge-all-audio", h.handlePurgeAllAudio)
		admin.GET("/questions/purge-all-audio", h.handlePurgeAllAudioStatus)
		admin.POST("/questions/batch-audio", h.handleBatchAudio)
		admin.GET("/questions/batch-audio", h.handleBatchAudioStatus)
		admin.POST("/questions/batch-audio/stop", h.handleBatchAudioStop)
	}
}

// estimateLevelWeighted 使用「天花板 + 插值」算法估算用户等级和词汇量。
//
// 核心思路（适配自适应阶梯测试）：
//  1. 计算每个等级的 Beta 平滑正确率
//  2. 天花板 = 正确率 ≥ 55% 且样本 ≥3 的最高等级（用户"够得着"的最高级别）
//  3. 整体正确率封顶：整体 <50% 天花板≤B1，<60% 天花板≤B2
//  4. 在天花板等级的词汇量区间内，用天花板正确率(70%) + 下一级正确率(30%) 插值
//
// 这比加权平均更准确，因为它直接定位用户的等级边界，
// 而不是把所有等级的正确率混在一起做平均（会被低等级高正确率拉高）。
func estimateLevelWeighted(correctW, totalW map[string]float64, correctAll, totalAll float64) (string, int) {
	levels := []string{"A1", "A2", "B1", "B2", "C1"}
	vocabMap := map[string]int{
		"A1": 300,
		"A2": 1000,
		"B1": 2500,
		"B2": 4000,
		"C1": 6000,
	}
	vocabCeiling := 8000 // C1 以上的词汇量上限

	// 1. 计算每级的 Beta(1,1) 平滑正确率 + 记录样本数
	rates := map[string]float64{}
	samples := map[string]float64{}
	hasData := false
	for _, lv := range levels {
		wT := totalW[lv]
		if wT <= 0 {
			continue
		}
		hasData = true
		wC := correctW[lv]
		rates[lv] = (wC + 1.0) / (wT + 2.0) // Beta(1,1) 平滑
		samples[lv] = wT
	}

	// 无数据 → A1
	if !hasData {
		return "A1", 300
	}

	// 整体正确率（用于封顶）
	overallRate := 0.0
	if totalAll > 0 {
		overallRate = correctAll / totalAll
	}

	// 2. 找天花板：正确率 ≥ 0.55 且样本 ≥3 的最高等级
	ceilingIdx := -1
	for i, lv := range levels {
		if samples[lv] < 3 {
			continue // 样本不足，不可靠
		}
		if rates[lv] >= 0.55 {
			ceilingIdx = i
		}
	}

	// 3. 整体正确率封顶
	// 整体 <50% → 天花板不超过 B1（index 2）
	// 整体 <60% → 天花板不超过 B2（index 3）
	if ceilingIdx > 2 && overallRate < 0.5 {
		ceilingIdx = 2
	}
	if ceilingIdx > 3 && overallRate < 0.6 {
		ceilingIdx = 3
	}

	// 4. 没有合格天花板 → A1（按整体正确率给部分 credit）
	if ceilingIdx == -1 {
		vocab := 200 + int(float64(300-200)*overallRate)
		return "A1", vocab
	}

	ceilingLevel := levels[ceilingIdx]
	ceilingRate := rates[ceilingLevel]

	// 5. 下一级正确率（用于判断用户是否接近升级）
	var nextRate float64
	nextVocab := vocabCeiling
	if ceilingIdx+1 < len(levels) {
		nextLevel := levels[ceilingIdx+1]
		nextRate = rates[nextLevel] // 可能没有数据 → 0
		nextVocab = vocabMap[nextLevel]
	}

	// 6. 在天花板等级内插值词汇量
	// position = 70% 天花板正确率 + 30% 下一级正确率
	position := ceilingRate*0.7 + nextRate*0.3
	if position > 1.0 {
		position = 1.0
	}

	baseVocab := vocabMap[ceilingLevel]
	estimatedVocab := baseVocab + int(float64(nextVocab-baseVocab)*position)

	// 保底：不低于当前等级基数
	if estimatedVocab < baseVocab {
		estimatedVocab = baseVocab
	}

	return ceilingLevel, estimatedVocab
}

// vocabTestOwnedByStudent 老师代测（student_id）+ 学员自测（user_id 且未绑定）。
func vocabTestOwnedByStudent(studentID uint) func(*gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		return db.Where("student_id = ? OR (student_id = 0 AND user_id = ?)", studentID, studentID)
	}
}

func vocabTestsOwnedByStudents(studentIDs []uint) func(*gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		return db.Where("student_id IN ? OR (student_id = 0 AND user_id IN ?)", studentIDs, studentIDs)
	}
}

func resolveVocabTestStudentID(db *gorm.DB, user *models.User, requested uint) (uint, error) {
	if user == nil {
		return 0, errors.New("未登录")
	}
	if requested == 0 {
		if user.IsStudent() {
			return user.ID, nil
		}
		return 0, nil
	}
	if requested == user.ID {
		return requested, nil
	}
	if user.IsStudent() {
		return 0, fmt.Errorf("coaching.no_student_access")
	}
	if err := coachingTeacherHasStudentPair(db, user.ID, requested); err != nil {
		return 0, fmt.Errorf("coaching.no_student_access")
	}
	return requested, nil
}

func failVocabTestAccess(c *gin.Context, err error) {
	if err == nil {
		response.FailI18n(c, "common.forbidden", nil)
		return
	}
	msg := err.Error()
	switch msg {
	case "未登录":
		response.FailI18n(c, "common.login_required", nil)
	case "coaching.no_student_access", "无权查看该学员或尚未建立陪练关系", "无权为其他学员提交测评":
		// FailI18n 对未知 key 默认 INTERNAL；无学员权限应返回 FORBIDDEN
		response.FailAppError(c, lbresponse.NewI18n(lbresponse.CodeForbidden, "coaching.no_student_access"))
	default:
		response.AbortWithStatusJSON(c, http.StatusForbidden, err)
	}
}

func clearLatestVocabTest(tx *gorm.DB, userID, studentID uint) error {
	q := tx.Model(&models.VocabTestRecord{}).Where("is_latest = ?", true)
	if studentID > 0 {
		q = q.Where("student_id = ?", studentID)
	} else {
		q = q.Where("user_id = ? AND student_id = 0", userID)
	}
	return q.Update("is_latest", false).Error
}

func nextLevelOf(level string) string {
	next := map[string]string{
		"A1": "A2",
		"A2": "B1",
		"B1": "B2",
		"B2": "C1",
		"C1": "C1",
	}
	return next[level]
}

// handleVocabTestStart GET /vocab-test/start
func (h *Handlers) handleVocabTestStart(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)

	// 每个等级各取 8 题，共 40 题（A1×8 + A2×8 + B1×8 + B2×8 + C1×8）
	levels := []string{"A1", "A2", "B1", "B2", "C1"}
	var allQuestions []models.VocabTestQuestion

	// 尽量避免重复：排除用户上一份测试里出现过的题目
	excludeIDs := make([]uint, 0)
	if user != nil {
		var record models.VocabTestRecord
		if err := db.Where("user_id = ? AND is_latest = ?", user.ID, true).First(&record).Error; err == nil {
			excludeIDs = append(excludeIDs, extractAnsweredQuestionIDs(record.Answers)...)
		}
	}

	pool, err := getVocabPoolByLevel(db)
	if err != nil {
		response.Fail(c, "加载题库失败", err)
		return
	}

	for _, lv := range levels {
		qs, err := pickBalancedRandomQuestionsFromPool(pool, lv, 8, excludeIDs)
		if err != nil {
			response.Fail(c, "题库暂无题目，请联系管理员添加", nil)
			return
		}
		allQuestions = append(allQuestions, qs...)
	}

	if len(allQuestions) == 0 {
		response.Fail(c, "题库暂无题目，请联系管理员添加", nil)
		return
	}

	response.SuccessMsg(c, "success", gin.H{
		"questions":     allQuestions,
		"total":         len(allQuestions),
		"mode":          "batch", // 批量模式：前端一次拿到所有题，本地作答后统一提交
		"poolRevision":  getVocabPoolRevision(),
	})
}

// handleVocabPoolRevision GET /vocab/pool-revision
// 返回服务端测评题库内存缓存版本号；Admin 增删改题目后会递增，供前端判断是否需丢弃本地预拉缓存。
func (h *Handlers) handleVocabPoolRevision(c *gin.Context) {
	response.SuccessMsg(c, "success", gin.H{
		"poolRevision": getVocabPoolRevision(),
	})
}

// handleVocabTestNext POST /vocab-test/next
// 自适应模式：前端每答一题后调此接口，后端返回下一题
// body: { lastQuestionId, correct: bool, currentDifficultyScore: int }
func (h *Handlers) handleVocabTestNext(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)

	var body struct {
		LastQuestionID         uint   `json:"lastQuestionId"`
		Correct                bool   `json:"correct"`
		CurrentDifficultyScore int    `json:"currentDifficultyScore"`
		AnsweredIDs            []uint `json:"answeredIds"` // 已答过的题ID，避免重复
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, errors.New("参数错误"))
		return
	}

	// 自适应调整难度分
	nextScore := body.CurrentDifficultyScore
	if nextScore <= 0 {
		nextScore = 3
	}
	// 第一次取题（lastQuestionId=0）不做“对/错”驱动的难度调整
	if body.LastQuestionID > 0 {
		if body.Correct {
			nextScore += 1
		} else {
			nextScore -= 1
			if nextScore < 1 {
				nextScore = 1
			}
		}
	}

	currentLevel := ""
	if body.LastQuestionID > 0 {
		var last models.VocabTestQuestion
		if err := db.Select("id, level").First(&last, body.LastQuestionID).Error; err == nil {
			currentLevel = strings.TrimSpace(last.Level)
		}
	}
	if currentLevel == "" && user != nil {
		var record models.VocabTestRecord
		if err := db.Select("estimated_level").Where("user_id = ? AND is_latest = ?", user.ID, true).First(&record).Error; err == nil {
			currentLevel = strings.TrimSpace(record.EstimatedLevel)
		}
	}
	if currentLevel == "" {
		currentLevel = "A1"
	}

	// 根据答对/答错尝试上探/下探等级（但只在相邻档位内移动）
	targetLevel := currentLevel
	if body.Correct {
		// 难度已经逐步上升时允许上探一档
		if nextScore >= 4 {
			targetLevel = nextLevelOf(currentLevel)
		}
	} else {
		// 连续错误会导致 nextScore 下降，适当下探一档
		if nextScore <= 2 {
			if prev := prevLevelOf(currentLevel); prev != "" {
				targetLevel = prev
			}
		}
	}

	// 找最接近目标难度且未答过的题（优先 targetLevel，其次 currentLevel，其次相邻等级兜底）
	q := db.Model(&models.VocabTestQuestion{})
	if len(body.AnsweredIDs) > 0 {
		q = q.Where("id NOT IN ?", body.AnsweredIDs)
	}
	levelsToTry := []string{targetLevel}
	if currentLevel != targetLevel {
		levelsToTry = append(levelsToTry, currentLevel)
	}
	// 兜底：再试相邻等级
	if nxt := nextLevelOf(targetLevel); nxt != "" && nxt != targetLevel {
		levelsToTry = append(levelsToTry, nxt)
	}
	if prv := prevLevelOf(targetLevel); prv != "" {
		levelsToTry = append(levelsToTry, prv)
	}

	var next models.VocabTestQuestion
	for _, lv := range levelsToTry {
		// MySQL: 使用 ABS(difficulty_score - ?) 做距离排序，RAND() 打散相同距离
		err := q.Where("level = ?", lv).
			Order(gorm.Expr("ABS(difficulty_score - ?) ASC, RAND()", nextScore)).
			First(&next).Error
		if err == nil && next.ID > 0 {
			currentLevel = lv
			break
		}
		// 某些情况下 answeredIds 为空，但题库也可能空，继续尝试下一等级
		continue
	}

	if next.ID == 0 {
		// 兜底：如果按等级/难度找不到题，再尝试从全题库中取一题（避免直接结束）
		// 用 id 排序 + 随机 offset 替代 ORDER BY RAND()（避免全表扫描）
		fallbackQ := db.Model(&models.VocabTestQuestion{})
		if len(body.AnsweredIDs) > 0 {
			fallbackQ = fallbackQ.Where("id NOT IN ?", body.AnsweredIDs)
		}
		var fallbackCount int64
		fallbackQ.Count(&fallbackCount)
		if fallbackCount > 0 {
			randomOffset := int(fallbackCount) // 简单取最后一个，避免 RAND() 全表扫描
			if randomOffset > 0 {
				randomOffset = randomOffset - 1
			}
			if err := fallbackQ.Order("id ASC").Offset(randomOffset).First(&next).Error; err == nil && next.ID > 0 {
				currentLevel = strings.TrimSpace(next.Level)
				if currentLevel == "" {
					currentLevel = "A1"
				}
				response.SuccessMsg(c, "success", gin.H{
					"question":               next,
					"currentDifficultyScore": nextScore,
					"currentLevel":           currentLevel,
					"finished":               false,
				})
				return
			}
		}

		response.SuccessMsg(c, "测试完成", gin.H{"finished": true})
		return
	}
	response.SuccessMsg(c, "success", gin.H{
		"question":               next,
		"currentDifficultyScore": nextScore,
		"currentLevel":           currentLevel,
		"finished":               false,
	})
}

// handleVocabTestSubmit POST /vocab-test/submit
func (h *Handlers) handleVocabTestSubmit(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)

	var body struct {
		StudentID string `json:"studentId"`
		Answers   []struct {
			QuestionID json.Number `json:"questionId"`
			Answer     string      `json:"answer"`
		} `json:"answers" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		logger.Error("vocab submit bind error", zap.Error(err))
		response.FailI18n(c, "common.invalid_params", err)
		return
	}

	if user == nil {
		response.FailI18n(c, "common.login_required", nil)
		return
	}
	var requested uint
	if raw := strings.TrimSpace(body.StudentID); raw != "" {
		id, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || id == 0 {
			response.FailI18n(c, "common.invalid_params", nil)
			return
		}
		requested = uint(id)
	}
	studentID, err := resolveVocabTestStudentID(db, user, requested)
	if err != nil {
		logger.Error("vocab submit resolve student error", zap.Error(err), zap.String("studentId", body.StudentID))
		failVocabTestAccess(c, err)
		return
	}

	if len(body.Answers) == 0 {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, errors.New("答案不能为空"))
		return
	}

	// 批量查题目
	ids := make([]uint, 0, len(body.Answers))
	for _, a := range body.Answers {
		u, err := a.QuestionID.Int64()
		if err != nil {
			logger.Error("vocab submit invalid question id", zap.String("id", string(a.QuestionID)), zap.Error(err))
			response.AbortWithStatusJSON(c, http.StatusBadRequest, errors.New("存在无效题目ID"))
			return
		}
		ids = append(ids, uint(u))
	}
	var questions []models.VocabTestQuestion
	db.Where("id IN ?", ids).Find(&questions)
	if len(questions) != len(ids) {
		logger.Error("vocab submit question count mismatch", zap.Int("expected", len(ids)), zap.Int("got", len(questions)))
		response.AbortWithStatusJSON(c, http.StatusBadRequest, errors.New("存在无效题目ID"))
		return
	}

	qMap := make(map[uint]models.VocabTestQuestion, len(questions))
	for _, q := range questions {
		qMap[q.ID] = q
	}

	// 按等级统计正确率
	levelCorrect := map[string]int{}
	levelTotal := map[string]int{}
	correctCount := 0
	answerDetails := make([]map[string]any, 0, len(body.Answers))

	weightedCorrect := map[string]float64{}
	weightedTotal := map[string]float64{}
	weightedCorrectAll := 0.0
	weightedTotalAll := 0.0

	for _, a := range body.Answers {
		qidU, _ := a.QuestionID.Int64()
		q, ok := qMap[uint(qidU)]
		if !ok {
			response.AbortWithStatusJSON(c, http.StatusBadRequest, errors.New("存在无效题目ID"))
			return
		}
		ans := strings.TrimSpace(a.Answer)
		correctAns := strings.TrimSpace(q.CorrectAnswer)
		isCorrect := ans == correctAns
		levelTotal[q.Level]++
		w := questionWeight(q.DifficultyScore)
		weightedTotal[q.Level] += w
		weightedTotalAll += w
		if isCorrect {
			correctCount++
			levelCorrect[q.Level]++
			weightedCorrect[q.Level] += w
			weightedCorrectAll += w
		}
		answerDetails = append(answerDetails, map[string]any{
			"questionId": qidU,
			"answer":     ans,
			"correct":    isCorrect,
			"level":      q.Level,
		})
	}
	estimatedLevel, estimatedVocab := estimateLevelWeighted(weightedCorrect, weightedTotal, weightedCorrectAll, weightedTotalAll)
	answersJSON, _ := json.Marshal(answerDetails)
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := clearLatestVocabTest(tx, user.ID, studentID); err != nil {
			return err
		}

		now := time.Now()
		record := models.VocabTestRecord{
			UserID:         user.ID,
			StudentID:      studentID,
			EstimatedLevel: estimatedLevel,
			EstimatedVocab: estimatedVocab,
			Answers:        string(answersJSON),
			QuestionCount:  len(body.Answers),
			CorrectCount:   correctCount,
			IsLatest:       true,
			CompletedAt:    &now,
		}
		return tx.Create(&record).Error
	})
	if err != nil {
		response.Fail(c, "保存测试结果失败", err)
		return
	}

	// 推荐词库（当前等级 + 上一等级）
	recommendLevels := []string{estimatedLevel}
	prevLevel := prevLevelOf(estimatedLevel)
	if prevLevel != "" {
		recommendLevels = append(recommendLevels, prevLevel)
	}

	var recommendedBooks []models.WordBook
	db.Where("level IN ? AND is_active = ?", recommendLevels, true).
		Order("sort_order ASC").Limit(6).Find(&recommendedBooks)

	// 按等级分组返回
	levelStats := map[string]map[string]any{}
	for lv, total := range levelTotal {
		rate := 0.0
		if total > 0 {
			rate = float64(levelCorrect[lv]) / float64(total)
		}
		wRate := 0.0
		if weightedTotal[lv] > 0 {
			wRate = weightedCorrect[lv] / weightedTotal[lv]
		}
		levelStats[lv] = map[string]any{
			"total":        total,
			"correct":      levelCorrect[lv],
			"correctRate":  rate,
			"weightedRate": wRate,
		}
	}

	response.SuccessMsg(c, "success", gin.H{
		"level":            estimatedLevel,
		"estimatedVocab":   estimatedVocab,
		"correctCount":     correctCount,
		"totalCount":       len(body.Answers),
		"levelStats":       levelStats,
		"recommendedBooks": recommendedBooks,
	})
}

// handleVocabTestResult GET /vocab-test/result
// 查看最新一次测试结果
func (h *Handlers) handleVocabTestResult(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)

	var record models.VocabTestRecord
	if err := db.Where("user_id = ? AND is_latest = ?", user.ID, true).First(&record).Error; err != nil {
		response.Fail(c, "暂无测试记录", err)
		return
	}

	// 推荐词库
	var recommendedBooks []models.WordBook
	db.Where("level = ? AND is_active = ?", record.EstimatedLevel, true).
		Order("sort_order ASC").Limit(5).Find(&recommendedBooks)

	response.SuccessMsg(c, "success", gin.H{
		"record":           record,
		"recommendedBooks": recommendedBooks,
	})
}

// handleCreateQuestion POST /vocab-test/admin/questions
func (h *Handlers) handleCreateQuestion(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)

	var q models.VocabTestQuestion
	if err := c.ShouldBindJSON(&q); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, fmt.Errorf("参数错误: %w", err))
		return
	}
	if q.Word == "" || q.CorrectAnswer == "" || q.Level == "" {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, errors.New("word、correctAnswer、level 为必填项"))
		return
	}
	if err := validateQuestionPayload(&q); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	if err := db.Create(&q).Error; err != nil {
		response.Fail(c, "创建题目失败", err)
		return
	}
	invalidateVocabPoolCache()
	response.SuccessMsg(c, "success", q)
}

// handleListQuestions GET /vocab/questions?level=B1&page=1&pageSize=20&word=hi&withoutAudio=1
func (h *Handlers) handleListQuestions(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)

	level := c.Query("level")
	word := strings.TrimSpace(c.Query("word"))
	withoutAudio := c.Query("withoutAudio") == "1" || strings.EqualFold(c.Query("withoutAudio"), "true")
	page := 1
	size := 20
	if p := c.Query("page"); p != "" {
		if _, err := fmt.Sscanf(p, "%d", &page); err != nil || page < 1 {
			page = 1
		}
	}
	// 兼容 size / pageSize；批量全选场景允许较大 pageSize
	sizeRaw := c.Query("pageSize")
	if sizeRaw == "" {
		sizeRaw = c.Query("size")
	}
	if sizeRaw != "" {
		if _, err := fmt.Sscanf(sizeRaw, "%d", &size); err != nil || size < 1 {
			size = 20
		}
		if size > 2000 {
			size = 2000
		}
	}

	q := db.Model(&models.VocabTestQuestion{})
	if level != "" {
		q = q.Where("level = ?", level)
	}
	if word != "" {
		q = q.Where("word LIKE ?", "%"+word+"%")
	}
	if withoutAudio {
		q = q.Where("audio_url IS NULL OR audio_url = ''")
	}

	var total int64
	q.Count(&total)

	var questions []models.VocabTestQuestion
	q.Order("level ASC, difficulty_score ASC").
		Offset((page - 1) * size).Limit(size).Find(&questions)

	response.SuccessMsg(c, "success", gin.H{
		"total":     total,
		"page":      page,
		"size":      size,
		"pageSize":  size,
		"questions": questions,
	})
}

// handleUpdateQuestion PUT /vocab-test/admin/questions/:id
func (h *Handlers) handleUpdateQuestion(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id := c.Param("id")

	var q models.VocabTestQuestion
	if err := db.First(&q, id).Error; err != nil {
		response.Fail(c, "题目不存在", err)
		return
	}

	var updates map[string]any
	if err := c.ShouldBindJSON(&updates); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, errors.New("参数错误"))
		return
	}
	if err := validateQuestionUpdate(updates); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	if err := db.Model(&q).Updates(updates).Error; err != nil {
		response.Fail(c, "更新失败", err)
		return
	}
	if err := db.First(&q, id).Error; err != nil {
		response.Fail(c, "更新成功但回读失败", err)
		return
	}
	invalidateVocabPoolCache()
	response.SuccessMsg(c, "success", q)
}

// handleDeleteQuestion DELETE /vocab-test/admin/questions/:id
func (h *Handlers) handleDeleteQuestion(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id := c.Param("id")

	if err := db.Delete(&models.VocabTestQuestion{}, id).Error; err != nil {
		response.Fail(c, "删除失败", err)
		return
	}
	invalidateVocabPoolCache()
	response.SuccessMsg(c, "success", nil)
}

// handlePurgeBadAudio POST /vocab/questions/purge-bad-audio
// 检测题目音频是否可访问；无法返回正常音频的先删对象存储再清空 audio_url。
func (h *Handlers) handlePurgeBadAudio(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)

	var questions []models.VocabTestQuestion
	if err := db.Select("id, word, audio_url").
		Where("audio_url IS NOT NULL AND audio_url <> ''").
		Find(&questions).Error; err != nil {
		response.Fail(c, "查询失败", err)
		return
	}

	client := &http.Client{Timeout: 8 * time.Second}
	checked := 0
	cleared := 0
	objectsAttempted := 0
	objectsFailed := 0
	clearedWords := make([]string, 0)
	for _, q := range questions {
		checked++
		if vocabAudioURLUsable(client, q.AudioURL) {
			continue
		}
		a, f := stores.DeleteObjectURLs(q.AudioURL)
		objectsAttempted += a
		objectsFailed += f
		if err := db.Model(&models.VocabTestQuestion{}).
			Where("id = ?", q.ID).
			Update("audio_url", "").Error; err != nil {
			continue
		}
		cleared++
		if q.Word != "" {
			clearedWords = append(clearedWords, q.Word)
		}
	}
	if cleared > 0 {
		invalidateVocabPoolCache()
	}
	response.SuccessMsg(c, "success", gin.H{
		"checked":          checked,
		"cleared":          cleared,
		"clearedWords":     clearedWords,
		"objectsAttempted": objectsAttempted,
		"objectsFailed":    objectsFailed,
	})
}

// vocabAudioURLUsable 判断音频字段是否至少有一段可正常取回的音频。
func vocabAudioURLUsable(client *http.Client, raw string) bool {
	parts := strings.Split(raw, ";")
	any := false
	for _, p := range parts {
		u := strings.TrimSpace(p)
		if u == "" {
			continue
		}
		any = true
		if !vocabSingleAudioUsable(client, u) {
			return false
		}
	}
	return any
}

func vocabSingleAudioUsable(client *http.Client, raw string) bool {
	// 本地/对象存储相对路径：优先查 store
	key := ""
	switch {
	case strings.HasPrefix(raw, "/uploads/"):
		key = strings.TrimPrefix(raw, "/uploads/")
	case strings.HasPrefix(raw, "uploads/"):
		key = strings.TrimPrefix(raw, "uploads/")
	}
	if key != "" {
		ok, err := stores.Default().Exists(key)
		if err == nil && ok {
			return true
		}
		// Exists 失败时再尝试 HTTP（CDN PublicURL）
		if pub := stores.Default().PublicURL(key); pub != "" && (strings.HasPrefix(pub, "http://") || strings.HasPrefix(pub, "https://")) {
			return vocabHTTPAudioOK(client, pub)
		}
	}

	abs := raw
	if strings.HasPrefix(raw, "/") {
		base := ""
		if configs.Global != nil {
			base = strings.TrimRight(configs.Global.Server.URL, "/")
		}
		if base == "" {
			base = "http://127.0.0.1:7080"
		}
		abs = base + raw
	} else if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		// 裸 key
		if ok, err := stores.Default().Exists(raw); err == nil && ok {
			return true
		}
		pub := stores.Default().PublicURL(path.Clean(raw))
		if pub == "" {
			return false
		}
		if strings.HasPrefix(pub, "http://") || strings.HasPrefix(pub, "https://") {
			abs = pub
		} else if strings.HasPrefix(pub, "/") {
			base := "http://127.0.0.1:7080"
			if configs.Global != nil && configs.Global.Server.URL != "" {
				base = strings.TrimRight(configs.Global.Server.URL, "/")
			}
			abs = base + pub
		} else {
			return false
		}
	}
	return vocabHTTPAudioOK(client, abs)
}

func vocabHTTPAudioOK(client *http.Client, url string) bool {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return false
	}
	req.Header.Set("Range", "bytes=0-2047")
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		return false
	}
	// 读一点内容，确认不是空壳/错误页
	buf := make([]byte, 64)
	n, err := io.ReadFull(resp.Body, buf)
	if n == 0 && err != nil {
		return false
	}
	ct := strings.ToLower(resp.Header.Get("Content-Type"))
	if ct != "" {
		if strings.Contains(ct, "text/html") || strings.Contains(ct, "application/json") {
			return false
		}
		if strings.HasPrefix(ct, "audio/") ||
			strings.Contains(ct, "octet-stream") ||
			strings.Contains(ct, "wav") ||
			strings.Contains(ct, "mpeg") ||
			strings.Contains(ct, "mp4") {
			return true
		}
	}
	// 无可靠 Content-Type 时：有实体字节即视为可用（兼容部分 CDN）
	return n >= 16
}

// handleBatchCreateQuestions POST /vocab-test/admin/questions/batch
// body: { questions: [{word, options, correctAnswer, level, difficultyScore}] }
func (h *Handlers) handleBatchCreateQuestions(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)

	var body struct {
		Questions []models.VocabTestQuestion `json:"questions" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, errors.New("参数错误"))
		return
	}
	if len(body.Questions) == 0 {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, errors.New("题目列表不能为空"))
		return
	}
	if len(body.Questions) > 500 {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, errors.New("单次最多批量导入500题"))
		return
	}
	for i := range body.Questions {
		if err := validateQuestionPayload(&body.Questions[i]); err != nil {
			response.AbortWithStatusJSON(c, http.StatusBadRequest, errors.New(fmt.Sprintf("第 %d 条题目不合法：%s", i+1, err.Error())))
			return
		}
	}

	if err := db.CreateInBatches(&body.Questions, 100).Error; err != nil {
		response.Fail(c, "批量创建失败", err)
		return
	}
	invalidateVocabPoolCache()
	response.SuccessMsg(c, "success", gin.H{"created": len(body.Questions)})
}

// estimateLevel 根据各等级正确率估算用户等级和词汇量
// 规则：从 A1 开始，某等级正确率 >= 60% 则升级，直到找到第一个 < 60% 的等级

func estimateLevel(correct, total map[string]int) (string, int) {
	levels := []string{"A1", "A2", "B1", "B2", "C1"}
	vocabMap := map[string]int{
		"A1": 300,
		"A2": 1000,
		"B1": 2500,
		"B2": 4000,
		"C1": 6000,
	}

	finalLevel := "A1"
	for _, lv := range levels {
		t := total[lv]
		if t == 0 {
			continue
		}
		rate := float64(correct[lv]) / float64(t)
		if rate >= 0.6 {
			finalLevel = lv
		} else {
			break // 遇到第一个不达标的等级就停止
		}
	}
	return finalLevel, vocabMap[finalLevel]
}

// prevLevelOf 返回上一个等级
func prevLevelOf(level string) string {
	prev := map[string]string{
		"A2": "A1",
		"B1": "A2",
		"B2": "B1",
		"C1": "B2",
	}
	return prev[level]
}

func questionWeight(difficultyScore int) float64 {
	if difficultyScore < 1 {
		difficultyScore = 1
	}
	// 1 + ln(1+score) => score 越大权重越大，但增长平缓
	return 1.0 + math.Log1p(float64(difficultyScore))
}

func pickBalancedRandomQuestions(db *gorm.DB, level string, n int, excludeIDs []uint) ([]models.VocabTestQuestion, error) {
	if n <= 0 {
		return []models.VocabTestQuestion{}, nil
	}

	// 固定分桶：低(<=2)、中(3-4)、高(>=5)
	buckets := []struct {
		min int
		max int
		cnt int
	}{
		{min: 1, max: 2, cnt: int(math.Ceil(float64(n) / 3.0))},
		{min: 3, max: 4, cnt: n / 3},
		{min: 5, max: 1000000, cnt: n - int(math.Ceil(float64(n)/3.0)) - n/3},
	}

	res := make([]models.VocabTestQuestion, 0, n)
	used := map[uint]bool{}
	for _, id := range excludeIDs {
		used[id] = true
	}

	base := db.Model(&models.VocabTestQuestion{}).Where("level = ?", level)
	// 先尝试排除上次题目
	baseNoRepeat := base
	if len(excludeIDs) > 0 {
		baseNoRepeat = baseNoRepeat.Where("id NOT IN ?", excludeIDs)
	}

	fetchBucket := func(q *gorm.DB, min, max, limit int) ([]models.VocabTestQuestion, error) {
		if limit <= 0 {
			return nil, nil
		}
		qq := q.Where("difficulty_score >= ?", min)
		if max >= min && max < 1000000 {
			qq = qq.Where("difficulty_score <= ?", max)
		}
		// 用随机 offset 替代 ORDER BY RAND()（避免全表排序）
		var cnt int64
		qq.Count(&cnt)
		if cnt == 0 {
			return nil, nil
		}
		offset := 0
		if cnt > int64(limit) {
			offset = int(cnt) - limit
		}
		var out []models.VocabTestQuestion
		if err := qq.Order("id ASC").Offset(offset).Limit(limit).Find(&out).Error; err != nil {
			return nil, err
		}
		return out, nil
	}

	for _, b := range buckets {
		qs, err := fetchBucket(baseNoRepeat, b.min, b.max, b.cnt)
		if err != nil {
			return nil, err
		}
		for _, q := range qs {
			if len(res) >= n {
				break
			}
			if used[q.ID] {
				continue
			}
			used[q.ID] = true
			res = append(res, q)
		}
	}

	// 不足则用任意难度补齐（仍优先不重复）
	if len(res) < n {
		need := n - len(res)
		var fillCnt int64
		baseNoRepeat.Count(&fillCnt)
		if fillCnt > 0 {
			fillOffset := 0
			if fillCnt > int64(need) {
				fillOffset = int(fillCnt) - need
			}
			var fill []models.VocabTestQuestion
			if err := baseNoRepeat.Order("id ASC").Offset(fillOffset).Limit(need).Find(&fill).Error; err != nil {
				return nil, err
			}
			for _, q := range fill {
				if len(res) >= n {
					break
				}
				if used[q.ID] {
					continue
				}
				used[q.ID] = true
				res = append(res, q)
			}
		}
	}

	// 如果因为排除导致仍不足，则允许重复补齐
	if len(res) < n {
		need := n - len(res)
		var fillCnt int64
		base.Count(&fillCnt)
		if fillCnt > 0 {
			fillOffset := 0
			if fillCnt > int64(need) {
				fillOffset = int(fillCnt) - need
			}
			var fill []models.VocabTestQuestion
			if err := base.Order("id ASC").Offset(fillOffset).Limit(need).Find(&fill).Error; err != nil {
				return nil, err
			}
			for _, q := range fill {
				if len(res) >= n {
					break
				}
				if used[q.ID] {
					continue
				}
				used[q.ID] = true
				res = append(res, q)
			}
		}
	}

	if len(res) == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return res, nil
}

func extractAnsweredQuestionIDs(answersJSON string) []uint {
	if strings.TrimSpace(answersJSON) == "" {
		return nil
	}
	var arr []map[string]any
	if err := json.Unmarshal([]byte(answersJSON), &arr); err != nil {
		return nil
	}
	ids := make([]uint, 0, len(arr))
	for _, it := range arr {
		v, ok := it["questionId"]
		if !ok {
			continue
		}
		switch t := v.(type) {
		case float64:
			if t > 0 {
				ids = append(ids, uint(t))
			}
		case int:
			if t > 0 {
				ids = append(ids, uint(t))
			}
		}
	}
	return ids
}

func validateQuestionPayload(q *models.VocabTestQuestion) error {
	q.Word = strings.TrimSpace(q.Word)
	q.CorrectAnswer = strings.TrimSpace(q.CorrectAnswer)
	q.Level = strings.TrimSpace(q.Level)
	if q.Word == "" || q.CorrectAnswer == "" || q.Level == "" {
		return errors.New("word、correctAnswer、level 为必填项")
	}
	if q.DifficultyScore < 1 {
		q.DifficultyScore = 1
	}
	if q.DifficultyScore > 20 {
		return errors.New("difficultyScore 过大（建议 1-20）")
	}
	allowed := map[string]bool{"A1": true, "A2": true, "B1": true, "B2": true, "C1": true}
	if !allowed[q.Level] {
		return errors.New("level 仅支持 A1/A2/B1/B2/C1")
	}
	// options 必须是 JSON 数组，且包含 correctAnswer
	var opts []string
	if strings.TrimSpace(q.Options) == "" {
		return errors.New("options 不能为空")
	}
	if err := json.Unmarshal([]byte(q.Options), &opts); err != nil {
		return errors.New("options 必须是 JSON 数组字符串")
	}
	if len(opts) < 2 {
		return errors.New("options 至少包含 2 个选项")
	}
	if len(opts) > 8 {
		return errors.New("options 选项过多（建议不超过 8 个）")
	}
	found := false
	for i := range opts {
		opts[i] = strings.TrimSpace(opts[i])
		if opts[i] == q.CorrectAnswer {
			found = true
		}
	}
	if !found {
		return errors.New("correctAnswer 必须包含在 options 中")
	}
	// 规范化回写
	buf, _ := json.Marshal(opts)
	q.Options = string(buf)
	return nil
}

func validateQuestionUpdate(updates map[string]any) error {
	// 仅校验与题目质量相关的字段，不做强制白名单（保持现有接口兼容）
	if v, ok := updates["word"]; ok {
		updates["word"] = strings.TrimSpace(fmt.Sprint(v))
	}
	if v, ok := updates["audioUrl"]; ok {
		updates["audio_url"] = strings.TrimSpace(fmt.Sprint(v))
		delete(updates, "audioUrl")
	}
	if v, ok := updates["difficultyScore"]; ok {
		s, ok2 := toInt(v)
		if !ok2 || s < 1 || s > 20 {
			return errors.New("difficultyScore 仅支持 1-20")
		}
		updates["difficulty_score"] = s
		delete(updates, "difficultyScore")
	}
	if v, ok := updates["level"]; ok {
		lv := strings.TrimSpace(fmt.Sprint(v))
		allowed := map[string]bool{"A1": true, "A2": true, "B1": true, "B2": true, "C1": true}
		if !allowed[lv] {
			return errors.New("level 仅支持 A1/A2/B1/B2/C1")
		}
		updates["level"] = lv
	}
	// options/correctAnswer 联合校验：只要更新任一项，就确保最终 correctAnswer 在 options 内
	optRaw, hasOpt := updates["options"]
	ansRaw, hasAns := updates["correctAnswer"]
	if hasOpt || hasAns {
		optsStr := ""
		if hasOpt {
			optsStr = fmt.Sprint(optRaw)
		}
		ans := ""
		if hasAns {
			ans = strings.TrimSpace(fmt.Sprint(ansRaw))
			updates["correct_answer"] = ans
			delete(updates, "correctAnswer")
		}
		if hasOpt {
			var opts []string
			if err := json.Unmarshal([]byte(optsStr), &opts); err != nil {
				return errors.New("options 必须是 JSON 数组字符串")
			}
			if len(opts) < 2 {
				return errors.New("options 至少包含 2 个选项")
			}
			for i := range opts {
				opts[i] = strings.TrimSpace(opts[i])
			}
			if ans != "" {
				found := false
				for _, o := range opts {
					if o == ans {
						found = true
						break
					}
				}
				if !found {
					return errors.New("correctAnswer 必须包含在 options 中")
				}
			}
			buf, _ := json.Marshal(opts)
			updates["options"] = string(buf)
		}
	}
	return nil
}

func toInt(v any) (int, bool) {
	switch t := v.(type) {
	case int:
		return t, true
	case int64:
		return int(t), true
	case float64:
		return int(t), true
	case string:
		i, err := strconv.Atoi(strings.TrimSpace(t))
		return i, err == nil
	default:
		return 0, false
	}
}

// handleVocabTestRecords GET /vocab-test/records?page=1&pageSize=10
// 查看当前用户所有测试记录（分页，最新在前）
func (h *Handlers) handleVocabTestRecords(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)

	page := 1
	pageSize := 10
	if p := c.Query("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if s := c.Query("pageSize"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v > 0 && v <= 50 {
			pageSize = v
		}
	}

	var total int64
	db.Model(&models.VocabTestRecord{}).Where("user_id = ?", user.ID).Count(&total)

	var records []models.VocabTestRecord
	db.Where("user_id = ?", user.ID).
		Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&records)

	response.SuccessMsg(c, "success", gin.H{
		"list":     records,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// handleVocabTestRecordDetail GET /vocab-test/records/:id
func (h *Handlers) handleVocabTestRecordDetail(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := auth.CurrentUser(c)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Fail(c, "invalid id", err)
		return
	}

	var record models.VocabTestRecord
	if err := db.Where("id = ? AND user_id = ?", id, user.ID).First(&record).Error; err != nil {
		response.Fail(c, "记录不存在", err)
		return
	}
	response.SuccessMsg(c, "success", record)
}
