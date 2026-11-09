package notify

import (
	"errors"
	"strings"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestHTMLToPlainText(t *testing.T) {
	got := HTMLToPlainText("<p>Hi &amp; {{name}}</p>")
	if !strings.Contains(got, "Hi & {{name}}") {
		t.Fatalf("%q", got)
	}
}

func TestDeriveTemplateVariables(t *testing.T) {
	got := DeriveTemplateVariables("Hello {{foo}}", "{{bar}}")
	if !strings.Contains(got, `"foo"`) || !strings.Contains(got, `"bar"`) {
		t.Fatalf("%q", got)
	}
}

func TestCreateMailTemplate_nil(t *testing.T) {
	if err := CreateMailTemplate(nil, nil); err == nil {
		t.Fatal("expected error")
	}
}

func TestIsMySQLDuplicateIndex(t *testing.T) {
	if !isMySQLDuplicateIndex(errors.New("Error 1061 (42000): Duplicate key name 'idx_mail_templates_deleted_at'")) {
		t.Fatal("expected duplicate index match")
	}
	if isMySQLDuplicateIndex(errors.New("Error 1054 (42S22): Unknown column")) {
		t.Fatal("should not match unrelated mysql errors")
	}
	if isMySQLDuplicateIndex(nil) {
		t.Fatal("nil should be false")
	}
}

func TestEnsureMailTemplateSchema_emailAndInboxSameCode(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := EnsureMailTemplateSchema(db); err != nil {
		t.Fatal(err)
	}
	email := &MailTemplate{
		Code: "welcome", Name: "欢迎邮件", ChannelType: NotificationTemplateTypeEmail, Enabled: true,
	}
	ApplyMailTemplateHTMLDerivedFields(email, "<p>hi</p>", "")
	if err := db.Create(email).Error; err != nil {
		t.Fatalf("create email: %v", err)
	}
	inbox := &MailTemplate{
		Code: "welcome", Name: "欢迎通知", ChannelType: NotificationTemplateTypeInbox,
		InboxTitle: "欢迎", InboxBody: "hi {{.Username}}", Enabled: true,
	}
	ApplyInboxTemplateDerivedFields(inbox, "")
	if err := db.Create(inbox).Error; err != nil {
		t.Fatalf("create inbox: %v", err)
	}
}

func TestMailTemplateResolveVariables_derives(t *testing.T) {
	got := resolveMailTemplateVariables("{{x}}", "", "")
	if got == "" {
		t.Fatal("expected derived variables")
	}
}
