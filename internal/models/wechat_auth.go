package models

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/LingByte/ling-base/common/random"
	"gorm.io/gorm"
)

const (
	WechatLoginSessionPending   = "pending"
	WechatLoginSessionConfirmed = "confirmed"
	WechatLoginSessionExpired   = "expired"
)

// WechatLoginSession 网页端轮询登录会话（存 cache）。
type WechatLoginSession struct {
	SessionID  string    `json:"sessionId"`
	Status     string    `json:"status"`
	OpenID     string    `json:"openId,omitempty"`
	UserID     uint      `json:"userId,omitempty"`
	Token      string    `json:"token,omitempty"`
	InviteCode string    `json:"inviteCode,omitempty"`
	ExpiresAt  time.Time `json:"expiresAt"`
}

// WechatLoginCode 网页登录验证码（存 cache，映射到 sessionId）。
type WechatLoginCode struct {
	SessionID string    `json:"sessionId"`
	CreatedAt time.Time `json:"createdAt"`
}

func WechatLoginSessionKey(sessionID string) string {
	return "wechat:login:session:" + sessionID
}

func WechatLoginCodeKey(code string) string {
	return "wechat:login:code:" + strings.ToUpper(strings.TrimSpace(code))
}

func NewWechatLoginSessionID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func NewWechatLoginCode() string {
	return fmt.Sprintf("%06d", random.Intn(900000)+100000)
}

func GetUserByWechatOpenID(db *gorm.DB, openID string) (*User, error) {
	openID = strings.TrimSpace(openID)
	if openID == "" {
		return nil, gorm.ErrRecordNotFound
	}
	var user User
	err := db.Where("wechat_open_id = ?", openID).First(&user).Error
	return &user, err
}

func CreateWechatUser(db *gorm.DB, openID string) (*User, error) {
	openID = strings.TrimSpace(openID)
	if openID == "" {
		return nil, errors.New("empty wechat openid")
	}
	suffix := openID
	if len(suffix) > 10 {
		suffix = suffix[len(suffix)-10:]
	}
	username := "wx_" + suffix
	for i := 0; i < 5; i++ {
		name := username
		if i > 0 {
			name = fmt.Sprintf("%s_%d", username, i)
		}
		if IsExistsByUsername(db, name) {
			continue
		}
		username = name
		break
	}
	if IsExistsByUsername(db, username) {
		return nil, errors.New("failed to allocate wechat username")
	}

	secret := random.String(24)
	user := User{
		Username:     username,
		Password:     HashPassword(secret),
		DisplayName:  "微信用户",
		WechatOpenID: openID,
		Source:       "wechat_oa",
		Gender:       "female",
		Role:         RoleTeacher,
	}
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		return GrantSignupTeacherTeachingPool(tx, user.ID)
	})
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func FindOrCreateWechatUser(db *gorm.DB, openID string) (*User, error) {
	user, err := GetUserByWechatOpenID(db, openID)
	if err == nil {
		return user, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	return CreateWechatUser(db, openID)
}
