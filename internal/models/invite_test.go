package models

import (
	"errors"
	"testing"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func testInviteDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:invite_"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := db.AutoMigrate(&User{}, &UserInviteCode{}, &UserInviteRecord{}, &InviteRewardSetting{}, &InviteRewardGrant{}, &TeacherTeachingPool{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func TestInviteTableNames(t *testing.T) {
	if (UserInviteCode{}).TableName() != constants.TABLE_USER_INVITE_CODES {
		t.Fatalf("code table = %q", (UserInviteCode{}).TableName())
	}
	if (UserInviteRecord{}).TableName() != constants.TABLE_USER_INVITE_RECORDS {
		t.Fatalf("record table = %q", (UserInviteRecord{}).TableName())
	}
}

func TestEnsureInviteCode_idempotent(t *testing.T) {
	db := testInviteDB(t)
	a, err := EnsureInviteCode(db, 11)
	if err != nil {
		t.Fatal(err)
	}
	if a.Code == "" || a.UserID != 11 {
		t.Fatalf("unexpected %+v", a)
	}
	b, err := EnsureInviteCode(db, 11)
	if err != nil {
		t.Fatal(err)
	}
	if a.Code != b.Code {
		t.Fatalf("expected same code, got %s vs %s", a.Code, b.Code)
	}
}

func TestRotateInviteCode_changesCode(t *testing.T) {
	db := testInviteDB(t)
	first, err := EnsureInviteCode(db, 22)
	if err != nil {
		t.Fatal(err)
	}
	next, err := RotateInviteCode(db, 22)
	if err != nil {
		t.Fatal(err)
	}
	if next.Code == first.Code {
		t.Fatal("code should change")
	}
}

func TestApplyInviteCode_bindsAndRejects(t *testing.T) {
	db := testInviteDB(t)
	owner, err := EnsureInviteCode(db, 100)
	if err != nil {
		t.Fatal(err)
	}
	if err := ApplyInviteCode(db, 100, owner.Code); err != ErrInviteCodeSelf {
		t.Fatalf("self: %v", err)
	}
	if err := ApplyInviteCode(db, 200, "JY-NOPE12"); err != ErrInviteCodeInvalid {
		t.Fatalf("invalid: %v", err)
	}
	if err := ApplyInviteCode(db, 200, owner.Code); err != nil {
		t.Fatal(err)
	}
	if err := ApplyInviteCode(db, 200, owner.Code); err != ErrInviteAlreadyBound {
		t.Fatalf("dup: %v", err)
	}
	ov, err := GetInviteOverview(db, 100)
	if err != nil {
		t.Fatal(err)
	}
	if ov.TotalInvited != 1 || ov.TotalActivated != 0 {
		t.Fatalf("overview %+v", ov)
	}
}

func TestMaybeActivateInvitee_andMask(t *testing.T) {
	db := testInviteDB(t)
	owner, _ := EnsureInviteCode(db, 1)
	invitee := &User{Username: "13812345678", Phone: "13812345678", LoginCount: 2}
	if err := db.Create(invitee).Error; err != nil {
		t.Fatal(err)
	}
	if err := ApplyInviteCode(db, invitee.ID, owner.Code); err != nil {
		t.Fatal(err)
	}
	MaybeActivateInvitee(db, invitee.ID)
	ov, err := GetInviteOverview(db, 1)
	if err != nil {
		t.Fatal(err)
	}
	if ov.TotalActivated != 1 {
		t.Fatalf("activated=%d", ov.TotalActivated)
	}
	if ov.Records[0].Invitee != "138****5678" {
		t.Fatalf("mask=%q", ov.Records[0].Invitee)
	}
	if MaskInvitee(User{Email: "ab@x.com"}) != "a***@x.com" {
		t.Fatal("email mask")
	}
}

func TestListAdminInviteRecords(t *testing.T) {
	db := testInviteDB(t)
	inviter := &User{Username: "coach_a", DisplayName: "教练甲"}
	if err := db.Create(inviter).Error; err != nil {
		t.Fatal(err)
	}
	owner, err := EnsureInviteCode(db, inviter.ID)
	if err != nil {
		t.Fatal(err)
	}
	invitee := &User{Username: "13800001111", Phone: "13800001111", DisplayName: "学员乙"}
	if err := db.Create(invitee).Error; err != nil {
		t.Fatal(err)
	}
	if err := ApplyInviteCode(db, invitee.ID, owner.Code); err != nil {
		t.Fatal(err)
	}

	list, err := ListAdminInviteRecords(db, AdminInviteListQuery{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatal(err)
	}
	if list.Total != 1 || list.TotalInvited != 1 || len(list.Records) != 1 {
		t.Fatalf("list %+v", list)
	}
	row := list.Records[0]
	if row.Inviter != "教练甲" || row.Invitee != "学员乙" || row.Code != owner.Code || row.Status != InviteStatusRegistered {
		t.Fatalf("row %+v", row)
	}

	byName, err := ListAdminInviteRecords(db, AdminInviteListQuery{Page: 1, PageSize: 20, Search: "学员乙"})
	if err != nil {
		t.Fatal(err)
	}
	if byName.Total != 1 {
		t.Fatalf("search name %+v", byName)
	}
	byCode, err := ListAdminInviteRecords(db, AdminInviteListQuery{Page: 1, PageSize: 20, Search: owner.Code})
	if err != nil {
		t.Fatal(err)
	}
	if byCode.Total != 1 {
		t.Fatalf("search code %+v", byCode)
	}
	miss, err := ListAdminInviteRecords(db, AdminInviteListQuery{Page: 1, PageSize: 20, Search: "no-such-user"})
	if err != nil {
		t.Fatal(err)
	}
	if miss.Total != 0 || len(miss.Records) != 0 {
		t.Fatalf("miss %+v", miss)
	}
	activated, err := ListAdminInviteRecords(db, AdminInviteListQuery{Page: 1, PageSize: 20, Status: InviteStatusActivated})
	if err != nil {
		t.Fatal(err)
	}
	if activated.Total != 0 {
		t.Fatalf("activated %+v", activated)
	}
	combo, err := ListAdminInviteRecords(db, AdminInviteListQuery{
		Page:     1,
		PageSize: 20,
		Status:   InviteStatusRegistered,
		Search:   "学员乙",
	})
	if err != nil {
		t.Fatal(err)
	}
	if combo.Total != 1 {
		t.Fatalf("status+search %+v", combo)
	}
}

func teachingPoolMinutes(t *testing.T, db *gorm.DB, userID uint) int {
	t.Helper()
	var pool TeacherTeachingPool
	if err := db.Where("teacher_id = ?", userID).First(&pool).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0
		}
		t.Fatal(err)
	}
	return pool.RemainingMinutes
}

func TestInviteRewards_grantOnRegisterAndActivateOnce(t *testing.T) {
	db := testInviteDB(t)
	_, err := SaveInviteRewardSetting(db, InviteRewardSetting{
		Enabled:                true,
		InviterRegisterMinutes: 30,
		InviteeRegisterMinutes: 10,
		InviterActivateMinutes: 20,
		InviteeActivateMinutes: 5,
	})
	if err != nil {
		t.Fatal(err)
	}

	inviter := &User{Username: "inviter_r"}
	invitee := &User{Username: "invitee_r", LoginCount: 2}
	if err := db.Create(inviter).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(invitee).Error; err != nil {
		t.Fatal(err)
	}
	owner, err := EnsureInviteCode(db, inviter.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := ApplyInviteCode(db, invitee.ID, owner.Code); err != nil {
		t.Fatal(err)
	}
	if got := teachingPoolMinutes(t, db, inviter.ID); got != 30 {
		t.Fatalf("inviter after register = %d", got)
	}
	if got := teachingPoolMinutes(t, db, invitee.ID); got != 10 {
		t.Fatalf("invitee after register = %d", got)
	}

	if err := ApplyInviteCode(db, invitee.ID, owner.Code); err != ErrInviteAlreadyBound {
		t.Fatalf("dup bind: %v", err)
	}
	if got := teachingPoolMinutes(t, db, inviter.ID); got != 30 {
		t.Fatalf("inviter after dup = %d", got)
	}

	MaybeActivateInvitee(db, invitee.ID)
	if got := teachingPoolMinutes(t, db, inviter.ID); got != 50 {
		t.Fatalf("inviter after activate = %d", got)
	}
	if got := teachingPoolMinutes(t, db, invitee.ID); got != 15 {
		t.Fatalf("invitee after activate = %d", got)
	}
	MaybeActivateInvitee(db, invitee.ID)
	if got := teachingPoolMinutes(t, db, inviter.ID); got != 50 {
		t.Fatalf("inviter after second activate = %d", got)
	}

	earned, err := SumInviteRewardMinutes(db, inviter.ID)
	if err != nil {
		t.Fatal(err)
	}
	if earned != 50 {
		t.Fatalf("earned=%d", earned)
	}

	list, err := ListAdminInviteRecords(db, AdminInviteListQuery{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatal(err)
	}
	if list.Records[0].InviterGrantedMinutes != 50 || list.Records[0].InviteeGrantedMinutes != 15 {
		t.Fatalf("grants %+v", list.Records[0])
	}
}

func TestInviteRewards_disabledSkipsGrant(t *testing.T) {
	db := testInviteDB(t)
	if _, err := SaveInviteRewardSetting(db, InviteRewardSetting{
		Enabled:                false,
		InviterRegisterMinutes: 99,
	}); err != nil {
		t.Fatal(err)
	}
	inviter := &User{Username: "inviter_off"}
	invitee := &User{Username: "invitee_off"}
	_ = db.Create(inviter).Error
	_ = db.Create(invitee).Error
	owner, _ := EnsureInviteCode(db, inviter.ID)
	if err := ApplyInviteCode(db, invitee.ID, owner.Code); err != nil {
		t.Fatal(err)
	}
	if got := teachingPoolMinutes(t, db, inviter.ID); got != 0 {
		t.Fatalf("granted while disabled: %d", got)
	}
}
