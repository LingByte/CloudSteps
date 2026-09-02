package handlers

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/pkg/notify"
	"github.com/LingByte/ling-base/apidocs/humax"
	lbconstants "github.com/LingByte/ling-base/common/constants"

	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/CloudStepsGo/internal/constants"
	"github.com/LingByte/CloudStepsGo/internal/models"
	middleware "github.com/LingByte/CloudStepsGo/pkg/middlewares"
	"github.com/LingByte/CloudStepsGo/pkg/stores"
	"github.com/LingByte/CloudStepsGo/pkg/utils"
	"github.com/LingByte/ling-base/captcha"
	common "github.com/LingByte/ling-base/common"
	lbconfig "github.com/LingByte/ling-base/common/config"
	"github.com/LingByte/ling-base/common/geoip"
	"github.com/LingByte/ling-base/common/logger"
	"github.com/LingByte/ling-base/common/random"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// registerAuthRoutes User Module
func (h *Handlers) registerAuthRoutes(r *humax.Group) {
	authG := r.Group(configs.Global.Server.AuthPrefix)
	// IP-based auth throttle (ling-base); covers unauthenticated login/register
	// where the global RateLimiter endpoint buckets require a user id.
	authLimit := middleware.AuthRateLimiter(30, time.Minute, 30)
	{
		authG.POST("/register", authLimit, h.handleUserSignup)
		authG.POST("/register/email", authLimit, h.handleUserSignupByEmail)
		authG.POST("/send/email", authLimit, h.handleSendEmailCode)

		// captcha
		authG.GET("/captcha", h.handleGetCaptcha)
		authG.POST("/captcha/verify", authLimit, h.handleVerifyCaptcha)

		// password encryption salt
		authG.GET("/salt", h.handleGetSalt)

		// login
		authG.POST("/login/password", authLimit, h.handleUserSigninByPassword)
		authG.POST("/login/email", authLimit, h.handleUserSigninByEmail)

		// WeChat official account login (follow + verification code + poll)
		authG.POST("/wechat/login/session", authLimit, h.handleWechatLoginStartSession)
		authG.GET("/wechat/login/status", authLimit, h.handleWechatLoginStatus)
		authG.POST("/wechat/login/verify", authLimit, h.handleWechatLoginVerify)
		authG.GET("/wechat/mp/message", h.handleWechatMPMessageVerify)
		authG.POST("/wechat/mp/message", h.handleWechatMPMessage)

		// logout
		authG.GET("/logout", middleware.Required, h.handleUserLogout)
		authG.GET("/info", middleware.Required, h.handleUserInfo)

		// password management
		authG.POST("/reset-password", authLimit, h.handleResetPassword)
		authG.POST("/reset-password/confirm", authLimit, h.handleResetPasswordConfirm)
		authG.POST("/change-password", middleware.Required, h.handleChangePassword)
		authG.POST("/change-password/email", middleware.Required, h.handleChangePasswordByEmail)

		// email verification
		authG.GET("/verify-email", h.handleVerifyEmail)
		authG.POST("/send-email-verification", middleware.Required, h.handleSendEmailVerification)

		// bind email (for password-registered users to bind an email)
		authG.POST("/bind-email", middleware.Required, h.handleBindEmail)
		authG.POST("/send/bind-email", middleware.Required, h.handleSendBindEmailCode)

		// user management
		authG.PUT("/update", middleware.Required, h.handleUserUpdate)
		authG.PUT("/update/preferences", middleware.Required, h.handleUserUpdatePreferences)
		authG.POST("/update/basic/info", middleware.Required, h.handleUserUpdateBasicInfo)

		// notification settings
		authG.PUT("/notification-settings", middleware.Required, h.handleUpdateNotificationSettings)

		// user preferences
		authG.PUT("/user-preferences", middleware.Required, h.handleUpdateUserPreferences)

		// user stats
		authG.GET("/stats", middleware.Required, h.handleGetUserStats)

		// avatar upload (replace existing avatar)
		authG.POST("/avatar/upload", middleware.Required, h.handleUploadAvatar)

		// user activity logs
		authG.GET("/activity", middleware.Required, h.handleGetUserActivity)

		// self-service account deactivation
		authG.POST("/deactivate", middleware.Required, h.handleUserDeactivateAccount)
	}
}

// handleUserLogout handle user logout
func (h *Handlers) handleUserLogout(c *gin.Context) {
	user := middleware.CurrentUser(c)
	if user != nil {
		models.Logout(c, user)
	}
	next := c.Query("next")
	if next != "" {
		c.Redirect(http.StatusFound, next)
		return
	}
	response.SuccessI18n(c, "auth.logout_success", nil)
}

// handleUserDeactivateAccount POST /auth/deactivate — 用户自助注销账号。
func (h *Handlers) handleUserDeactivateAccount(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	user := middleware.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "common.login_required", errors.New("unauthorized"))
		return
	}
	if user.IsAdmin() {
		response.FailI18n(c, "auth.admin_cannot_deactivate", errors.New("admin cannot self-deactivate"))
		return
	}

	operator := user.Username
	var errDelete error
	if user.Role == models.RoleTeacher || user.IsTeacher() {
		errDelete = models.SoftDeleteTeacherWithStudents(db, user.ID, operator)
	} else {
		errDelete = models.SoftDeleteUser(db, user.ID, operator)
	}
	if errDelete != nil {
		response.FailI18n(c, "common.deactivate_failed", errDelete)
		return
	}

	models.Logout(c, user)
	response.SuccessI18n(c, "common.deactivated", nil)
}

// handleUserInfo handle user info
func (h *Handlers) handleUserInfo(c *gin.Context) {
	user := middleware.CurrentUser(c)
	if user == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	withToken := c.Query("with_token")
	if withToken != "" {
		expired, err := time.ParseDuration(withToken)
		if err == nil {
			if expired >= 24*time.Hour {
				expired = 24 * time.Hour
			}
			user.AuthToken = models.BuildAuthToken(user, expired, false)
		}
	}
	models.FillProfileComplete(user)
	response.SuccessI18n(c, "common.success", user)
}

// handleUserSigninByUsername handle user signin by username
func (h *Handlers) handleUserSigninByUsername(c *gin.Context) {
	var form models.UserOperatorForm
	if err := c.BindJSON(&form); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	if form.Username == "" && form.Email != "" {
		form.Username = form.Email
	}
	if err := utils.PrepareEmailCodeLogin(&form); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	clientIP := c.ClientIP()
	userAgent := c.Request.UserAgent()
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)

	// 1. 图形验证码验证
	if captcha.GlobalManager != nil {
		if form.CaptchaID == "" || form.CaptchaType == "" {
			response.FailI18n(c, "common.captcha_required", nil)
			return
		}

		err := captcha.ValidatePayload(form.CaptchaID, form.CaptchaType, form.CaptchaValue)
		if err != nil {
			response.FailI18n(c, "common.captcha_invalid", nil)
			return
		}
	}

	// 2. 获取用户
	user, err := models.GetUserByUsername(db, form.Username)
	if err != nil {
		response.FailI18n(c, "auth.user_not_found", errors.New("user not exists"))
		return
	}

	// 3. 校验验证码
	// 从缓存中获取验证码
	cachedCode, errCache := h.cache.Get(context.Background(), form.Username)
	if errCache != nil || cachedCode != form.Code {
		response.FailI18n(c, "common.captcha_invalid", nil)
		return
	}

	// 清除已用验证码
	h.cache.Delete(context.Background(), form.Username)

	// 4. 检查用户是否允许登录（激活、启用等）
	err = models.CheckUserAllowLogin(db, user)
	if err != nil {
		response.AbortWithStatusJSON(c, http.StatusForbidden, err)
		return
	}

	// 5. 获取IP地理位置
	country, city, location := "Unknown", "Unknown", "Unknown"
	if c, ci, l, err := geoip.GetIPLocation(clientIP); err == nil {
		country, city, location = c, ci, l
	}

	// 6. 解析设备信息
	deviceType, os, browser := utils.ParseUserAgent(userAgent)
	deviceID := utils.GetDeviceID(userAgent, clientIP)

	// 7. 创建设备记录（仅用于记录，不做验证）
	if _, err := models.CreateOrUpdateUserDevice(db, user.ID, deviceID, fmt.Sprintf("%s on %s", browser, os), deviceType, os, browser, userAgent, clientIP, location); err != nil {
		logger.Warn("Failed to create/update user device", zap.Error(err))
	}

	// 8. 记录登录历史
	if err := models.RecordLoginHistory(db, user.ID, form.Username, clientIP, location, country, city, userAgent, deviceID, "email", true, "", false); err != nil {
		logger.Warn("Failed to record login history", zap.Error(err))
	}

	// 9. 发送新设备登录通知
	deviceInfo := map[string]interface{}{
		"deviceID":   deviceID,
		"clientIP":   clientIP,
		"location":   location,
		"deviceType": deviceType,
		"os":         os,
		"browser":    browser,
		"loginTime":  time.Now().Format("2006-01-02 15:04:05"),
	}
	common.Sig().Emit(constants.SigUserNewDeviceLogin, user, deviceInfo, db)

	// 执行登录操作（设置session等）
	models.Login(c, user)

	// 检查是否被中止
	if c.IsAborted() {
		return
	}

	// 重新从数据库加载用户信息，确保获取最新的LastLogin等信息
	updatedUser, err := models.GetUserByUID(db, user.ID)
	if err != nil {
		logger.Warn("Failed to reload user after login, using original user object", zap.Error(err))
		updatedUser = user // 如果加载失败，使用原始user对象
	} else {
		user = updatedUser // 使用更新后的用户信息
	}

	// 如果需要 Token，生成 AuthToken
	expired := h.authTokenTTL()
	user.AuthToken = models.BuildAuthToken(user, expired, false)

	// 返回登录结果
	responseData := gin.H{
		"token": user.AuthToken,
		"user": gin.H{
			"id":          user.ID,
			"email":       firstNonEmpty(user.Email, user.Username),
			"account":     user.Username,
			"displayName": user.DisplayName,
			"role":        user.Role,
			"avatar":      user.Avatar,
		},
	}

	response.SuccessI18n(c, "auth.login_success", responseData)
}

// handleUserSigninByEmail 邮箱验证码登录（账号即 users.username，通常为邮箱）。
func (h *Handlers) handleUserSigninByEmail(c *gin.Context) {
	h.handleUserSigninByUsername(c)
}

// handleUserSignin handle user signin
func (h *Handlers) handleUserSigninByPassword(c *gin.Context) {
	var form models.LoginForm
	if err := c.BindJSON(&form); err != nil {
		logger.Error("Failed to bind login form", zap.Error(err))
		response.FailI18n(c, "auth.login_failed", err)
		return
	}
	if form.Username == "" && form.Email != "" {
		form.Username = form.Email
	}
	if form.AuthToken == "" {
		if err := utils.PreparePasswordLogin(&form); err != nil {
			response.FailI18n(c, "common.operation_failed", err)
			return
		}
	}

	clientIP := c.ClientIP()
	userAgent := c.Request.UserAgent()
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)

	// 1. 获取用户
	var user *models.User
	var err error
	if form.Password != "" {
		user, err = models.GetUserByLoginAccount(db, form.Username)
		if err != nil {
			logger.Warn("Login attempt with non-existent account", zap.String("account", form.Username), zap.String("ip", clientIP), zap.Error(err))
			response.FailI18n(c, "auth.user_not_found", nil)
			return
		}

		// 2. 图形验证码验证（密码登录需要）
		if captcha.GlobalManager != nil {
			if form.CaptchaID == "" || form.CaptchaType == "" {
				logger.Warn("Login failed: captcha is required", zap.String("email", form.Username), zap.Uint("userID", user.ID), zap.String("ip", clientIP))
				response.FailI18n(c, "common.captcha_required", nil)
				return
			}

			err := captcha.ValidatePayload(form.CaptchaID, form.CaptchaType, form.CaptchaValue)
			if err != nil {
				logger.Warn("Login failed: invalid captcha code", zap.String("email", form.Username), zap.Uint("userID", user.ID), zap.String("ip", clientIP), zap.String("captchaID", form.CaptchaID), zap.Error(err))
				response.FailI18n(c, "common.captcha_invalid", nil)
				return
			}
		}

		// 3. 验证密码（支持加密密码和明文密码）
		passwordValid := false
		// 检查是否是加密密码格式（passwordHash:encryptedHash:salt:timestamp）
		if strings.Contains(form.Password, ":") && len(strings.Split(form.Password, ":")) == 4 {
			// 加密密码验证
			logger.Info("Verifying encrypted password",
				zap.String("email", form.Username))
			passwordValid = models.VerifyEncryptedPassword(form.Password, user.Password)
			logger.Info("Encrypted password verification result",
				zap.String("email", form.Username),
				zap.Bool("valid", passwordValid))
		} else {
			// 明文密码（向后兼容）
			passwordValid = models.CheckPassword(user, form.Password)
		}

		if !passwordValid {
			logger.Warn("Login failed: incorrect password", zap.String("email", form.Username), zap.Uint("userID", user.ID), zap.String("ip", clientIP))
			response.FailI18n(c, "common.password_incorrect", nil)
			return
		}
	} else {
		user, err = models.DecodeHashToken(db, form.AuthToken, false)
		if err != nil {
			logger.Warn("Login failed: invalid auth token", zap.String("ip", clientIP), zap.Error(err))
			response.FailI18n(c, "auth.login_failed", err)
			return
		}
	}

	err = models.CheckUserAllowLogin(db, user)
	if err != nil {
		logger.Warn("Login failed: user not allowed to login", zap.String("email", form.Username), zap.Uint("userID", user.ID), zap.String("ip", clientIP), zap.Error(err))
		response.FailI18n(c, "auth.no_login_authorization", err)
		return
	}

	// 4. 获取IP地理位置
	country, city, location := "Unknown", "Unknown", "Unknown"
	if c, ci, l, err := geoip.GetIPLocation(clientIP); err == nil {
		country, city, location = c, ci, l
	}

	// 5. 解析设备信息
	deviceType, os, browser := utils.ParseUserAgent(userAgent)
	deviceID := utils.GetDeviceID(userAgent, clientIP)

	// 6. 创建设备记录（仅用于记录，不做验证）
	if _, err := models.CreateOrUpdateUserDevice(db, user.ID, deviceID, fmt.Sprintf("%s on %s", browser, os), deviceType, os, browser, userAgent, clientIP, location); err != nil {
		logger.Warn("Failed to create/update user device", zap.Error(err))
	}

	// 7. 记录登录历史
	if err := models.RecordLoginHistory(db, user.ID, form.Username, clientIP, location, country, city, userAgent, deviceID, "password", true, "", false); err != nil {
		logger.Warn("Failed to record login history", zap.Error(err))
	}

	// 8. 发送新设备登录通知
	deviceInfo := map[string]interface{}{
		"deviceID":   deviceID,
		"clientIP":   clientIP,
		"location":   location,
		"deviceType": deviceType,
		"os":         os,
		"browser":    browser,
		"loginTime":  time.Now().Format("2006-01-02 15:04:05"),
	}
	common.Sig().Emit(constants.SigUserNewDeviceLogin, user, deviceInfo, db)

	// 执行登录操作（设置session等）
	models.Login(c, user)

	// 检查是否被中止（models.Login内部可能出错并中止请求）
	if c.IsAborted() {
		logger.Error("Login failed: models.Login aborted the request", zap.String("email", form.Username), zap.Uint("userID", user.ID), zap.String("ip", clientIP))
		return
	}
	updatedUser, err := models.GetUserByUID(db, user.ID)
	if err != nil {
		logger.Warn("Failed to reload user after login, using original user object", zap.Error(err))
		updatedUser = user // 如果加载失败，使用原始user对象
	} else {
		user = updatedUser // 使用更新后的用户信息
	}

	// 生成认证Token
	expired := h.authTokenTTL()
	user.AuthToken = models.BuildAuthToken(user, expired, false)

	// 8. 返回登录结果
	responseData := gin.H{
		"token": user.AuthToken,
		"user": gin.H{
			"id":          user.ID,
			"email":       firstNonEmpty(user.Email, user.Username),
			"account":     user.Username,
			"displayName": user.DisplayName,
			"role":        user.Role,
			"avatar":      user.Avatar,
		},
	}

	logger.Info("Login successful", zap.String("email", form.Username), zap.Uint("userID", user.ID), zap.String("ip", clientIP))
	response.SuccessI18n(c, "auth.login_success", responseData)
}

// handleUserSignup handle user signup
func (h *Handlers) handleUserSignup(c *gin.Context) {
	var form models.RegisterUserForm
	if err := c.BindJSON(&form); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}

	clientIP := c.ClientIP()

	if err := utils.PreparePasswordRegister(&form); err != nil {
		failUserMessage(c, err)
		return
	}

	// 2. 图形验证码验证
	if captcha.GlobalManager != nil {
		if form.CaptchaID == "" || form.CaptchaType == "" {
			if utils.GlobalRegistrationGuard != nil {
				utils.GlobalRegistrationGuard.RecordRegistrationAttempt(clientIP, form.Username, false, "captcha required")
			}
			response.FailI18n(c, "common.captcha_required", nil)
			return
		}

		err := captcha.ValidatePayload(form.CaptchaID, form.CaptchaType, form.CaptchaValue)
		if err != nil {
			if utils.GlobalRegistrationGuard != nil {
				utils.GlobalRegistrationGuard.RecordRegistrationAttempt(clientIP, form.Username, false, "invalid captcha")
			}
			response.FailI18n(c, "common.captcha_invalid", nil)
			return
		}
	}

	// 4. 注册防护检查
	if utils.GlobalRegistrationGuard != nil {
		if err := utils.GlobalRegistrationGuard.CheckRegistrationAllowed(clientIP, form.Username, form.Password); err != nil {
			utils.GlobalRegistrationGuard.RecordRegistrationAttempt(clientIP, form.Username, false, err.Error())
			failUserMessage(c, err)
			return
		}
	}

	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	if models.IsExistsByUsername(db, form.Username) {
		if utils.GlobalRegistrationGuard != nil {
			utils.GlobalRegistrationGuard.RecordRegistrationAttempt(clientIP, form.Username, false, "username already exists")
		}
		response.FailI18n(c, "auth.username_exists", nil)
		return
	}

	// 处理加密密码：如果是加密格式，提取原始密码哈希
	passwordToStore := form.Password
	if strings.Contains(form.Password, ":") && len(strings.Split(form.Password, ":")) == 4 {
		// 加密密码格式：passwordHash:encryptedHash:salt:timestamp
		parts := strings.Split(form.Password, ":")
		passwordHash := parts[0]
		// 提取原始密码的哈希，加上 sha256$ 前缀
		passwordToStore = fmt.Sprintf("sha256$%s", passwordHash)
	}

	user, err := models.CreateUser(db, form.Username, passwordToStore)
	if err != nil {
		if utils.GlobalRegistrationGuard != nil {
			utils.GlobalRegistrationGuard.RecordRegistrationAttempt(clientIP, form.Username, false, err.Error())
		}
		logger.Warn("create user failed", zap.String("username", form.Username), zap.Error(err))
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}

	// 记录成功注册
	if utils.GlobalRegistrationGuard != nil {
		utils.GlobalRegistrationGuard.RecordRegistrationAttempt(clientIP, form.Username, true, "registration successful")
	}

	if strings.TrimSpace(form.DisplayName) == "" {
		form.DisplayName = form.Username
	}

	vals := utils.StructAsMap(form, []string{
		"DisplayName",
		"FirstName",
		"LastName",
		"Locale",
		"Source"})

	n := time.Now().Truncate(1 * time.Second)
	vals["LastLogin"] = &n
	vals["LastLoginIP"] = c.ClientIP()

	user.DisplayName = form.DisplayName
	user.FirstName = form.FirstName
	user.LastName = form.LastName
	user.Locale = form.Locale
	user.Source = "ADMIN"
	user.LastLogin = &n
	user.LastLoginIP = c.ClientIP()

	err = models.UpdateUserFields(db, user, vals)
	if err != nil {
		logger.Warn("update user fields fail id:", zap.Uint("userId", user.ID), zap.Any("vals", vals), zap.Error(err))
	}

	common.Sig().Emit(constants.SigUserCreate, user, c, db)

	err = models.CheckUserAllowLogin(db, user)
	if err != nil {
		response.AbortWithStatusJSON(c, http.StatusForbidden, err)
		return
	}
	models.Login(c, user)
	response.SuccessI18n(c, "auth.register_success", gin.H{
		"username": user.Username,
		"email":    user.Email,
	})
}

// handleUserSignupByEmail email register email activation
func (h *Handlers) handleUserSignupByEmail(c *gin.Context) {
	var form models.UserOperatorForm
	if err := c.BindJSON(&form); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}

	clientIP := c.ClientIP()

	if err := utils.PrepareEmailRegister(&form); err != nil {
		failUserMessage(c, err)
		return
	}

	// 2. 图形验证码验证
	if captcha.GlobalManager != nil {
		if form.CaptchaID == "" || form.CaptchaType == "" {
			if utils.GlobalRegistrationGuard != nil {
				utils.GlobalRegistrationGuard.RecordRegistrationAttempt(clientIP, form.Username, false, "captcha required")
			}
			response.FailI18n(c, "common.captcha_required", nil)
			return
		}

		err := captcha.ValidatePayload(form.CaptchaID, form.CaptchaType, form.CaptchaValue)
		if err != nil {
			if utils.GlobalRegistrationGuard != nil {
				utils.GlobalRegistrationGuard.RecordRegistrationAttempt(clientIP, form.Username, false, "invalid captcha")
			}
			response.FailI18n(c, "common.captcha_invalid", nil)
			return
		}
	}

	// 3. 注册防护检查
	if utils.GlobalRegistrationGuard != nil {
		if err := utils.GlobalRegistrationGuard.CheckRegistrationAllowed(clientIP, form.Username, form.Password); err != nil {
			utils.GlobalRegistrationGuard.RecordRegistrationAttempt(clientIP, form.Username, false, err.Error())
			failUserMessage(c, err)
			return
		}
	}

	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	if models.IsExistsByUsername(db, form.Username) || models.IsExistsByEmail(db, form.Username) {
		if utils.GlobalRegistrationGuard != nil {
			utils.GlobalRegistrationGuard.RecordRegistrationAttempt(clientIP, form.Username, false, "username already exists")
		}
		response.FailI18n(c, "auth.username_exists", nil)
		return
	}
	// 从缓存中获取验证码（假设你使用的是 util.GlobalCache）
	cachedCode, errCache := h.cache.Get(context.Background(), form.Username)
	ok := errCache == nil
	if !ok || cachedCode != form.Code {
		if utils.GlobalRegistrationGuard != nil {
			utils.GlobalRegistrationGuard.RecordRegistrationAttempt(clientIP, form.Username, false, "invalid verification code")
		}
		response.FailI18n(c, "common.captcha_invalid", nil)
		return
	}

	// 清除已用验证码
	h.cache.Delete(context.Background(), form.Username)

	// 处理加密密码：如果是加密格式，提取原始密码哈希
	passwordToStore := form.Password
	if strings.Contains(form.Password, ":") && len(strings.Split(form.Password, ":")) == 4 {
		// 加密密码格式：passwordHash:encryptedHash:salt:timestamp
		parts := strings.Split(form.Password, ":")
		passwordHash := parts[0]
		// 提取原始密码的哈希，加上 sha256$ 前缀（HashPassword 会检查并直接返回）
		passwordToStore = fmt.Sprintf("sha256$%s", passwordHash)
	}

	user, err := models.CreateUser(db, form.Username, passwordToStore)
	if err != nil {
		if utils.GlobalRegistrationGuard != nil {
			utils.GlobalRegistrationGuard.RecordRegistrationAttempt(clientIP, form.Username, false, err.Error())
		}
		logger.Warn("create user failed", zap.Any("email", form.Username), zap.Error(err))
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}

	// 邮箱注册：账号即邮箱，默认绑定 email 字段
	if strings.Contains(form.Username, "@") {
		if err := models.SetEmail(db, user, form.Username); err != nil {
			logger.Warn("bind email on register failed", zap.Uint("userId", user.ID), zap.Error(err))
		}
	}

	// 记录成功注册
	if utils.GlobalRegistrationGuard != nil {
		utils.GlobalRegistrationGuard.RecordRegistrationAttempt(clientIP, form.Username, true, "registration successful")
	}
	user.DisplayName = form.DisplayName
	vals := utils.StructAsMap(form, []string{
		"DisplayName",
		"FirstName",
		"LastName",
		"Locale",
		"Source"})
	user.Source = strings.TrimSpace(form.Source)
	if user.Source == "" {
		user.Source = "WEB"
	}
	err = models.UpdateUserFields(db, user, vals)
	if err != nil {
		logger.Warn("update user fields fail id:", zap.Uint("userId", user.ID), zap.Any("vals", vals), zap.Error(err))
	}
	common.Sig().Emit(constants.SigUserCreate, user, db)
	sendHashMail(db, user, constants.SigUserVerifyEmail, constants.KEY_VERIFY_EMAIL_EXPIRED, "180d", c.ClientIP(), c.Request.UserAgent(), h.configStore)
	response.SuccessI18n(c, "auth.register_success", user)
}

// handleUserUpdate Update User Info
func (h *Handlers) handleUserUpdate(c *gin.Context) {
	var req models.UpdateUserRequest
	if err := c.ShouldBind(&req); err != nil {
		response.FailI18n(c, "msg.446b416d", err)
		return
	}

	user := middleware.CurrentUser(c)
	vals := make(map[string]interface{})

	if req.Username != "" {
		vals["username"] = req.Username
	}
	if req.Phone != "" {
		vals["phone"] = req.Phone
	}
	if req.Email != "" {
		email := strings.ToLower(strings.TrimSpace(req.Email))
		if email != "" && models.IsExistsByEmail(h.db, email, user.ID) {
			response.FailI18n(c, "auth.email_already_bound_other", errors.New("email already bound"))
			return
		}
		vals["email"] = email
	}
	if req.FirstName != "" {
		vals["first_name"] = req.FirstName
	}
	if req.LastName != "" {
		vals["last_name"] = req.LastName
	}
	if req.DisplayName != "" {
		vals["display_name"] = req.DisplayName
	}
	if req.Locale != "" {
		vals["locale"] = req.Locale
	}
	if req.Gender != "" {
		vals["gender"] = req.Gender
	}
	if req.Extra != "" {
		vals["extra"] = req.Extra
	}
	if req.Avatar != "" {
		vals["avatar"] = req.Avatar
	}
	if req.City != "" {
		vals["city"] = req.City
	}
	if req.Region != "" {
		vals["region"] = req.Region
	}

	err := models.UpdateUser(h.db, user, vals)
	if err != nil {
		response.FailI18n(c, "auth.update_user_failed", err)
		return
	}

	// 重新获取更新后的用户信息
	updatedUser, err := models.GetUserByUID(h.db, user.ID)
	if err != nil {
		response.FailI18n(c, "auth.get_updated_user_failed", err)
		return
	}

	// 更新资料完整度
	if err := models.UpdateProfileComplete(h.db, updatedUser); err != nil {
		logger.Warn("Failed to update profile complete", zap.Error(err))
	}
	response.SuccessI18n(c, "auth.update_user_success", updatedUser)
}

// handleUserUpdate Update User Info
func (h *Handlers) handleUserUpdateBasicInfo(c *gin.Context) {
	var req models.UserBasicInfoUpdate
	if err := c.ShouldBind(&req); err != nil {
		response.FailI18n(c, "msg.446b416d", err)
		return
	}
	user := middleware.CurrentUser(c)
	vals := make(map[string]interface{})

	if req.WifiName != "" {
		vals["wifiName"] = req.WifiName
	}
	if req.WifiPassword != "" {
		vals["wifiPassword"] = req.WifiPassword
	}
	if req.FatherCallName != "" {
		vals["fatherCallName"] = req.FatherCallName
	}
	if req.MotherCallName != "" {
		vals["motherCallName"] = req.MotherCallName
	}
	err := models.UpdateUser(h.db, user, vals)
	if err != nil {
		response.FailI18n(c, "auth.update_user_failed", err)
		return
	}
	response.SuccessI18n(c, "auth.update_user_success", nil)
}

func (h *Handlers) handleUserUpdatePreferences(c *gin.Context) {
	var preferences struct {
		EmailNotifications    *bool   `json:"emailNotifications"`
		AutoCleanUnreadEmails *bool   `json:"autoCleanUnreadEmails"`
		ReviewCurvePreset     *string `json:"reviewCurvePreset"`
	}
	if err := c.ShouldBindJSON(&preferences); err != nil {
		response.FailI18n(c, "msg.446b416d", err)
		return
	}

	vals := make(map[string]any)
	if preferences.EmailNotifications != nil {
		vals["email_notifications"] = *preferences.EmailNotifications
	}
	if preferences.AutoCleanUnreadEmails != nil {
		vals["auto_clean_unread_emails"] = *preferences.AutoCleanUnreadEmails
	}
	if preferences.ReviewCurvePreset != nil {
		vals["review_curve_preset"] = string(models.NormalizeReviewCurvePreset(*preferences.ReviewCurvePreset))
	}
	if len(vals) == 0 {
		response.SuccessI18n(c, "auth.no_preferences_changed", nil)
		return
	}

	user := middleware.CurrentUser(c)
	if err := models.UpdateUser(h.db, user, vals); err != nil {
		response.FailI18n(c, "auth.update_user_failed", err)
		return
	}
	response.SuccessI18n(c, "auth.preferences_updated", nil)
}

// handleChangePassword 修改密码
func (h *Handlers) handleChangePassword(c *gin.Context) {
	// 兼容前端字段：currentPassword/newPassword/confirmPassword
	// 以及旧字段：oldPassword/newPassword
	var form struct {
		OldPassword     string `json:"oldPassword"`
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
		ConfirmPassword string `json:"confirmPassword"`
	}

	if err := c.ShouldBindJSON(&form); err != nil {
		response.FailI18n(c, "msg.446b416d", err)
		return
	}

	// 归一化旧密码字段
	oldPassword := form.OldPassword
	if oldPassword == "" {
		oldPassword = form.CurrentPassword
	}

	// 校验必填与确认密码一致
	if oldPassword == "" {
		response.FailI18n(c, "auth.old_password_required", errors.New("old password is required"))
		return
	}
	if form.NewPassword == "" {
		response.FailI18n(c, "auth.new_password_required", errors.New("new password is required"))
		return
	}
	if len(form.NewPassword) < 6 {
		response.FailI18n(c, "auth.password_too_short", errors.New("password too short"))
		return
	}
	if form.ConfirmPassword != "" && form.ConfirmPassword != form.NewPassword {
		response.FailI18n(c, "auth.confirm_password_mismatch", errors.New("confirm password mismatch"))
		return
	}

	user := middleware.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.user_not_found", errors.New("user not found"))
		return
	}

	if err := models.ChangePassword(h.db, user, oldPassword, form.NewPassword); err != nil {
		response.FailI18n(c, "auth.password_change_failed", err)
		return
	}

	// 修改密码成功后强制下线，要求重新登录
	models.Logout(c, user)
	response.SuccessI18n(c, "auth.password_changed", map[string]any{"logout": true})
}

// handleChangePasswordByUsername 通过用户名验证码修改密码
func (h *Handlers) handleChangePasswordByEmail(c *gin.Context) {
	var form struct {
		UsernameCode    string `json:"usernameCode" binding:"required"`
		NewPassword     string `json:"newPassword" binding:"required"`
		ConfirmPassword string `json:"confirmPassword"`
	}

	if err := c.ShouldBindJSON(&form); err != nil {
		response.FailI18n(c, "msg.446b416d", err)
		return
	}

	// 校验必填与确认密码一致
	if form.NewPassword == "" {
		response.FailI18n(c, "common.new_password_required", errors.New("new password is required"))
		return
	}
	if len(form.NewPassword) < 6 {
		response.FailI18n(c, "common.password_too_short", errors.New("password too short"))
		return
	}
	if form.ConfirmPassword != "" && form.ConfirmPassword != form.NewPassword {
		response.FailI18n(c, "common.confirm_password_mismatch", errors.New("confirm password mismatch"))
		return
	}

	user := middleware.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.user_not_found", errors.New("user not found"))
		return
	}

	// 验证用户名验证码
	if form.UsernameCode == "" {
		response.FailI18n(c, "auth.username_code_required", errors.New("username code is required"))
		return
	}

	// 从缓存中获取验证码
	cachedCode, errCache := h.cache.Get(context.Background(), user.Username)
	ok := errCache == nil
	if !ok || cachedCode != form.UsernameCode {
		response.FailI18n(c, "auth.username_code_invalid", errors.New("invalid or expired username code"))
		return
	}

	// 清除已用验证码
	h.cache.Delete(context.Background(), user.Username)

	// 设置新密码（不验证旧密码）
	err := models.SetPassword(h.db, user, form.NewPassword)
	if err != nil {
		response.FailI18n(c, "common.password_change_failed", err)
		return
	}

	// 更新最后密码修改时间
	now := time.Now()
	err = models.UpdateUserFields(h.db, user, map[string]any{
		"LastPasswordChange": &now,
	})
	if err != nil {
		response.FailI18n(c, "auth.password_time_update_failed", err)
		return
	}

	user.LastPasswordChange = &now

	// 修改密码成功后强制下线，要求重新登录
	models.Logout(c, user)
	response.SuccessI18n(c, "common.password_changed", map[string]any{"logout": true})
}

// handleResetPassword 重置密码请求
func (h *Handlers) handleResetPassword(c *gin.Context) {
	var form struct {
		Username string `json:"username" binding:"required"`
	}

	if err := c.ShouldBindJSON(&form); err != nil {
		response.FailI18n(c, "msg.446b416d", err)
		return
	}

	user, err := models.GetUserByUsername(h.db, form.Username)
	if err != nil {
		response.SuccessI18n(c, "auth.reset_link_sent", nil)
		return
	}

	token, err := models.GeneratePasswordResetToken(h.db, user)
	if err != nil {
		response.FailI18n(c, "auth.generate_reset_token_failed", err)
		return
	}

	// 发射密码重置信号
	common.Sig().Emit(constants.SigUserResetPassword, user, token, c.ClientIP(), c.Request.UserAgent(), h.db)

	response.SuccessI18n(c, "auth.reset_link_sent", nil)
}

// handleResetPasswordConfirm 确认重置密码
func (h *Handlers) handleResetPasswordConfirm(c *gin.Context) {
	var form struct {
		Token    string `json:"token" binding:"required"`
		Password string `json:"password" binding:"required,min=6"`
	}

	if err := c.ShouldBindJSON(&form); err != nil {
		response.FailI18n(c, "msg.446b416d", err)
		return
	}

	user, err := models.VerifyPasswordResetToken(h.db, form.Token)
	if err != nil {
		response.FailI18n(c, "auth.invalid_token", err)
		return
	}

	err = models.ResetPassword(h.db, user, form.Password)
	if err != nil {
		response.FailI18n(c, "auth.password_reset_failed", err)
		return
	}

	response.SuccessI18n(c, "auth.password_reset", nil)
}

// handleVerifyEmail 验证邮箱 - 已移除邮箱功能
func (h *Handlers) handleVerifyEmail(c *gin.Context) {
	response.FailI18n(c, "auth.email_verification_disabled", errors.New("email verification is no longer supported"))
}

// handleSendEmailVerification 发送邮箱验证邮件 - 已移除邮箱功能
func (h *Handlers) handleSendEmailVerification(c *gin.Context) {
	user := middleware.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.user_not_found", errors.New("user not found"))
		return
	}

	logger.Info("Email verification request - disabled",
		zap.Uint("userId", user.ID),
		zap.String("username", user.Username))

	response.FailI18n(c, "auth.email_verification_disabled", errors.New("email verification is no longer supported"))
}

// handleSendBindEmailCode 发送绑定邮箱验证码（6 位数字，缓存 5 分钟）。
// 验证码以 "bind-email:" 前缀 + 邮箱为 key 写入缓存，避免与登录/注册验证码冲突。
func (h *Handlers) handleSendBindEmailCode(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.FailI18n(c, "msg.446b416d", err)
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if err := utils.PrepareSendEmailCode(&models.SendEmailVerifyEmail{Email: email}); err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}

	user := middleware.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.user_not_found", errors.New("user not found"))
		return
	}

	// 同一邮箱不能被其他用户绑定
	if models.IsExistsByEmail(h.db, email, user.ID) {
		response.FailI18n(c, "auth.email_already_bound_other", errors.New("email already bound"))
		return
	}

	clientIP := c.ClientIP()
	text := utils.RandNumberText(6)
	cacheKey := "bind-email:" + email
	h.cache.Set(context.Background(), cacheKey, text, 0)
	go func() {
		mailer := notify.NewMailer(h.db, user.ID, clientIP)
		if err := mailer.SendVerificationCode(email, text); err != nil {
			logger.Warn("send bind-email code failed", zap.String("email", email), zap.Error(err))
		}
	}()
	response.SuccessI18n(c, "common.success", "验证码已发送，请在 5 分钟内完成验证")
}

// handleBindEmail 绑定/换绑邮箱（验证码校验通过后写入 user.email）。
func (h *Handlers) handleBindEmail(c *gin.Context) {
	var form struct {
		Email string `json:"email" binding:"required"`
		Code  string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&form); err != nil {
		response.FailI18n(c, "msg.446b416d", err)
		return
	}
	email := strings.ToLower(strings.TrimSpace(form.Email))
	code := strings.TrimSpace(form.Code)
	if err := utils.PrepareSendEmailCode(&models.SendEmailVerifyEmail{Email: email}); err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	if code == "" {
		response.FailI18n(c, "common.captcha_required", errors.New("code is required"))
		return
	}

	user := middleware.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.user_not_found", errors.New("user not found"))
		return
	}

	// 唯一性：一个邮箱只能绑定一个用户
	if models.IsExistsByEmail(h.db, email, user.ID) {
		response.FailI18n(c, "auth.email_already_bound_other", errors.New("email already bound"))
		return
	}

	// 校验验证码
	cacheKey := "bind-email:" + email
	cachedCode, errCache := h.cache.Get(context.Background(), cacheKey)
	if errCache != nil || cachedCode != code {
		response.FailI18n(c, "common.captcha_invalid", errors.New("invalid or expired code"))
		return
	}
	h.cache.Delete(context.Background(), cacheKey)

	oldEmail := user.Email
	if err := models.SetEmail(h.db, user, email); err != nil {
		response.FailI18n(c, "common.bind_email_failed", err)
		return
	}

	// 通知：换绑时发"邮箱更换完成"通知；首次绑定时只更新本地
	if strings.TrimSpace(oldEmail) != "" && oldEmail != email {
		common.Sig().Emit(constants.SigUserChangeEmailDone, user, oldEmail, email)
	}

	response.SuccessI18n(c, "common.bind_success", gin.H{"email": user.Email})
}

// handleGetSalt 获取随机盐（用于密码加密）
func (h *Handlers) handleGetSalt(c *gin.Context) {
	// 生成随机盐（32字符）
	salt := random.Base64URLString(32)
	timestamp := time.Now().Unix()
	expiresIn := int64(300) // 5分钟有效期

	// 将盐和时间戳存储到缓存中，用于验证
	key := fmt.Sprintf("password_salt:%s", salt)
	if h.cache != nil {
		h.cache.Set(context.Background(), key, timestamp, 0)
	}

	response.SuccessI18n(c, "common.success", gin.H{
		"salt":      salt,
		"timestamp": timestamp,
		"expiresIn": expiresIn,
	})
}

// handleUpdateNotificationSettings 更新通知设置
func (h *Handlers) handleUpdateNotificationSettings(c *gin.Context) {
	var settings map[string]bool

	if err := c.ShouldBindJSON(&settings); err != nil {
		response.FailI18n(c, "msg.446b416d", err)
		return
	}

	user := middleware.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.user_not_found", errors.New("user not found"))
		return
	}

	err := models.UpdateNotificationSettings(h.db, user, settings)
	if err != nil {
		response.FailI18n(c, "auth.notification_settings_update_failed", err)
		return
	}

	response.SuccessI18n(c, "auth.notification_settings_updated", nil)
}

// handleUpdateUserPreferences 更新用户偏好设置
func (h *Handlers) handleUpdateUserPreferences(c *gin.Context) {
	var preferences map[string]string

	if err := c.ShouldBindJSON(&preferences); err != nil {
		response.FailI18n(c, "msg.446b416d", err)
		return
	}

	user := middleware.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.user_not_found", errors.New("user not found"))
		return
	}

	err := models.UpdatePreferences(h.db, user, preferences)
	if err != nil {
		response.FailI18n(c, "auth.preferences_update_failed", err)
		return
	}

	// 更新资料完整度
	err = models.UpdateProfileComplete(h.db, user)
	if err != nil {
		logger.Warn("Failed to update profile complete", zap.Error(err))
	}

	response.SuccessI18n(c, "auth.preferences_updated", nil)
}

// handleGetUserStats 获取用户统计信息
func (h *Handlers) handleGetUserStats(c *gin.Context) {
	user := middleware.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.user_not_found", errors.New("user not found"))
		return
	}

	stats := map[string]interface{}{
		"loginCount":         user.LoginCount,
		"phoneVerified":      user.PhoneVerified,
		"lastLogin":          user.LastLogin,
		"lastPasswordChange": user.LastPasswordChange,
		"createdAt":          user.CreatedAt,
	}

	response.SuccessI18n(c, "auth.stats_retrieved", stats)
}

// handleUploadAvatar 处理用户头像上传（服务端校验大小并统一压缩为 JPEG）
func (h *Handlers) handleUploadAvatar(c *gin.Context) {
	user := middleware.CurrentUser(c)
	if user == nil {
		response.FailI18n(c, "auth.user_not_found", errors.New("user not found"))
		return
	}

	file, header, err := c.Request.FormFile("avatar")
	if err != nil {
		response.FailI18n(c, "storage.select_image", err)
		return
	}
	defer file.Close()

	// 先按声明大小快速拒绝（实际还会 LimitReader 再验一次）
	if header.Size > utils.AvatarMaxUploadBytes {
		response.FailI18n(c, "auth.avatar_too_large", nil, utils.AvatarMaxUploadBytes>>20)
		return
	}

	processed, err := utils.ProcessAvatarImage(file, header.Size)
	if err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}

	fileName := fmt.Sprintf("avatars/%d_%d%s", user.ID, time.Now().Unix(), processed.Ext)
	store := stores.Default()
	if err := store.Write(fileName, bytes.NewReader(processed.Data)); err != nil {
		logger.Error("avatar store write failed",
			zap.String("key", fileName),
			zap.String("kind", stores.DefaultStoreKind),
			zap.Error(err),
		)
		response.FailI18n(c, "auth.avatar_upload_failed", err.Error())
		return
	}

	avatarRelativePath := store.PublicURL(fileName)
	avatarURL := avatarRelativePath

	// 相对路径补全为绝对 URL（便于跨域/反向代理）；本地 /uploads 保持相对更利于前端 resolveMediaUrl
	if strings.HasPrefix(avatarURL, "http://") || strings.HasPrefix(avatarURL, "https://") {
		// 云存储已是完整 URL
	} else if strings.HasPrefix(avatarURL, "/") {
		// DB 存相对路径，前端用 resolveMediaUrl 拼 origin
		avatarURL = avatarRelativePath
	}

	err = models.UpdateUser(h.db, user, map[string]any{
		"avatar": avatarURL,
	})
	if err != nil {
		response.FailI18n(c, "auth.avatar_update_failed", err)
		return
	}

	user.Avatar = avatarURL
	if err := models.UpdateProfileComplete(h.db, user); err != nil {
		logger.Warn("Failed to update profile complete", zap.Error(err))
	}

	response.SuccessI18n(c, "auth.avatar_upload_success", gin.H{
		"avatar": avatarRelativePath,
		"width":  processed.Width,
		"height": processed.Height,
		"bytes":  len(processed.Data),
	})
}

// getFileExtension 获取文件扩展名
func getFileExtension(filename string) string {
	ext := filepath.Ext(filename)
	if ext == "" {
		return ".jpg" // 默认扩展名
	}
	return ext
}

// isDefaultAvatar 检查是否为默认头像
func isDefaultAvatar(avatarURL string) bool {
	// 检查是否包含默认头像的标识
	return strings.Contains(avatarURL, "default") ||
		strings.Contains(avatarURL, "placeholder") ||
		strings.Contains(avatarURL, "gravatar")
}

func sendHashMail(db *gorm.DB, user *models.User, signame, expireKey, defaultExpired, clientIp, useragent string, configStore *lbconfig.Store) {
	d, err := time.ParseDuration(configStore.GetValue(expireKey))
	if err != nil {
		d, _ = time.ParseDuration(defaultExpired)
	}
	n := time.Now().Add(d)
	hash := models.EncodeHashToken(user, n.Unix(), true)

	common.Sig().Emit(signame, user, hash, clientIp, useragent, db)
}

func (h *Handlers) handleSendEmailCode(c *gin.Context) {
	var req models.SendEmailVerifyEmail
	if err := c.BindJSON(&req); err != nil {
		response.AbortWithStatusJSON(c, http.StatusBadRequest, err)
		return
	}
	if err := utils.PrepareSendEmailCode(&req); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}
	req.UserAgent = c.Request.UserAgent()
	req.ClientIp = c.ClientIP()
	text := utils.RandNumberText(6)
	h.cache.Set(context.Background(), req.Email, text, 0)
	go func() {
		mailer := notify.NewMailer(h.db, 0, req.ClientIp)
		if err := mailer.SendVerificationCode(req.Email, text); err != nil {
			logger.Warn("send email code failed", zap.String("email", req.Email), zap.Error(err))
		}
	}()
	response.SuccessI18n(c, "common.success", "Send Email Successful, Must be verified within the valid time [5 minutes]")
}

// handleGetCaptcha 获取验证码（随机类型）
func (h *Handlers) handleGetCaptcha(c *gin.Context) {
	mgr := captcha.EnsureGlobalManager()
	capt, err := mgr.GenerateRandom()
	if err != nil {
		response.FailI18n(c, "auth.generate_captcha_failed", err)
		return
	}
	response.SuccessI18n(c, "common.captcha_generated", gin.H{
		"id":   capt.ID,
		"type": capt.Type,
		"data": capt.Data,
	})
}

// handleVerifyCaptcha 验证验证码
func (h *Handlers) handleVerifyCaptcha(c *gin.Context) {
	var req captcha.Payload
	if err := c.BindJSON(&req); err != nil {
		response.FailI18n(c, "msg.446b416d", err)
		return
	}

	if err := captcha.ValidatePayload(req.ID, string(req.Type), req.Value); err != nil {
		response.FailI18n(c, "msg.f08c2d84", err)
		return
	}
	response.SuccessI18n(c, "common.captcha_verified", gin.H{"valid": true})
}

// handleGetUserActivity 获取用户活动记录
func (h *Handlers) handleGetUserActivity(c *gin.Context) {
	user, exists := c.Get(constants.UserField)
	if !exists {
		response.FailI18n(c, "auth.user_not_found", errors.New("user not found"))
		return
	}

	// 获取查询参数
	page := c.DefaultQuery("page", "1")
	limit := c.DefaultQuery("limit", "20")
	action := c.Query("action") // 可选：按操作类型筛选

	// 转换分页参数
	pageInt, err := strconv.Atoi(page)
	if err != nil || pageInt < 1 {
		pageInt = 1
	}
	limitInt, err := strconv.Atoi(limit)
	if err != nil || limitInt < 1 || limitInt > 100 {
		limitInt = 20
	}

	// 计算偏移量
	offset := (pageInt - 1) * limitInt

	// 构建查询
	query := h.db.Model(&middleware.OperationLog{}).Where("user_id = ?", user.(*models.User).ID)

	// 按操作类型筛选
	if action != "" {
		query = query.Where("action = ?", action)
	}

	// 获取总数
	var total int64
	if err := query.Count(&total).Error; err != nil {
		response.FailI18n(c, "auth.count_activities_failed", err)
		return
	}

	// 获取活动记录
	var activities []middleware.OperationLog
	if err := query.Order("created_at DESC").Limit(limitInt).Offset(offset).Find(&activities).Error; err != nil {
		response.FailI18n(c, "auth.get_activities_failed", err)
		return
	}

	// 格式化响应数据
	activityList := make([]gin.H, 0) // 初始化为空切片，确保JSON序列化为[]
	if len(activities) > 0 {
		activityList = make([]gin.H, 0, len(activities)) // 预分配容量
		for _, activity := range activities {
			activityList = append(activityList, gin.H{
				"id":        activity.ID,
				"action":    activity.Action,
				"target":    activity.Target,
				"details":   activity.Details,
				"ipAddress": activity.IPAddress,
				"userAgent": activity.UserAgent,
				"device":    activity.Device,
				"browser":   activity.Browser,
				"os":        activity.OperatingSystem,
				"location":  activity.Location,
				"createdAt": activity.CreatedAt,
			})
		}
	}

	response.SuccessI18n(c, "auth.activities_retrieved", gin.H{
		"activities": activityList,
		"pagination": gin.H{
			"page":       pageInt,
			"limit":      limitInt,
			"total":      total,
			"totalPages": (total + int64(limitInt) - 1) / int64(limitInt),
		},
	})
}
func (h *Handlers) registerAdminUserRoutes(r *humax.Group) {
	users := r.Group("users")
	users.Use(middleware.Required, middleware.AdminRequired)
	{
		users.GET("", h.handleAdminListUsers)
		users.POST("", h.handleAdminCreateUser)
		users.GET("/:id", h.handleAdminGetUser)
		users.PUT("/:id", h.handleAdminUpdateUser)
		users.DELETE("/:id", h.handleAdminDeleteUser)
	}
}

// GET /users?page=1&pageSize=20&search=&role=&enabled=
func (h *Handlers) handleAdminListUsers(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	search := c.Query("search")
	role := c.Query("role")
	includeDeleted := c.Query("includeDeleted") == "1" || c.Query("includeDeleted") == "true"

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := db.Model(&models.User{})
	if includeDeleted {
		// 管理员需要查看软删用户时，使用 Unscoped 绕过 GORM 的 deleted_at 自动过滤
		query = query.Unscoped()
	}

	if search != "" {
		like := "%" + search + "%"
		query = query.Where("username LIKE ? OR display_name LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ?",
			like, like, like, like, like)
	}
	if role != "" {
		query = query.Where("role = ?", role)
	}

	var total int64
	query.Count(&total)

	var users []models.User
	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&users).Error; err != nil {
		response.FailI18n(c, "common.query_failed", err)
		return
	}

	items := make([]gin.H, 0, len(users))
	for _, u := range users {
		items = append(items, serializeUser(&u))
	}

	response.SuccessI18n(c, "common.ok", gin.H{
		"users":    items,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// GET /users/:id
func (h *Handlers) handleAdminGetUser(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.FailI18n(c, "coaching.invalid_id", err)
		return
	}

	var user models.User
	// 允许查看已注销用户（详情面板需要展示已注销状态）
	if err := db.Where("id = ?", id).First(&user).Error; err != nil {
		response.FailI18n(c, "auth.user_not_found", err)
		return
	}
	response.SuccessI18n(c, "common.ok", serializeUser(&user))
}

// POST /users
func (h *Handlers) handleAdminCreateUser(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)

	var req struct {
		Username    string  `json:"username" binding:"required"`
		Password    *string `json:"password"`
		DisplayName string  `json:"displayName"`
		FirstName   string  `json:"firstName"`
		LastName    string  `json:"lastName"`
		Role        string  `json:"role"`
		Phone       string  `json:"phone"`
		Email       string  `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}

	if models.IsExistsByUsername(db, req.Username) {
		response.FailI18n(c, "auth.username_exists", errors.New("username already exists"))
		return
	}

	// 邮箱唯一性校验
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email != "" && models.IsExistsByEmail(db, email) {
		response.FailI18n(c, "auth.email_already_bound", errors.New("email already bound"))
		return
	}

	role := req.Role
	if role == "" {
		role = "user"
	}

	rawPassword := ""
	if req.Password != nil && *req.Password != "" {
		rawPassword = *req.Password
	} else {
		b := make([]byte, 12)
		rand.Read(b)
		rawPassword = hex.EncodeToString(b)
	}

	user := models.User{
		Username:    req.Username,
		Password:    models.HashPassword(rawPassword),
		DisplayName: req.DisplayName,
		FirstName:   req.FirstName,
		LastName:    req.LastName,
		Role:        role,
		Phone:       req.Phone,
		Email:       email,
		Source:      "admin",
	}

	if err := db.Create(&user).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}
	response.SuccessI18n(c, "common.created", serializeUser(&user))
}

// PUT /users/:id
func (h *Handlers) handleAdminUpdateUser(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.FailI18n(c, "coaching.invalid_id", err)
		return
	}

	var user models.User
	if err := db.Where("id = ?", id).First(&user).Error; err != nil {
		response.FailI18n(c, "auth.user_not_found", err)
		return
	}

	var req struct {
		Username    *string `json:"username"`
		Password    *string `json:"password"`
		DisplayName *string `json:"displayName"`
		FirstName   *string `json:"firstName"`
		LastName    *string `json:"lastName"`
		Role        *string `json:"role"`
		Phone       *string `json:"phone"`
		Email       *string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.FailI18n(c, "common.invalid_params", err)
		return
	}

	updates := map[string]any{}
	if req.Username != nil {
		updates["username"] = *req.Username
	}
	if req.Password != nil && *req.Password != "" {
		updates["password"] = models.HashPassword(*req.Password)
	}
	if req.DisplayName != nil {
		updates["display_name"] = *req.DisplayName
	}
	if req.FirstName != nil {
		updates["first_name"] = *req.FirstName
	}
	if req.LastName != nil {
		updates["last_name"] = *req.LastName
	}
	if req.Role != nil {
		updates["role"] = *req.Role
	}
	if req.Phone != nil {
		updates["phone"] = *req.Phone
	}
	if req.Email != nil {
		email := strings.ToLower(strings.TrimSpace(*req.Email))
		if email != "" && models.IsExistsByEmail(db, email, user.ID) {
			response.FailI18n(c, "auth.email_already_bound_other", errors.New("email already bound"))
			return
		}
		updates["email"] = email
	}

	if len(updates) == 0 {
		response.SuccessI18n(c, "common.no_changes", serializeUser(&user))
		return
	}

	if err := db.Model(&user).Updates(updates).Error; err != nil {
		response.FailI18n(c, "common.operation_failed", err)
		return
	}

	db.First(&user, id)
	response.SuccessI18n(c, "common.updated", serializeUser(&user))
}

// DELETE /users/:id
func (h *Handlers) handleAdminDeleteUser(c *gin.Context) {
	db := c.MustGet(lbconstants.DbField).(*gorm.DB)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.FailI18n(c, "coaching.invalid_id", err)
		return
	}

	currentUser := middleware.CurrentUser(c)
	if currentUser != nil && uint(id) == currentUser.ID {
		response.FailI18n(c, "auth.cannot_delete_self", errors.New("cannot delete yourself"))
		return
	}

	var user models.User
	if err := db.Where("id = ?", id).First(&user).Error; err != nil {
		response.FailI18n(c, "auth.user_not_found", err)
		return
	}

	operator := ""
	if currentUser != nil {
		operator = currentUser.Username
	}
	var errDelete error
	if user.Role == models.RoleTeacher {
		errDelete = models.SoftDeleteTeacherWithStudents(db, user.ID, operator)
	} else {
		errDelete = models.SoftDeleteUser(db, user.ID, operator)
	}
	if errDelete != nil {
		response.FailI18n(c, "common.deactivate_failed", errDelete)
		return
	}
	response.SuccessI18n(c, "common.deactivated", nil)
}

// firstNonEmpty returns the first trimmed non-empty string.
func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}

// authTokenTTL reads AUTH_TOKEN_EXPIRED (Go duration: 168h, not 7d).
// Empty / invalid values fall back to 7 days without noisy warnings.
func (h *Handlers) authTokenTTL() time.Duration {
	const fallback = 7 * 24 * time.Hour
	if h.configStore == nil {
		return fallback
	}
	val := strings.TrimSpace(h.configStore.GetValue(constants.KEY_AUTH_TOKEN_EXPIRED))
	if val == "" {
		return fallback
	}
	d, err := time.ParseDuration(val)
	if err != nil || d <= 0 {
		logger.Warn("invalid AUTH_TOKEN_EXPIRED, using default 7 days",
			zap.String("value", val), zap.Error(err))
		return fallback
	}
	return d
}

// serializeUser 序列化用户信息（不含密码）
func serializeUser(u *models.User) gin.H {
	var lastLogin *string
	if u.LastLogin != nil && !u.LastLogin.IsZero() {
		t := u.LastLogin.Format("2006-01-02T15:04:05Z07:00")
		lastLogin = &t
	}
	var lastStudy *string
	if u.LastStudyDate != nil && !u.LastStudyDate.IsZero() {
		t := u.LastStudyDate.Format("2006-01-02T15:04:05Z07:00")
		lastStudy = &t
	}
	return gin.H{
		"id":                u.ID,
		"username":          u.Username,
		"email":             u.Email,
		"account":           u.Username,
		"displayName":       u.DisplayName,
		"firstName":         u.FirstName,
		"lastName":          u.LastName,
		"role":              u.Role,
		"phone":             u.Phone,
		"locale":            u.Locale,
		"enabled":           !u.DeletedAt.Valid,
		"isDeleted":         u.DeletedAt.Valid,
		"isStaff":           u.Role == "admin",
		"activated":         true,
		"lastLogin":         lastLogin,
		"lastLoginIP":       u.LastLoginIP,
		"loginCount":        u.LoginCount,
		"source":            u.Source,
		"avatar":            u.Avatar,
		"gender":            u.Gender,
		"city":              u.City,
		"region":            u.Region,
		"streakDays":        u.StreakDays,
		"lastStudyDate":     lastStudy,
		"reviewCurvePreset": models.NormalizeReviewCurvePreset(u.ReviewCurvePreset),
		"createdAt":         u.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		"updatedAt":         u.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}
