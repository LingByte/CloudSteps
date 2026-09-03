package models

import (
	"errors"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	common "github.com/LingByte/ling-base/common"
	"gorm.io/gorm"
)

const (
	InviteRewardBeneficiaryInviter = "inviter"
	InviteRewardBeneficiaryInvitee = "invitee"
	inviteRewardMinutesMax         = 10000
)

// InviteRewardSetting is the singleton admin policy for invite teaching-pool minutes.
type InviteRewardSetting struct {
	common.BaseModel
	Enabled                  bool `json:"enabled" gorm:"not null;default:true"`
	InviterRegisterMinutes   int  `json:"inviterRegisterMinutes" gorm:"not null;default:0"`
	InviteeRegisterMinutes   int  `json:"inviteeRegisterMinutes" gorm:"not null;default:0"`
	InviterActivateMinutes   int  `json:"inviterActivateMinutes" gorm:"not null;default:0"`
	InviteeActivateMinutes   int  `json:"inviteeActivateMinutes" gorm:"not null;default:0"`
}

func (InviteRewardSetting) TableName() string { return constants.TABLE_INVITE_REWARD_SETTINGS }

// InviteRewardGrant is one issuance of an invite reward (record × trigger × beneficiary).
type InviteRewardGrant struct {
	common.BaseModel
	RecordID    uint   `json:"recordId" gorm:"uniqueIndex:idx_invite_reward_grant;not null"`
	Trigger     string `json:"trigger" gorm:"column:reward_trigger;uniqueIndex:idx_invite_reward_grant;size:16;not null"`
	Beneficiary string `json:"beneficiary" gorm:"uniqueIndex:idx_invite_reward_grant;size:16;not null"`
	UserID      uint   `json:"userId" gorm:"index;not null"`
	Minutes     int    `json:"minutes" gorm:"not null;default:0"`
}

func (InviteRewardGrant) TableName() string { return constants.TABLE_INVITE_REWARD_GRANTS }

type InviteRewardPublic struct {
	Enabled                bool `json:"enabled"`
	InviterRegisterMinutes int  `json:"inviterRegisterMinutes"`
	InviteeRegisterMinutes int  `json:"inviteeRegisterMinutes"`
	InviterActivateMinutes int  `json:"inviterActivateMinutes"`
	InviteeActivateMinutes int  `json:"inviteeActivateMinutes"`
}

func (s InviteRewardSetting) Public() InviteRewardPublic {
	return InviteRewardPublic{
		Enabled:                s.Enabled,
		InviterRegisterMinutes: s.InviterRegisterMinutes,
		InviteeRegisterMinutes: s.InviteeRegisterMinutes,
		InviterActivateMinutes: s.InviterActivateMinutes,
		InviteeActivateMinutes: s.InviteeActivateMinutes,
	}
}

func clampInviteRewardMinutes(n int) int {
	if n < 0 {
		return 0
	}
	if n > inviteRewardMinutesMax {
		return inviteRewardMinutesMax
	}
	return n
}

func GetOrCreateInviteRewardSetting(db *gorm.DB) (*InviteRewardSetting, error) {
	var row InviteRewardSetting
	err := db.Order("id ASC").First(&row).Error
	if err == nil {
		return &row, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	row = InviteRewardSetting{Enabled: true}
	if err := db.Create(&row).Error; err != nil {
		if isUniqueConflict(err) {
			if err := db.Order("id ASC").First(&row).Error; err != nil {
				return nil, err
			}
			return &row, nil
		}
		return nil, err
	}
	return &row, nil
}

func SaveInviteRewardSetting(db *gorm.DB, in InviteRewardSetting) (*InviteRewardSetting, error) {
	row, err := GetOrCreateInviteRewardSetting(db)
	if err != nil {
		return nil, err
	}
	row.Enabled = in.Enabled
	row.InviterRegisterMinutes = clampInviteRewardMinutes(in.InviterRegisterMinutes)
	row.InviteeRegisterMinutes = clampInviteRewardMinutes(in.InviteeRegisterMinutes)
	row.InviterActivateMinutes = clampInviteRewardMinutes(in.InviterActivateMinutes)
	row.InviteeActivateMinutes = clampInviteRewardMinutes(in.InviteeActivateMinutes)
	if err := db.Model(row).Updates(map[string]any{
		"enabled":                    row.Enabled,
		"inviter_register_minutes":   row.InviterRegisterMinutes,
		"invitee_register_minutes":   row.InviteeRegisterMinutes,
		"inviter_activate_minutes":   row.InviterActivateMinutes,
		"invitee_activate_minutes":   row.InviteeActivateMinutes,
	}).Error; err != nil {
		return nil, err
	}
	return row, nil
}

type inviteRewardTarget struct {
	beneficiary string
	userID      uint
	minutes     int
}

func inviteRewardTargets(setting InviteRewardSetting, rec UserInviteRecord, trigger string) []inviteRewardTarget {
	if !setting.Enabled {
		return nil
	}
	var out []inviteRewardTarget
	switch trigger {
	case InviteStatusRegistered:
		out = append(out,
			inviteRewardTarget{InviteRewardBeneficiaryInviter, rec.InviterUserID, setting.InviterRegisterMinutes},
			inviteRewardTarget{InviteRewardBeneficiaryInvitee, rec.InviteeUserID, setting.InviteeRegisterMinutes},
		)
	case InviteStatusActivated:
		out = append(out,
			inviteRewardTarget{InviteRewardBeneficiaryInviter, rec.InviterUserID, setting.InviterActivateMinutes},
			inviteRewardTarget{InviteRewardBeneficiaryInvitee, rec.InviteeUserID, setting.InviteeActivateMinutes},
		)
	}
	filtered := out[:0]
	for _, t := range out {
		if t.minutes > 0 && t.userID != 0 {
			filtered = append(filtered, t)
		}
	}
	return filtered
}

// GrantInviteRewards pays teaching-pool minutes for a trigger. Idempotent per record/trigger/beneficiary.
func GrantInviteRewards(db *gorm.DB, rec UserInviteRecord, trigger string) error {
	if db == nil || rec.ID == 0 {
		return nil
	}
	if trigger != InviteStatusRegistered && trigger != InviteStatusActivated {
		return nil
	}
	setting, err := GetOrCreateInviteRewardSetting(db)
	if err != nil {
		return err
	}
	targets := inviteRewardTargets(*setting, rec, trigger)
	for _, t := range targets {
		if err := grantOneInviteReward(db, rec.ID, trigger, t); err != nil {
			return err
		}
	}
	return nil
}

func grantOneInviteReward(db *gorm.DB, recordID uint, trigger string, t inviteRewardTarget) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var existing InviteRewardGrant
		err := tx.Where("record_id = ? AND reward_trigger = ? AND beneficiary = ?", recordID, trigger, t.beneficiary).
			First(&existing).Error
		if err == nil {
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err := AddTeacherTeachingPoolMinutes(tx, t.userID, t.minutes); err != nil {
			return err
		}
		grant := InviteRewardGrant{
			RecordID:    recordID,
			Trigger:     trigger,
			Beneficiary: t.beneficiary,
			UserID:      t.userID,
			Minutes:     t.minutes,
		}
		if err := tx.Create(&grant).Error; err != nil {
			if isUniqueConflict(err) {
				return nil
			}
			return err
		}
		return nil
	})
}

func backfillInviteRewards(db *gorm.DB, rec UserInviteRecord) {
	_ = GrantInviteRewards(db, rec, InviteStatusRegistered)
	if rec.Status == InviteStatusActivated {
		_ = GrantInviteRewards(db, rec, InviteStatusActivated)
	}
}

func SumInviteRewardMinutes(db *gorm.DB, userID uint) (int64, error) {
	var total int64
	err := db.Model(&InviteRewardGrant{}).
		Where("user_id = ?", userID).
		Select("COALESCE(SUM(minutes), 0)").
		Scan(&total).Error
	return total, err
}

type inviteGrantTotals struct {
	Inviter int
	Invitee int
}

func loadInviteGrantTotals(db *gorm.DB, recordIDs []uint) (map[uint]inviteGrantTotals, error) {
	out := map[uint]inviteGrantTotals{}
	if len(recordIDs) == 0 {
		return out, nil
	}
	var grants []InviteRewardGrant
	if err := db.Where("record_id IN ?", recordIDs).Find(&grants).Error; err != nil {
		return nil, err
	}
	for _, g := range grants {
		cur := out[g.RecordID]
		if g.Beneficiary == InviteRewardBeneficiaryInviter {
			cur.Inviter += g.Minutes
		} else if g.Beneficiary == InviteRewardBeneficiaryInvitee {
			cur.Invitee += g.Minutes
		}
		out[g.RecordID] = cur
	}
	return out, nil
}
