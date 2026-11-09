package models

import (
	"time"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	common "github.com/LingByte/ling-base/common"
)

const (
	PaymentStatusPending = "pending"
	PaymentStatusPaid    = "paid"
	PaymentStatusClosed  = "closed"
)

// PaymentOrder 微信支付会员订单。
type PaymentOrder struct {
	common.BaseModel
	UserID        uint       `json:"userId" gorm:"index;not null"`
	OutTradeNo    string     `json:"outTradeNo" gorm:"size:32;uniqueIndex;not null"`
	Plan          string     `json:"plan" gorm:"size:20;not null"`
	Amount        int        `json:"amount" gorm:"not null"` // 分
	Status        string     `json:"status" gorm:"size:20;not null;default:'pending';index"`
	PrepayID      string     `json:"-" gorm:"size:64"`
	TransactionID string     `json:"transactionId,omitempty" gorm:"size:64"`
	PaidAt        *time.Time `json:"paidAt,omitempty"`
}

func (PaymentOrder) TableName() string { return constants.TABLE_PAYMENT_ORDERS }
