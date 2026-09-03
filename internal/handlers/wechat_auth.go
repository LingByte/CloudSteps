package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/utils"
	"github.com/LingByte/CloudStepsGo/pkg/wechat"
	lbconstants "github.com/LingByte/ling-base/common/constants"
	"github.com/LingByte/ling-base/common/geoip"
	"github.com/LingByte/ling-base/common/logger"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

func (h *Handlers) wechatConfig() configs.WechatConfig {
	if configs.Global == nil {
		return configs.WechatConfig{}
	}
	return configs.Global.Wechat
}

func (h *Handlers) wechatLoginSessionTTL() time.Duration {
	cfg := h.wechatConfig()
	if cfg.LoginSessionTTL > 0 {
		return cfg.LoginSessionTTL
	}
	return 5 * time.Minute
}

func (h *Handlers) wechatLoginCodeTTL() time.Duration {
	cfg := h.wechatConfig()
	if cfg.LoginCodeTTL > 0 {
		return cfg.LoginCodeTTL
	}
	return 10 * time.Minute
}

func (h *Handlers) wechatEnabled() bool {
	cfg := h.wechatConfig()
	return cfg.Enabled && strings.TrimSpace(cfg.Token) != ""
}

func (h *Handlers) wechatUsesEncryption() bool {
	cfg := h.wechatConfig()
	if strings.TrimSpace(cfg.EncodingAESKey) == "" {
		return false
	}
	mode := strings.ToLower(strings.TrimSpace(cfg.EncryptMode))
	return mode == "compatible" || mode == "safe"
}

func (h *Handlers) wechatMessageCrypt() (*wechat.MessageCrypt, error) {
	cfg := h.wechatConfig()
	if !h.wechatUsesEncryption() {
		return nil, errors.New("encryption not configured")
	}
	return wechat.NewMessageCrypt(cfg.Token, cfg.EncodingAESKey, cfg.AppID)
}

func (h *Handlers) setWechatLoginSession(ctx context.Context, sess *models.WechatLoginSession) {
	if sess == nil || sess.SessionID == "" {
		return
	}
	ttl := time.Until(sess.ExpiresAt)
	if ttl <= 0 {
		return
	}
	h.cache.Set(ctx, models.WechatLoginSessionKey(sess.SessionID), sess, ttl)
}

func (h *Handlers) getWechatLoginSession(ctx context.Context, sessionID string) (*models.WechatLoginSession, bool) {
	raw, err := h.cache.Get(ctx, models.WechatLoginSessionKey(sessionID))
	if err != nil || raw == nil {
		return nil, false
	}
	switch v := raw.(type) {
	case *models.WechatLoginSession:
		return v, true
	case models.WechatLoginSession:
		s := v
		return &s, true
	default:
		b, err := json.Marshal(raw)
		if err != nil {
			return nil, false
		}
		var sess models.WechatLoginSession
		if err := json.Unmarshal(b, &sess); err != nil {
			return nil, false
		}
		return &sess, true
	}
}

func (h *Handlers) setWechatLoginCode(ctx context.Context, code, sessionID string) {
	item := models.WechatLoginCode{SessionID: sessionID, CreatedAt: time.Now()}
	h.cache.Set(ctx, models.WechatLoginCodeKey(code), item, h.wechatLoginCodeTTL())
}

func (h *Handlers) getWechatLoginCode(ctx context.Context, code string) (*models.WechatLoginCode, bool) {
	raw, err := h.cache.Get(ctx, models.WechatLoginCodeKey(code))
	if err != nil || raw == nil {
		return nil, false
	}
	switch v := raw.(type) {
	case *models.WechatLoginCode:
		return v, true
	case models.WechatLoginCode:
		item := v
		return &item, true
	default:
		b, err := json.Marshal(raw)
		if err != nil {
			return nil, false
		}
		var item models.WechatLoginCode
		if err := json.Unmarshal(b, &item); err != nil {
			return nil, false
		}
		return &item, true
	}
}

func (h *Handlers) consumeWechatLoginCode(ctx context.Context, code string) (*models.WechatLoginCode, bool) {
	item, ok := h.getWechatLoginCode(ctx, code)
	if !ok || item == nil {
		return nil, false
	}
	h.cache.Delete(ctx, models.WechatLoginCodeKey(code))
	return item, true
}

// handleWechatLoginStartSession POST /auth/wechat/login/session
func (h *Handlers) handleWechatLoginStartSession(c *gin.Context) {
	if !h.wechatEnabled() {
		response.FailI18n(c, "wechat.not_configured", errors.New("wechat login disabled"))
		return
	}
	var req struct {
		InviteCode string `json:"inviteCode"`
	}
	_ = c.ShouldBindJSON(&req)
	inviteCode := models.NormalizeInviteCode(req.InviteCode)
	if inviteCode != "" {
		db := c.MustGet(lbconstants.DbField).(*gorm.DB)
		if err := previewInviteCode(db, inviteCode); err != nil {
			inviteCode = ""
		}
	}
	sessionID, err := models.NewWechatLoginSessionID()
	if err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	ttl := h.wechatLoginSessionTTL()
	loginCode := models.NewWechatLoginCode()
	sess := &models.WechatLoginSession{
		SessionID:  sessionID,
		Status:     models.WechatLoginSessionPending,
		InviteCode: inviteCode,
		ExpiresAt:  time.Now().Add(ttl),
	}
	h.setWechatLoginSession(c.Request.Context(), sess)
	h.setWechatLoginCode(c.Request.Context(), loginCode, sessionID)
	response.SuccessI18n(c, "wechat.session_created", gin.H{
		"sessionId": sessionID,
		"loginCode": loginCode,
		"expiresIn": int(ttl.Seconds()),
		"qrUrl":     "/wechat-official-account-qr.jpg",
	})
}

// completeWechatSessionLogin 将会话标记为已登录并写入 token（供公众号消息回调使用）。
func (h *Handlers) completeWechatSessionLogin(c *gin.Context, db *gorm.DB, sess *models.WechatLoginSession, openID string) error {
	if sess == nil || sess.SessionID == "" || openID == "" {
		return errors.New("invalid session or openid")
	}
	if sess.Status == models.WechatLoginSessionConfirmed {
		return nil
	}
	if time.Now().After(sess.ExpiresAt) {
		sess.Status = models.WechatLoginSessionExpired
		h.setWechatLoginSession(c.Request.Context(), sess)
		return errors.New("session expired")
	}

	_, lookupErr := models.GetUserByWechatOpenID(db, openID)
	created := errors.Is(lookupErr, gorm.ErrRecordNotFound)
	if lookupErr != nil && !created {
		return lookupErr
	}
	user, err := models.FindOrCreateWechatUser(db, openID)
	if err != nil {
		return err
	}
	if created && strings.TrimSpace(sess.InviteCode) != "" {
		if err := applyInviteAfterRegister(db, user.ID, sess.InviteCode); err != nil {
			logger.Warn("wechat invite apply failed", zap.Uint("userId", user.ID), zap.Error(err))
		}
	}
	if err := models.CheckUserAllowLogin(db, user); err != nil {
		return err
	}

	token, err := h.completeWechatWebLogin(c, db, user, openID)
	if err != nil {
		return err
	}

	sess.Status = models.WechatLoginSessionConfirmed
	sess.OpenID = openID
	sess.UserID = user.ID
	sess.Token = token
	h.setWechatLoginSession(c.Request.Context(), sess)
	return nil
}

// handleWechatLoginVerify POST /auth/wechat/login/verify — 保留兼容；新流程请向公众号发送网页验证码。
func (h *Handlers) handleWechatLoginVerify(c *gin.Context) {
	response.FailI18n(c, "wechat.send_code_to_oa", errors.New("send code to official account"))
}

// handleWechatLoginStatus GET /auth/wechat/login/status?sessionId=
func (h *Handlers) handleWechatLoginStatus(c *gin.Context) {
	sessionID := strings.TrimSpace(c.Query("sessionId"))
	if sessionID == "" {
		response.FailI18n(c, "common.invalid_params", errors.New("missing sessionId"))
		return
	}
	ctx := c.Request.Context()
	sess, ok := h.getWechatLoginSession(ctx, sessionID)
	if !ok || sess == nil {
		response.FailI18n(c, "wechat.session_not_found", errors.New("session missing"))
		return
	}
	if time.Now().After(sess.ExpiresAt) && sess.Status != models.WechatLoginSessionConfirmed {
		sess.Status = models.WechatLoginSessionExpired
		h.setWechatLoginSession(ctx, sess)
	}
	out := gin.H{"status": sess.Status}
	if sess.Status == models.WechatLoginSessionConfirmed && sess.Token != "" {
		db := c.MustGet(lbconstants.DbField).(*gorm.DB)
		user, err := models.GetUserByUID(db, sess.UserID)
		if err == nil && user != nil {
			out["token"] = sess.Token
			out["user"] = user
		}
	}
	response.SuccessI18n(c, "common.ok", out)
}

func (h *Handlers) completeWechatWebLogin(c *gin.Context, db *gorm.DB, user *models.User, openID string) (string, error) {
	if openID != "" && user.WechatOpenID == "" {
		_ = db.Model(user).Update("wechat_open_id", openID).Error
		user.WechatOpenID = openID
	}

	clientIP := c.ClientIP()
	userAgent := c.Request.UserAgent()
	country, city, location := "Unknown", "Unknown", "Unknown"
	if c2, ci, l, err := geoip.GetIPLocation(clientIP); err == nil {
		country, city, location = c2, ci, l
	}
	deviceType, os, browser := utils.ParseUserAgent(userAgent)
	deviceID := utils.GetDeviceID(userAgent, clientIP)
	if _, err := models.CreateOrUpdateUserDevice(db, user.ID, deviceID, fmt.Sprintf("%s on %s", browser, os), deviceType, os, browser, userAgent, clientIP, location); err != nil {
		logger.Warn("wechat login: device record failed", zap.Error(err))
	}
	if err := models.RecordLoginHistory(db, user.ID, user.Username, clientIP, location, country, city, userAgent, deviceID, "wechat", true, "", false); err != nil {
		logger.Warn("wechat login: history failed", zap.Error(err))
	}

	models.Login(c, user)
	if c.IsAborted() {
		return "", errors.New("login aborted")
	}
	updatedUser, err := models.GetUserByUID(db, user.ID)
	if err == nil && updatedUser != nil {
		user = updatedUser
	}
	expired := h.authTokenTTL()
	return models.BuildAuthToken(user, expired, false), nil
}

// handleWechatMPMessageVerify GET /auth/wechat/mp/message — 微信服务器 URL 验证
// 与 SoulNexus 一致：GET 仅用 token+timestamp+nonce 验签，原样返回 echostr（不解密）。
func (h *Handlers) handleWechatMPMessageVerify(c *gin.Context) {
	cfg := h.wechatConfig()
	sig := strings.TrimSpace(c.Query("signature"))
	ts := strings.TrimSpace(c.Query("timestamp"))
	nonce := strings.TrimSpace(c.Query("nonce"))
	echostr := c.Query("echostr")
	token := strings.TrimSpace(cfg.Token)

	if token == "" {
		c.String(http.StatusBadRequest, "error")
		return
	}
	if !wechat.VerifySignature(token, ts, nonce, sig) {
		expected := wechat.ComputePlainSignature(token, ts, nonce)
		logger.Warn("wechat mp verify: invalid signature",
			zap.String("path", c.Request.URL.Path),
			zap.String("signature", sig),
			zap.String("expected", expected),
			zap.String("timestamp", ts),
			zap.String("nonce", nonce),
			zap.String("query", c.Request.URL.RawQuery),
			zap.String("remoteIP", c.ClientIP()))
		c.String(http.StatusForbidden, "error")
		return
	}
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.String(http.StatusOK, echostr)
}

// handleWechatMPMessage POST /auth/wechat/mp/message — 关注/消息事件
func (h *Handlers) handleWechatMPMessage(c *gin.Context) {
	cfg := h.wechatConfig()
	sig := strings.TrimSpace(c.Query("signature"))
	msgSig := strings.TrimSpace(c.Query("msg_signature"))
	ts := strings.TrimSpace(c.Query("timestamp"))
	nonce := strings.TrimSpace(c.Query("nonce"))
	encryptType := strings.ToLower(strings.TrimSpace(c.Query("encrypt_type")))

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.String(http.StatusOK, "success")
		return
	}

	token := strings.TrimSpace(cfg.Token)
	if token == "" {
		c.String(http.StatusForbidden, "invalid signature")
		return
	}

	if encryptType == "aes" && h.wechatUsesEncryption() {
		crypt, err := h.wechatMessageCrypt()
		if err != nil {
			logger.Warn("wechat mp: crypt config", zap.Error(err))
			c.String(http.StatusOK, "success")
			return
		}
		body, err = crypt.DecryptRequestBody(body, msgSig, ts, nonce)
		if err != nil {
			logger.Warn("wechat mp decrypt failed", zap.Error(err))
			c.String(http.StatusOK, "success")
			return
		}
	} else if !wechat.VerifySignature(token, ts, nonce, sig) {
		expected := wechat.ComputePlainSignature(token, ts, nonce)
		logger.Warn("wechat mp message: invalid signature",
			zap.String("signature", sig),
			zap.String("expected", expected),
			zap.String("encrypt_type", encryptType),
			zap.String("query", c.Request.URL.RawQuery))
		c.String(http.StatusForbidden, "invalid signature")
		return
	}

	h.dispatchWechatInboundMessage(c, body, ts, nonce)
}

func (h *Handlers) dispatchWechatInboundMessage(c *gin.Context, body []byte, ts, nonce string) {
	msg, err := wechat.ParseInboundMessage(body)
	if err != nil {
		logger.Warn("wechat mp parse failed", zap.Error(err))
		c.String(http.StatusOK, "success")
		return
	}
	openID := strings.TrimSpace(msg.FromUserName)
	ctx := c.Request.Context()

	switch {
	case strings.EqualFold(msg.MsgType, "event") && (msg.Event == "subscribe" || msg.Event == "SCAN"):
		reply := "欢迎关注！请打开登录网页，将页面显示的验证码发送给本公众号，即可完成登录。"
		cfg := h.wechatConfig()
		if cfg.AppID != "" && cfg.AppSecret != "" {
			_ = h.sendWechatCustomText(openID, reply)
		}
		out := wechat.BuildTextReply(msg.FromUserName, msg.ToUserName, reply, time.Now().Unix())
		h.writeWechatReply(c, out, ts, nonce)
		return
	case strings.EqualFold(msg.MsgType, "text"):
		text := strings.TrimSpace(msg.Content)
		codeItem, ok := h.consumeWechatLoginCode(ctx, text)
		if !ok || codeItem == nil || codeItem.SessionID == "" {
			reply := "验证码无效或已过期，请刷新网页重新获取。"
			out := wechat.BuildTextReply(msg.FromUserName, msg.ToUserName, reply, time.Now().Unix())
			h.writeWechatReply(c, out, ts, nonce)
			return
		}
		sess, ok := h.getWechatLoginSession(ctx, codeItem.SessionID)
		if !ok || sess == nil {
			reply := "登录会话已失效，请刷新网页重试。"
			out := wechat.BuildTextReply(msg.FromUserName, msg.ToUserName, reply, time.Now().Unix())
			h.writeWechatReply(c, out, ts, nonce)
			return
		}
		db := c.MustGet(lbconstants.DbField).(*gorm.DB)
		if err := h.completeWechatSessionLogin(c, db, sess, openID); err != nil {
			reply := "登录失败，请刷新网页重新获取验证码后再试。"
			if strings.Contains(err.Error(), "expired") {
				reply = "登录会话已过期，请刷新网页重新获取验证码。"
			}
			out := wechat.BuildTextReply(msg.FromUserName, msg.ToUserName, reply, time.Now().Unix())
			h.writeWechatReply(c, out, ts, nonce)
			return
		}
		reply := "登录成功，请回到网页继续。"
		out := wechat.BuildTextReply(msg.FromUserName, msg.ToUserName, reply, time.Now().Unix())
		h.writeWechatReply(c, out, ts, nonce)
		return
	}

	c.String(http.StatusOK, "success")
}

func (h *Handlers) writeWechatReply(c *gin.Context, plainXML []byte, ts, nonce string) {
	if h.wechatUsesEncryption() {
		crypt, err := h.wechatMessageCrypt()
		if err != nil {
			logger.Warn("wechat mp: crypt config", zap.Error(err))
			c.String(http.StatusForbidden, "invalid wechat config")
			return
		}
		if ts == "" {
			ts = fmt.Sprintf("%d", time.Now().Unix())
		}
		if nonce == "" {
			nonce = fmt.Sprintf("%d", time.Now().UnixNano())
		}
		out, err := crypt.EncryptReply(plainXML, ts, nonce)
		if err != nil {
			logger.Warn("wechat mp encrypt reply failed", zap.Error(err))
			c.String(http.StatusOK, "success")
			return
		}
		c.Data(http.StatusOK, "application/xml; charset=utf-8", out)
		return
	}
	c.Data(http.StatusOK, "application/xml; charset=utf-8", plainXML)
}

func (h *Handlers) sendWechatCustomText(openID, content string) error {
	cfg := h.wechatConfig()
	if cfg.AppID == "" || cfg.AppSecret == "" {
		return errors.New("wechat app credentials missing")
	}
	token, err := h.fetchWechatAccessToken(cfg.AppID, cfg.AppSecret)
	if err != nil {
		return err
	}
	payload := map[string]any{
		"touser":  openID,
		"msgtype": "text",
		"text":    map[string]string{"content": content},
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, "https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token="+token, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("wechat custom send: %s", string(b))
	}
	return nil
}

func (h *Handlers) fetchWechatAccessToken(appID, appSecret string) (string, error) {
	cacheKey := "wechat:access_token:" + appID
	if raw, err := h.cache.Get(context.Background(), cacheKey); err == nil {
		if s, ok := raw.(string); ok && s != "" {
			return s, nil
		}
	}
	url := fmt.Sprintf("https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=%s&secret=%s", appID, appSecret)
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var parsed struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		ErrCode     int    `json:"errcode"`
		ErrMsg      string `json:"errmsg"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", err
	}
	if parsed.AccessToken == "" {
		return "", fmt.Errorf("wechat token: %s", parsed.ErrMsg)
	}
	ttl := time.Duration(parsed.ExpiresIn-120) * time.Second
	if ttl < time.Minute {
		ttl = time.Minute
	}
	h.cache.Set(context.Background(), cacheKey, parsed.AccessToken, ttl)
	return parsed.AccessToken, nil
}
