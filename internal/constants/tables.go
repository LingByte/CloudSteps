package constants

// 表名常量集中定义。所有 model 的 TableName() 方法都应引用此处的常量，
// 避免在代码中散落硬编码字符串。

const (
	// ── 用户与安全 ──
	USER_TABLE_NAME          = "users"
	USER_DEVICE_TABLE_NAME   = "user_devices"
	LOGIN_HISTORY_TABLE_NAME = "login_histories"
	ACCOUNT_LOCK_TABLE_NAME  = "account_locks"

	// ── 词库与单词 ──
	TABLE_WORD_BOOKS = "word_books"
	TABLE_WORDS      = "words"

	// ── 学习与复习 ──
	TABLE_USER_WORD_BOOKS    = "user_word_books"
	TABLE_USER_WORD_STATES   = "user_word_states"
	TABLE_USER_WORDS         = "user_words"
	TABLE_REVIEW_QUEUE       = "review_queue"
	TABLE_WORD_BOOK_PROGRESS = "word_book_progress"
	TABLE_USER_WORD_PROGRESS = "user_word_progress"

	// ── 学习会话 ──
	TABLE_STUDY_SESSIONS = "study_sessions"
	TABLE_SESSION_WORDS  = "session_words"

	// ── 阅读 ──
	TABLE_READING_PASSAGES  = "reading_passages"
	TABLE_READING_QUESTIONS = "reading_questions"
	TABLE_READING_RECORDS   = "reading_records"

	TABLE_USER_READING_PASSAGES  = "user_reading_passages"
	TABLE_USER_READING_QUESTIONS = "user_reading_questions"
	TABLE_USER_READING_RECORDS   = "user_reading_records"

	// ── 完形填空 ──
	TABLE_CLOZE_PASSAGES = "cloze_passages"
	TABLE_CLOZE_BLANKS   = "cloze_blanks"
	TABLE_CLOZE_RECORDS  = "cloze_records"

	TABLE_USER_CLOZE_PASSAGES = "user_cloze_passages"
	TABLE_USER_CLOZE_BLANKS   = "user_cloze_blanks"
	TABLE_USER_CLOZE_RECORDS  = "user_cloze_records"

	// ── 语法 ──
	TABLE_GRAMMAR_LESSONS   = "grammar_lessons"
	TABLE_GRAMMAR_QUESTIONS = "grammar_questions"
	TABLE_GRAMMAR_RECORDS   = "grammar_records"

	// ── 陪练 ──
	TABLE_STUDENT_TEACHER_COACHING_QUOTAS = "student_teacher_coaching_quotas"
	TABLE_TEACHER_TEACHING_POOLS          = "teacher_teaching_pools"
	TABLE_TEACHER_COACHING_USAGE_PERIODS  = "teacher_coaching_usage_periods"
	TABLE_COACHING_APPOINTMENTS           = "coaching_appointments"
	TABLE_COACHING_SESSION_RECORDS        = "coaching_session_records"
	TABLE_COACHING_AUDIT_LOGS             = "coaching_audit_logs"

	// ── 情景对话 ──
	TABLE_SCENARIO_DIALOGUE_SCENARIOS = "scenario_dialogue_scenarios"
	TABLE_SCENARIO_DIALOGUE_SESSIONS  = "scenario_dialogue_sessions"
	TABLE_SCENARIO_DIALOGUE_TURNS     = "scenario_dialogue_turns"

	// ── 公告 ──
	TABLE_ANNOUNCEMENTS      = "announcements"
	TABLE_ANNOUNCEMENT_READS = "announcement_reads"

	TABLE_WECHAT_MP_ARTICLES = "wechat_mp_articles"

	// ── 反馈 ──
	TABLE_FEEDBACK_TICKETS = "feedback_tickets"
	TABLE_FEEDBACK_REPLIES = "feedback_replies"

	// ── 教师签到 ──
	TABLE_TEACHER_CHECKINS = "teacher_checkins"

	TABLE_USER_INVITE_CODES         = "user_invite_codes"
	TABLE_USER_INVITE_RECORDS       = "user_invite_records"
	TABLE_INVITE_REWARD_SETTINGS    = "invite_reward_settings"
	TABLE_INVITE_REWARD_GRANTS      = "invite_reward_grants"

	// ── 系统指标 ──
	SYS_METRIC_TABLE_NAME = "sys_metrics"
)
