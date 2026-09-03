package models

import (
	"crypto/rand"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	common "github.com/LingByte/ling-base/common"
	"gorm.io/gorm"
)

const (
	InviteStatusRegistered = "registered"
	InviteStatusActivated  = "activated"

	inviteCodePrefix = "JY-"
	inviteCodeLen    = 6
	inviteAlphabet   = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
)

var (
	ErrInviteCodeInvalid  = errors.New("invite code is invalid")
	ErrInviteCodeSelf     = errors.New("cannot use your own invite code")
	ErrInviteAlreadyBound = errors.New("already bound to an inviter")
)

// UserInviteCode is the current shareable invite code for a user (one row per user).
type UserInviteCode struct {
	common.BaseModel
	UserID uint   `json:"userId" gorm:"uniqueIndex;not null"`
	Code   string `json:"code" gorm:"size:32;uniqueIndex;not null"`
}

func (UserInviteCode) TableName() string { return constants.TABLE_USER_INVITE_CODES }

// UserInviteRecord is created when someone registers with an inviter's code.
type UserInviteRecord struct {
	common.BaseModel
	InviterUserID uint   `json:"inviterUserId" gorm:"index;not null"`
	InviteeUserID uint   `json:"inviteeUserId" gorm:"uniqueIndex;not null"`
	Status        string `json:"status" gorm:"size:16;index;not null;default:registered"`
}

func (UserInviteRecord) TableName() string { return constants.TABLE_USER_INVITE_RECORDS }

func NormalizeInviteCode(raw string) string {
	s := strings.ToUpper(strings.TrimSpace(raw))
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "—", "-")
	return s
}

func GenerateInviteCode() (string, error) {
	buf := make([]byte, inviteCodeLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, inviteCodeLen)
	for i, b := range buf {
		out[i] = inviteAlphabet[int(b)%len(inviteAlphabet)]
	}
	return inviteCodePrefix + string(out), nil
}

func EnsureInviteCode(db *gorm.DB, userID uint) (*UserInviteCode, error) {
	if userID == 0 {
		return nil, ErrInviteCodeInvalid
	}
	var row UserInviteCode
	err := db.Where("user_id = ?", userID).First(&row).Error
	if err == nil {
		return &row, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	for i := 0; i < 8; i++ {
		code, genErr := GenerateInviteCode()
		if genErr != nil {
			return nil, genErr
		}
		row = UserInviteCode{UserID: userID, Code: code}
		if err := db.Create(&row).Error; err != nil {
			if isUniqueConflict(err) {
				continue
			}
			return nil, err
		}
		return &row, nil
	}
	return nil, fmt.Errorf("failed to allocate invite code")
}

func RotateInviteCode(db *gorm.DB, userID uint) (*UserInviteCode, error) {
	row, err := EnsureInviteCode(db, userID)
	if err != nil {
		return nil, err
	}
	for i := 0; i < 8; i++ {
		code, genErr := GenerateInviteCode()
		if genErr != nil {
			return nil, genErr
		}
		if code == row.Code {
			continue
		}
		if err := db.Model(row).Update("code", code).Error; err != nil {
			if isUniqueConflict(err) {
				continue
			}
			return nil, err
		}
		row.Code = code
		return row, nil
	}
	return nil, fmt.Errorf("failed to rotate invite code")
}

func FindInviteCodeOwner(db *gorm.DB, code string) (*UserInviteCode, error) {
	code = NormalizeInviteCode(code)
	if code == "" {
		return nil, ErrInviteCodeInvalid
	}
	var row UserInviteCode
	if err := db.Where("code = ?", code).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInviteCodeInvalid
		}
		return nil, err
	}
	return &row, nil
}

// ApplyInviteCode binds invitee to inviter after the invitee account exists.
func ApplyInviteCode(db *gorm.DB, inviteeUserID uint, rawCode string) error {
	code := NormalizeInviteCode(rawCode)
	if code == "" {
		return nil
	}
	owner, err := FindInviteCodeOwner(db, code)
	if err != nil {
		return err
	}
	if owner.UserID == inviteeUserID {
		return ErrInviteCodeSelf
	}
	var existing UserInviteRecord
	err = db.Where("invitee_user_id = ?", inviteeUserID).First(&existing).Error
	if err == nil {
		return ErrInviteAlreadyBound
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	rec := UserInviteRecord{
		InviterUserID: owner.UserID,
		InviteeUserID: inviteeUserID,
		Status:        InviteStatusRegistered,
	}
	if err := db.Create(&rec).Error; err != nil {
		return err
	}
	return GrantInviteRewards(db, rec, InviteStatusRegistered)
}

func MaybeActivateInvitee(db *gorm.DB, inviteeUserID uint) {
	if inviteeUserID == 0 || db == nil {
		return
	}
	var rec UserInviteRecord
	err := db.Where("invitee_user_id = ? AND status = ?", inviteeUserID, InviteStatusRegistered).First(&rec).Error
	if err != nil {
		return
	}
	res := db.Model(&UserInviteRecord{}).
		Where("id = ? AND status = ?", rec.ID, InviteStatusRegistered).
		Update("status", InviteStatusActivated)
	if res.Error != nil || res.RowsAffected == 0 {
		return
	}
	rec.Status = InviteStatusActivated
	_ = GrantInviteRewards(db, rec, InviteStatusActivated)
}

type InviteRecordView struct {
	ID           uint   `json:"id,string"`
	Invitee      string `json:"invitee"`
	RegisteredAt string `json:"registeredAt"`
	Status       string `json:"status"`
}

type InviteOverview struct {
	Code           string             `json:"code"`
	CreatedAt      string             `json:"createdAt"`
	TotalInvited   int64              `json:"totalInvited"`
	TotalActivated int64              `json:"totalActivated"`
	EarnedMinutes  int64              `json:"earnedMinutes"`
	Reward         InviteRewardPublic `json:"reward"`
	Records        []InviteRecordView `json:"records"`
}

func GetInviteOverview(db *gorm.DB, userID uint) (*InviteOverview, error) {
	row, err := EnsureInviteCode(db, userID)
	if err != nil {
		return nil, err
	}
	syncInviteeActivation(db, userID)

	var records []UserInviteRecord
	if err := db.Where("inviter_user_id = ?", userID).
		Order("id DESC").
		Limit(100).
		Find(&records).Error; err != nil {
		return nil, err
	}

	ids := make([]uint, 0, len(records))
	for _, r := range records {
		ids = append(ids, r.InviteeUserID)
	}
	users := map[uint]User{}
	if len(ids) > 0 {
		var list []User
		if err := db.Select("id, username, email, phone, display_name").
			Where("id IN ?", ids).
			Find(&list).Error; err != nil {
			return nil, err
		}
		for _, u := range list {
			users[u.ID] = u
		}
	}

	var totalInvited, totalActivated int64
	if err := db.Model(&UserInviteRecord{}).Where("inviter_user_id = ?", userID).Count(&totalInvited).Error; err != nil {
		return nil, err
	}
	if err := db.Model(&UserInviteRecord{}).Where("inviter_user_id = ? AND status = ?", userID, InviteStatusActivated).Count(&totalActivated).Error; err != nil {
		return nil, err
	}

	views := make([]InviteRecordView, 0, len(records))
	for _, r := range records {
		u := users[r.InviteeUserID]
		views = append(views, InviteRecordView{
			ID:           r.ID,
			Invitee:      MaskInvitee(u),
			RegisteredAt: r.CreatedAt.Format("2006-01-02"),
			Status:       r.Status,
		})
		backfillInviteRewards(db, r)
	}

	setting, err := GetOrCreateInviteRewardSetting(db)
	if err != nil {
		return nil, err
	}
	earned, err := SumInviteRewardMinutes(db, userID)
	if err != nil {
		return nil, err
	}

	return &InviteOverview{
		Code:           row.Code,
		CreatedAt:      row.CreatedAt.Format("2006-01-02 15:04:05"),
		TotalInvited:   totalInvited,
		TotalActivated: totalActivated,
		EarnedMinutes:  earned,
		Reward:         setting.Public(),
		Records:        views,
	}, nil
}

type AdminInviteListQuery struct {
	Page     int
	PageSize int
	Status   string
	Search   string
}

type AdminInviteRecordView struct {
	ID             uint   `json:"id,string"`
	InviterUserID  uint   `json:"inviterUserId,string"`
	InviteeUserID  uint   `json:"inviteeUserId,string"`
	Inviter        string `json:"inviter"`
	Invitee        string `json:"invitee"`
	InviterAccount string `json:"inviterAccount"`
	InviteeAccount string `json:"inviteeAccount"`
	Code                   string `json:"code"`
	Status                 string `json:"status"`
	RegisteredAt           string `json:"registeredAt"`
	InviterGrantedMinutes  int    `json:"inviterGrantedMinutes"`
	InviteeGrantedMinutes  int    `json:"inviteeGrantedMinutes"`
}

type AdminInviteList struct {
	Records        []AdminInviteRecordView `json:"records"`
	Total          int64                   `json:"total"`
	TotalInvited   int64                   `json:"totalInvited"`
	TotalActivated int64                   `json:"totalActivated"`
	Page           int                     `json:"page"`
	PageSize       int                     `json:"pageSize"`
}

func ListAdminInviteRecords(db *gorm.DB, q AdminInviteListQuery) (*AdminInviteList, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 || q.PageSize > 100 {
		q.PageSize = 20
	}

	out := &AdminInviteList{
		Records:  []AdminInviteRecordView{},
		Page:     q.Page,
		PageSize: q.PageSize,
	}
	if err := db.Model(&UserInviteRecord{}).Count(&out.TotalInvited).Error; err != nil {
		return nil, err
	}
	if err := db.Model(&UserInviteRecord{}).Where("status = ?", InviteStatusActivated).Count(&out.TotalActivated).Error; err != nil {
		return nil, err
	}

	query := db.Model(&UserInviteRecord{})
	if q.Status == InviteStatusRegistered || q.Status == InviteStatusActivated {
		query = query.Where("status = ?", q.Status)
	}
	if search := strings.TrimSpace(q.Search); search != "" {
		filtered, err := applyAdminInviteSearch(db, query, search)
		if err != nil {
			return nil, err
		}
		if filtered == nil {
			return out, nil
		}
		query = filtered
	}

	if err := query.Count(&out.Total).Error; err != nil {
		return nil, err
	}

	var records []UserInviteRecord
	offset := (q.Page - 1) * q.PageSize
	if err := query.Order("id DESC").Offset(offset).Limit(q.PageSize).Find(&records).Error; err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return out, nil
	}

	userIDs := make([]uint, 0, len(records)*2)
	inviterIDs := make([]uint, 0, len(records))
	seenUser := map[uint]struct{}{}
	seenInviter := map[uint]struct{}{}
	for _, r := range records {
		if _, ok := seenUser[r.InviterUserID]; !ok {
			seenUser[r.InviterUserID] = struct{}{}
			userIDs = append(userIDs, r.InviterUserID)
		}
		if _, ok := seenUser[r.InviteeUserID]; !ok {
			seenUser[r.InviteeUserID] = struct{}{}
			userIDs = append(userIDs, r.InviteeUserID)
		}
		if _, ok := seenInviter[r.InviterUserID]; !ok {
			seenInviter[r.InviterUserID] = struct{}{}
			inviterIDs = append(inviterIDs, r.InviterUserID)
		}
	}

	users := map[uint]User{}
	if len(userIDs) > 0 {
		var list []User
		if err := db.Select("id, username, email, phone, display_name").
			Where("id IN ?", userIDs).
			Find(&list).Error; err != nil {
			return nil, err
		}
		for _, u := range list {
			users[u.ID] = u
		}
	}

	codes := map[uint]string{}
	if len(inviterIDs) > 0 {
		var rows []UserInviteCode
		if err := db.Select("user_id, code").Where("user_id IN ?", inviterIDs).Find(&rows).Error; err != nil {
			return nil, err
		}
		for _, row := range rows {
			codes[row.UserID] = row.Code
		}
	}

	recordIDs := make([]uint, 0, len(records))
	for _, r := range records {
		recordIDs = append(recordIDs, r.ID)
	}
	grants, err := loadInviteGrantTotals(db, recordIDs)
	if err != nil {
		return nil, err
	}

	views := make([]AdminInviteRecordView, 0, len(records))
	for _, r := range records {
		inviter := users[r.InviterUserID]
		invitee := users[r.InviteeUserID]
		g := grants[r.ID]
		views = append(views, AdminInviteRecordView{
			ID:                    r.ID,
			InviterUserID:         r.InviterUserID,
			InviteeUserID:         r.InviteeUserID,
			Inviter:               InviteDisplayName(inviter),
			Invitee:               InviteDisplayName(invitee),
			InviterAccount:        InviteAccount(inviter),
			InviteeAccount:        InviteAccount(invitee),
			Code:                  codes[r.InviterUserID],
			Status:                r.Status,
			RegisteredAt:          r.CreatedAt.Format("2006-01-02 15:04:05"),
			InviterGrantedMinutes: g.Inviter,
			InviteeGrantedMinutes: g.Invitee,
		})
	}
	out.Records = views
	return out, nil
}

func applyAdminInviteSearch(db *gorm.DB, query *gorm.DB, search string) (*gorm.DB, error) {
	var conds []string
	var args []any

	if id, err := strconv.ParseUint(search, 10, 64); err == nil && id > 0 {
		conds = append(conds, "inviter_user_id = ? OR invitee_user_id = ?")
		args = append(args, uint(id), uint(id))
	}

	like := "%" + search + "%"
	var users []User
	if err := db.Select("id").
		Where("username LIKE ? OR email LIKE ? OR phone LIKE ? OR display_name LIKE ?", like, like, like, like).
		Limit(200).
		Find(&users).Error; err != nil {
		return nil, err
	}
	if len(users) > 0 {
		ids := make([]uint, 0, len(users))
		for _, u := range users {
			ids = append(ids, u.ID)
		}
		conds = append(conds, "inviter_user_id IN ? OR invitee_user_id IN ?")
		args = append(args, ids, ids)
	}

	code := NormalizeInviteCode(search)
	if code != "" {
		var owners []UserInviteCode
		if err := db.Select("user_id").Where("code LIKE ?", "%"+code+"%").Limit(50).Find(&owners).Error; err != nil {
			return nil, err
		}
		if len(owners) > 0 {
			ids := make([]uint, 0, len(owners))
			for _, o := range owners {
				ids = append(ids, o.UserID)
			}
			conds = append(conds, "inviter_user_id IN ?")
			args = append(args, ids)
		}
	}

	if len(conds) == 0 {
		return nil, nil
	}
	return query.Where("("+strings.Join(conds, " OR ")+")", args...), nil
}

func InviteDisplayName(u User) string {
	if u.ID == 0 {
		return "未知用户"
	}
	if name := strings.TrimSpace(u.DisplayName); name != "" {
		return name
	}
	if name := strings.TrimSpace(u.Username); name != "" {
		return name
	}
	if name := strings.TrimSpace(u.Email); name != "" {
		return name
	}
	if name := strings.TrimSpace(u.Phone); name != "" {
		return name
	}
	return "未知用户"
}

func InviteAccount(u User) string {
	if s := strings.TrimSpace(u.Username); s != "" {
		return s
	}
	if s := strings.TrimSpace(u.Email); s != "" {
		return s
	}
	return strings.TrimSpace(u.Phone)
}

func syncInviteeActivation(db *gorm.DB, inviterUserID uint) {
	var recs []UserInviteRecord
	if err := db.Where("inviter_user_id = ? AND status = ?", inviterUserID, InviteStatusRegistered).
		Find(&recs).Error; err != nil || len(recs) == 0 {
		return
	}
	ids := make([]uint, 0, len(recs))
	for _, r := range recs {
		ids = append(ids, r.InviteeUserID)
	}
	var users []User
	if err := db.Select("id, login_count").Where("id IN ?", ids).Find(&users).Error; err != nil {
		return
	}
	ready := make([]uint, 0)
	for _, u := range users {
		if u.LoginCount >= 2 {
			ready = append(ready, u.ID)
		}
	}
	if len(ready) == 0 {
		return
	}
	_ = db.Model(&UserInviteRecord{}).
		Where("inviter_user_id = ? AND invitee_user_id IN ? AND status = ?", inviterUserID, ready, InviteStatusRegistered).
		Update("status", InviteStatusActivated).Error

	var activated []UserInviteRecord
	if err := db.Where("inviter_user_id = ? AND invitee_user_id IN ?", inviterUserID, ready).
		Find(&activated).Error; err != nil {
		return
	}
	for _, rec := range activated {
		backfillInviteRewards(db, rec)
	}
}

func MaskInvitee(u User) string {
	if phone := strings.TrimSpace(u.Phone); looksLikePhone(phone) {
		return maskPhone(phone)
	}
	if email := strings.TrimSpace(u.Email); strings.Contains(email, "@") {
		return maskEmail(email)
	}
	name := strings.TrimSpace(u.DisplayName)
	if name == "" {
		name = strings.TrimSpace(u.Username)
	}
	if name == "" {
		return "新用户"
	}
	return name
}

func looksLikePhone(s string) bool {
	digits := 0
	for _, r := range s {
		if unicode.IsDigit(r) {
			digits++
		}
	}
	return digits >= 11
}

func maskPhone(s string) string {
	digits := make([]rune, 0, 16)
	for _, r := range s {
		if unicode.IsDigit(r) {
			digits = append(digits, r)
		}
	}
	if len(digits) < 7 {
		return s
	}
	return string(digits[:3]) + "****" + string(digits[len(digits)-4:])
}

func maskEmail(s string) string {
	at := strings.IndexByte(s, '@')
	if at <= 0 {
		return s
	}
	local := s[:at]
	domain := s[at:]
	r := []rune(local)
	if len(r) == 1 {
		return string(r[0]) + "***" + domain
	}
	return string(r[0]) + "***" + domain
}

func isUniqueConflict(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique") || strings.Contains(msg, "duplicate")
}
