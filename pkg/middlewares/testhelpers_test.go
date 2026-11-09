package middlewares

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/CloudStepsGo/internal/models"
	lbconstants "github.com/LingByte/ling-base/common/constants"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// newTestDB opens an in-memory sqlite DB and migrates the models used by the
// middleware tests. Returns the *gorm.DB and a cleanup func.
//
// 使用 shared cache + 单连接：操作日志在 goroutine 里异步写入，
// 纯 `:memory:` 会按连接隔离库，异步 Create 时出现 no such table。
func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := "file:middleware_" + t.Name() + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&models.User{}, &OperationLog{}))
	return db
}

// newEngineWithDB builds a gin engine (test mode) with the given DB injected
// via lbconstants.DbField and a cookie session store so session-based code
// paths can be exercised.
func newEngineWithDB(t *testing.T, db *gorm.DB) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	store := cookie.NewStore([]byte("test-secret"))
	store.Options(sessions.Options{Path: "/", MaxAge: 3600})
	r.Use(sessions.Sessions(SessionField(), store))
	r.Use(func(c *gin.Context) {
		c.Set(lbconstants.DbField, db)
		c.Next()
	})
	return r
}

// seedUser inserts a user row and returns it.
func seedUser(t *testing.T, db *gorm.DB, username, role string) *models.User {
	t.Helper()
	u := &models.User{
		Username:    username,
		Password:    "$2a$10$abcdef",
		DisplayName: username,
		Role:        role,
	}
	require.NoError(t, db.Create(u).Error)
	return u
}

// validTokenFor builds a non-expired hash token for the user.
func validTokenFor(t *testing.T, u *models.User) string {
	t.Helper()
	ts := time.Now().Add(1 * time.Hour).Unix()
	return models.EncodeHashToken(u, ts, false)
}

// newRequest creates a test request with the given method/path.
func newRequest(method, path string) *httptest.ResponseRecorder {
	return httptest.NewRecorder()
}

// withGlobalConfig sets configs.Global for the duration of the test and
// restores the previous value on cleanup.
func withGlobalConfig(t *testing.T, cfg *configs.Config) {
	t.Helper()
	old := configs.Global
	configs.Global = cfg
	t.Cleanup(func() { configs.Global = old })
}
