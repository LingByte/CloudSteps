package handlers

import (
	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/CloudStepsGo/internal/constants"
	middleware "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/CloudStepsGo/pkg/sysmetrics"
	"github.com/LingByte/CloudStepsGo/pkg/voice"
	"github.com/LingByte/ling-base/apidocs/humax"
	"github.com/LingByte/ling-base/cache/lru"
	lbconfig "github.com/LingByte/ling-base/common/config"
	"github.com/danielgtaylor/huma/v2"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handlers struct {
	db              *gorm.DB
	cache           *lru.Cache[string, any]
	configStore     *lbconfig.Store
	sysMetrics      *sysmetrics.Service
	realtimeFactory *voice.RealtimeFactory
}

func NewHandlers(db *gorm.DB, cache *lru.Cache[string, any], configStore *lbconfig.Store, metrics *sysmetrics.Service) *Handlers {
	return &Handlers{
		db:          db,
		cache:       cache,
		configStore: configStore,
		sysMetrics:  metrics,
	}
}

// Register 通过 humax 注册业务路由（Gin 执行 + OpenAPI 文档）。
func (h *Handlers) Register(engine *gin.Engine, api huma.API) {
	prefix := "/api"
	if configs.Global != nil && configs.Global.Server.APIPrefix != "" {
		prefix = configs.Global.Server.APIPrefix
	}
	r := humax.NewGroup(api, engine, prefix)

	r.Use(middleware.InjectDB(h.db))
	if h.configStore != nil {
		r.Use(func(c *gin.Context) {
			c.Set(constants.ConfigField, h.configStore)
			c.Next()
		})
	}
	if h.sysMetrics != nil {
		r.Use(h.sysMetrics.Middleware())
	}

	middleware.ApplyGlobalMiddlewares(r.Gin())

	h.registerAuthRoutes(r)
	h.registerAdminUserRoutes(r)
	h.registerSecurityRoutes(r)
	h.registerWordBookRoutes(r)
	h.registerLearningRoutes(r)
	h.registerVocabTestRoutes(r)
	h.registerReadingRoutes(r)
	h.registerClozeRoutes(r)
	h.registerGrammarRoutes(r)
	h.registerNotificationRoutes(r)
	h.registerNotificationAdminRoutes(r)
	h.registerAnnouncementRoutes(r)
	h.registerAIContentRoutes(r)
	h.registerWechatMpArticleRoutes(r)
	h.registerCheckInRoutes(r)
	h.registerStorageAdminRoutes(r)
	h.registerCoachingRoutes(r)
	h.registerFeedbackRoutes(r)
	h.registerFeedbackAdminRoutes(r)
	h.registerUserWordAdminRoutes(r)
	h.registerScenarioDialogueRoutes(r)
	h.registerTTSRoutes(r)
	h.registerMetricsRoutes(r)
}
