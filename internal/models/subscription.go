package models

import (
	"time"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	common "github.com/LingByte/ling-base/common"
	"gorm.io/gorm"
)

// 订阅类型
const (
	SubscriptionTypeMonthly   = "monthly"   // 包月
	SubscriptionTypeYearly     = "yearly"    // 包年
	SubscriptionTypeLifetime   = "lifetime"  // 买断
	SubscriptionStatusActive   = "active"    // 生效中
	SubscriptionStatusExpired  = "expired"   // 已过期
	SubscriptionStatusCancelled = "cancelled" // 已取消
)

// UserSubscription 用户订阅服务（包月/包年/买断）。
// 拥有活跃订阅的老师在下课时不扣减授课池分钟，但时间仍记录在 session 中。
type UserSubscription struct {
	common.BaseModel
	UserID    uint       `json:"userId" gorm:"index;not null"`
	Type      string     `json:"type" gorm:"size:20;not null;index"`            // monthly | yearly | lifetime
	StartedAt time.Time  `json:"startedAt" gorm:"not null"`
	ExpiredAt *time.Time `json:"expiredAt,omitempty"`                           // nil 表示买断（永久）
	Status    string     `json:"status" gorm:"size:20;not null;default:'active';index"` // active | expired | cancelled
	User      *User      `json:"user,omitempty" gorm:"foreignKey:UserID"`
}

func (UserSubscription) TableName() string { return constants.TABLE_USER_SUBSCRIPTIONS }

// TeacherHasActiveSubscription 检查老师是否有活跃订阅（包月/包年/买断）。
func TeacherHasActiveSubscription(db *gorm.DB, teacherID uint) bool {
	if db == nil || teacherID == 0 {
		return false
	}
	now := time.Now()
	var count int64
	db.Model(&UserSubscription{}).
		Where("user_id = ? AND status = ?", teacherID, SubscriptionStatusActive).
		Where("expired_at IS NULL OR expired_at > ?", now).
		Count(&count)
	return count > 0
}

// GetActiveSubscription 返回老师的活跃订阅（如有）。
func GetActiveSubscription(db *gorm.DB, userID uint) (*UserSubscription, error) {
	if db == nil || userID == 0 {
		return nil, nil
	}
	now := time.Now()
	var sub UserSubscription
	err := db.Where("user_id = ? AND status = ?", userID, SubscriptionStatusActive).
		Where("expired_at IS NULL OR expired_at > ?", now).
		First(&sub).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &sub, nil
}

// ExpireOverdueSubscriptions 将已过期但状态仍为 active 的订阅标记为 expired。
// 建议在定时任务中调用。
func ExpireOverdueSubscriptions(db *gorm.DB) (int64, error) {
	now := time.Now()
	res := db.Model(&UserSubscription{}).
		Where("status = ? AND expired_at IS NOT NULL AND expired_at <= ?", SubscriptionStatusActive, now).
		Update("status", SubscriptionStatusExpired)
	return res.RowsAffected, res.Error
}
