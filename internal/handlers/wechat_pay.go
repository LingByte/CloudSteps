package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/CloudStepsGo/internal/models"
	middleware "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/CloudStepsGo/pkg/wechatpay"
	"github.com/LingByte/ling-base/apidocs/humax"
	lbconstants "github.com/LingByte/ling-base/common/constants"
	"github.com/LingByte/ling-base/common/logger"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

func (h *Handlers) registerWechatPayRoutes(r *humax.Group) {
	r.GET("/pay/subscription", middleware.Required, h.handleMySubscription)
	g := r.Group("/pay/wechat")
	g.POST("/jsapi", middleware.Required, h.handleWechatPayJSAPI)
	g.POST("/native", middleware.Required, h.handleWechatPayNative)
	g.GET("/orders/:outTradeNo", middleware.Required, h.handleWechatPayOrder)
	g.POST("/notify", h.handleWechatPayNotify)
}

func (h *Handlers) handleWechatPayJSAPI(c *gin.Context) {
	user := middleware.CurrentUser(c)
	if user == nil {
		response.Fail(c, "请先登录", nil)
		return
	}
	var body struct {
		Plan string `json:"plan"`
		Code string `json:"code"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Fail(c, "请求参数无效", err)
		return
	}
	plan := strings.TrimSpace(body.Plan)
	if _, ok := models.PlanPriceFen(plan, false); !ok {
		response.Fail(c, "无效的会员套餐", nil)
		return
	}
	cfg := configs.Global.WechatPay
	if !cfg.Enabled {
		response.Fail(c, "微信支付未启用", nil)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	if code := strings.TrimSpace(body.Code); code != "" {
		openID, err := exchangePayOpenID(cfg, code)
		if err != nil {
			response.Fail(c, "获取支付身份失败", err)
			return
		}
		if err := db.Model(&models.User{}).Where("id = ?", user.ID).Update("wechat_pay_open_id", openID).Error; err != nil {
			response.Fail(c, "保存支付身份失败", err)
			return
		}
		user.WechatPayOpenID = openID
	}
	if strings.TrimSpace(user.WechatPayOpenID) == "" {
		if strings.TrimSpace(cfg.AppSecret) == "" {
			response.Fail(c, "支付公众号未配置 AppSecret，无法获取支付 openid", nil)
			return
		}
		response.Success(c, gin.H{"oauthUrl": payOAuthURL(cfg, plan)})
		return
	}
	order, err := createPendingPayment(db, user.ID, plan)
	if err != nil {
		response.Fail(c, "创建订单失败", err)
		return
	}
	client, err := wechatpay.Load(cfg.MchID, cfg.AppID, cfg.APIv3Key, cfg.CertFile, cfg.KeyFile, cfg.NotifyURL)
	if err != nil {
		response.Fail(c, "微信支付配置不完整", err)
		return
	}
	prepayID, params, err := client.JSAPIOrder(payPlanDescription(plan), order.OutTradeNo, user.WechatPayOpenID, order.Amount)
	if err != nil {
		_ = db.Model(&order).Update("status", models.PaymentStatusClosed).Error
		response.Fail(c, "微信下单失败", err)
		return
	}
	_ = db.Model(&order).Update("prepay_id", prepayID).Error
	response.Success(c, gin.H{
		"outTradeNo": order.OutTradeNo,
		"pay":        params,
	})
}

func (h *Handlers) handleWechatPayNative(c *gin.Context) {
	user := middleware.CurrentUser(c)
	if user == nil {
		response.Fail(c, "请先登录", nil)
		return
	}
	var body struct {
		Plan string `json:"plan"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Fail(c, "请求参数无效", err)
		return
	}
	plan := strings.TrimSpace(body.Plan)
	if _, ok := models.PlanPriceFen(plan, false); !ok {
		response.Fail(c, "无效的会员套餐", nil)
		return
	}
	cfg := configs.Global.WechatPay
	if !cfg.Enabled {
		response.Fail(c, "微信支付未启用", nil)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	order, err := createPendingPayment(db, user.ID, plan)
	if err != nil {
		response.Fail(c, "创建订单失败", err)
		return
	}
	client, err := wechatpay.Load(cfg.MchID, cfg.AppID, cfg.APIv3Key, cfg.CertFile, cfg.KeyFile, cfg.NotifyURL)
	if err != nil {
		response.Fail(c, "微信支付配置不完整", err)
		return
	}
	codeURL, err := client.NativeOrder(payPlanDescription(plan), order.OutTradeNo, order.Amount)
	if err != nil {
		_ = db.Model(&order).Update("status", models.PaymentStatusClosed).Error
		response.Fail(c, "微信下单失败", err)
		return
	}
	response.Success(c, gin.H{
		"outTradeNo": order.OutTradeNo,
		"codeUrl":    codeURL,
	})
}

func (h *Handlers) handleMySubscription(c *gin.Context) {
	user := middleware.CurrentUser(c)
	if user == nil {
		response.Fail(c, "请先登录", nil)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	sub, err := models.GetActiveSubscription(db, user.ID)
	if err != nil {
		response.Fail(c, "查询会员失败", err)
		return
	}
	response.Success(c, sub)
}

func (h *Handlers) handleWechatPayOrder(c *gin.Context) {
	user := middleware.CurrentUser(c)
	if user == nil {
		response.Fail(c, "请先登录", nil)
		return
	}
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	var order models.PaymentOrder
	if err := db.Where("out_trade_no = ? AND user_id = ?", c.Param("outTradeNo"), user.ID).First(&order).Error; err != nil {
		response.Fail(c, "订单不存在", err)
		return
	}
	if order.Status == models.PaymentStatusPending {
		cfg := configs.Global.WechatPay
		client, err := wechatpay.Load(cfg.MchID, cfg.AppID, cfg.APIv3Key, cfg.CertFile, cfg.KeyFile, cfg.NotifyURL)
		if err == nil {
			state, txn, qerr := client.QueryTradeState(order.OutTradeNo)
			if qerr == nil && state == "SUCCESS" {
				if ferr := fulfillPaymentOrder(db, order.OutTradeNo, txn, order.Amount); ferr == nil {
					_ = db.Where("id = ?", order.ID).First(&order).Error
				}
			}
		}
	}
	response.Success(c, gin.H{"status": order.Status, "plan": order.Plan})
}

func (h *Handlers) handleWechatPayNotify(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "FAIL", "message": "bad body"})
		return
	}
	cfg := configs.Global.WechatPay
	client, err := wechatpay.Load(cfg.MchID, cfg.AppID, cfg.APIv3Key, cfg.CertFile, cfg.KeyFile, cfg.NotifyURL)
	if err != nil {
		logger.Warn("wechat pay notify: client", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": "config"})
		return
	}
	plain, err := client.VerifyNotify(
		c.GetHeader("Wechatpay-Timestamp"),
		c.GetHeader("Wechatpay-Nonce"),
		c.GetHeader("Wechatpay-Signature"),
		c.GetHeader("Wechatpay-Serial"),
		body,
	)
	if err != nil {
		logger.Warn("wechat pay notify: verify", zap.Error(err))
		c.JSON(http.StatusUnauthorized, gin.H{"code": "FAIL", "message": "verify"})
		return
	}
	var note struct {
		OutTradeNo    string `json:"out_trade_no"`
		TransactionID string `json:"transaction_id"`
		TradeState    string `json:"trade_state"`
		Amount        struct {
			Total int `json:"total"`
		} `json:"amount"`
	}
	if err := json.Unmarshal(plain, &note); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "FAIL", "message": "payload"})
		return
	}
	if note.TradeState == "SUCCESS" {
		db := c.MustGet(lbconstants.DbField).(*gorm.DB)
		if err := fulfillPaymentOrder(db, note.OutTradeNo, note.TransactionID, note.Amount.Total); err != nil {
			logger.Warn("wechat pay notify: fulfill", zap.Error(err), zap.String("outTradeNo", note.OutTradeNo))
			c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": "fulfill"})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"code": "SUCCESS", "message": "成功"})
}

func fulfillPaymentOrder(db *gorm.DB, outTradeNo, transactionID string, amount int) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var order models.PaymentOrder
		if err := tx.Where("out_trade_no = ?", outTradeNo).First(&order).Error; err != nil {
			return err
		}
		if order.Status == models.PaymentStatusPaid {
			return nil
		}
		if order.Amount != amount {
			return fmt.Errorf("amount mismatch: order %d notify %d", order.Amount, amount)
		}
		now := time.Now()
		res := tx.Model(&models.PaymentOrder{}).
			Where("id = ? AND status = ?", order.ID, models.PaymentStatusPending).
			Updates(map[string]any{
				"status":         models.PaymentStatusPaid,
				"transaction_id": transactionID,
				"paid_at":        now,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return nil
		}
		return models.GrantPaidPlan(tx, order.UserID, order.Plan, now)
	})
}

func exchangePayOpenID(cfg configs.WechatPayConfig, code string) (string, error) {
	if cfg.AppID == "" || cfg.AppSecret == "" || code == "" {
		return "", errors.New("pay oauth not configured")
	}
	q := url.Values{}
	q.Set("appid", cfg.AppID)
	q.Set("secret", cfg.AppSecret)
	q.Set("code", code)
	q.Set("grant_type", "authorization_code")
	resp, err := http.Get("https://api.weixin.qq.com/sns/oauth2/access_token?" + q.Encode())
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var parsed struct {
		OpenID  string `json:"openid"`
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", err
	}
	if parsed.OpenID == "" {
		return "", fmt.Errorf("pay oauth: %s", parsed.ErrMsg)
	}
	return parsed.OpenID, nil
}

func payOAuthURL(cfg configs.WechatPayConfig, plan string) string {
	q := url.Values{}
	q.Set("appid", cfg.AppID)
	q.Set("redirect_uri", cfg.OAuthRedirectURL)
	q.Set("response_type", "code")
	q.Set("scope", "snsapi_base")
	q.Set("state", plan)
	return "https://open.weixin.qq.com/connect/oauth2/authorize?" + q.Encode() + "#wechat_redirect"
}

func createPendingPayment(db *gorm.DB, userID uint, plan string) (models.PaymentOrder, error) {
	var prior int64
	if err := db.Model(&models.UserSubscription{}).Where("user_id = ?", userID).Count(&prior).Error; err != nil {
		return models.PaymentOrder{}, err
	}
	amount, ok := models.PlanPriceFen(plan, prior == 0)
	if !ok {
		return models.PaymentOrder{}, errors.New("invalid plan")
	}
	order := models.PaymentOrder{
		UserID:     userID,
		OutTradeNo: newPayOutTradeNo(),
		Plan:       plan,
		Amount:     amount,
		Status:     models.PaymentStatusPending,
	}
	if err := db.Create(&order).Error; err != nil {
		return models.PaymentOrder{}, err
	}
	return order, nil
}

func payPlanDescription(plan string) string {
	switch plan {
	case models.SubscriptionTypeMonthly:
		return "云阶月度会员"
	case models.SubscriptionTypeQuarterly:
		return "云阶季度会员"
	case models.SubscriptionTypeYearly:
		return "云阶年度会员"
	case models.SubscriptionTypeLifetime:
		return "云阶永久会员"
	default:
		return "云阶会员"
	}
}

func newPayOutTradeNo() string {
	return fmt.Sprintf("CS%x", time.Now().UnixNano())
}
