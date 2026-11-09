package notify

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/LingByte/ling-base/common"
	"gorm.io/gorm"
)

const (
	NotificationTemplateTypeEmail = "email"
	NotificationTemplateTypeInbox = "inbox"
)

type MailTemplate struct {
	common.BaseModel
	Code        string `json:"code" gorm:"uniqueIndex:idx_mail_tpl_code_locale_type;size:64;not null;comment:模板编码"`
	Name        string `json:"name" gorm:"size:128;not null;comment:模板名称"`
	ChannelType string `json:"channelType" gorm:"uniqueIndex:idx_mail_tpl_code_locale_type;size:16;not null;default:email;comment:email|inbox"`
	Subject     string `json:"subject,omitempty" gorm:"size:255;comment:邮件标题模板"`
	HTMLBody    string `json:"htmlBody,omitempty" gorm:"comment:HTML 正文"`
	InboxTitle  string `json:"inboxTitle,omitempty" gorm:"size:255;comment:站内信标题模板"`
	InboxBody   string `json:"inboxBody,omitempty" gorm:"type:text;comment:站内信正文模板"`
	TextBody    string `json:"textBody,omitempty" gorm:"comment:纯文本正文"`
	Description string `json:"description,omitempty" gorm:"size:512;comment:说明"`
	Variables   string `json:"variables,omitempty" gorm:"type:text;comment:占位符说明 JSON"`
	Locale      string `json:"locale,omitempty" gorm:"uniqueIndex:idx_mail_tpl_code_locale_type;size:32;default:'';comment:语言如 zh-CN"`
	Enabled     bool   `json:"enabled" gorm:"default:true;index;comment:是否启用"`
}

func (MailTemplate) TableName() string { return "mail_templates" }

var (
	htmlTagStripper = regexp.MustCompile(`(?is)<[^>]+>`)
	whitespaceRE    = regexp.MustCompile(`\s+`)
	placeholderRE   = regexp.MustCompile(`\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}`)
)

func HTMLToPlainText(htmlBody string) string {
	if htmlBody == "" {
		return ""
	}
	s := htmlTagStripper.ReplaceAllString(htmlBody, " ")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&quot;", "\"")
	s = whitespaceRE.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func DeriveTemplateVariables(htmlBody, textBody string) string {
	src := htmlBody + "\n" + textBody
	matches := placeholderRE.FindAllStringSubmatch(src, -1)
	if len(matches) == 0 {
		return ""
	}
	seen := map[string]struct{}{}
	for _, m := range matches {
		if len(m) >= 2 {
			seen[m[1]] = struct{}{}
		}
	}
	if len(seen) == 0 {
		return ""
	}
	keys := make([]string, 0, len(seen))
	for k := range seen {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	b.WriteString("[")
	for i, k := range keys {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(`{"name":"`)
		b.WriteString(k)
		b.WriteString(`"}`)
	}
	b.WriteString("]")
	return b.String()
}

func MailTemplateDerivedTextBody(htmlBody string) string { return HTMLToPlainText(htmlBody) }

func resolveMailTemplateVariables(htmlBody, textBody, variables string) string {
	v := strings.TrimSpace(variables)
	if v != "" {
		return v
	}
	return DeriveTemplateVariables(htmlBody, textBody)
}

func ApplyMailTemplateHTMLDerivedFields(tpl *MailTemplate, htmlBody, variables string) {
	if tpl == nil {
		return
	}
	plain := MailTemplateDerivedTextBody(htmlBody)
	tpl.HTMLBody = htmlBody
	tpl.TextBody = plain
	src := htmlBody + "\n" + tpl.InboxTitle + "\n" + tpl.InboxBody
	tpl.Variables = resolveMailTemplateVariables(src, plain, variables)
}

func ApplyInboxTemplateDerivedFields(tpl *MailTemplate, variables string) {
	if tpl == nil {
		return
	}
	src := tpl.InboxTitle + "\n" + tpl.InboxBody
	tpl.Variables = resolveMailTemplateVariables(src, "", variables)
}

func NormalizeNotificationTemplateType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case NotificationTemplateTypeInbox:
		return NotificationTemplateTypeInbox
	default:
		return NotificationTemplateTypeEmail
	}
}

const (
	mailTemplateTable           = "mail_templates"
	mailTemplateLegacyUniqueIdx = "idx_mail_tpl_code_locale"
	mailTemplateUniqueIdx       = "idx_mail_tpl_code_locale_type"
)

// isMySQLDuplicateIndex 远端 MySQL 偶发：information_schema 查询超时/不准后，
// AutoMigrate 会重复 CREATE INDEX，落到 Error 1061。索引已存在时可忽略。
func isMySQLDuplicateIndex(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "Error 1061") || strings.Contains(msg, "Duplicate key name")
}

func autoMigrateMailTemplate(db *gorm.DB) error {
	if err := db.AutoMigrate(&MailTemplate{}); err != nil && !isMySQLDuplicateIndex(err) {
		return err
	}
	return nil
}

// EnsureMailTemplateSchema migrates mail_templates for per-channel-type templates:
// backfill channel_type, drop legacy (code, locale) unique index, ensure (code, locale, channel_type).
func EnsureMailTemplateSchema(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	if err := autoMigrateMailTemplate(db); err != nil {
		return err
	}
	_ = db.Model(&MailTemplate{}).
		Where("channel_type = '' OR channel_type IS NULL").
		Update("channel_type", NotificationTemplateTypeEmail).Error

	switch db.Dialector.Name() {
	case "mysql":
		if err := dropMailTemplateIndexMySQL(db, mailTemplateLegacyUniqueIdx); err != nil {
			return err
		}
	case "sqlite":
		_ = db.Exec("DROP INDEX IF EXISTS " + mailTemplateLegacyUniqueIdx).Error
	}
	if err := autoMigrateMailTemplate(db); err != nil {
		return err
	}
	if db.Dialector.Name() == "mysql" {
		return ensureMailTemplateUniqueIndexMySQL(db)
	}
	return nil
}

func dropMailTemplateIndexMySQL(db *gorm.DB, indexName string) error {
	var count int64
	err := db.Raw(`
		SELECT COUNT(*) FROM information_schema.statistics
		WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
		mailTemplateTable, indexName,
	).Scan(&count).Error
	if err != nil {
		return err
	}
	if count == 0 {
		return nil
	}
	return db.Exec(
		"ALTER TABLE `" + mailTemplateTable + "` DROP INDEX `" + indexName + "`",
	).Error
}

func ensureMailTemplateUniqueIndexMySQL(db *gorm.DB) error {
	var count int64
	err := db.Raw(`
		SELECT COUNT(*) FROM information_schema.statistics
		WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
		mailTemplateTable, mailTemplateUniqueIdx,
	).Scan(&count).Error
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	err = db.Exec(
		"ALTER TABLE `" + mailTemplateTable + "` ADD UNIQUE INDEX `" + mailTemplateUniqueIdx + "` (`code`, `locale`, `channel_type`)",
	).Error
	if isMySQLDuplicateIndex(err) {
		return nil
	}
	return err
}

// SplitLegacyMailTemplates migrates unified rows into separate email/inbox templates.
func SplitLegacyMailTemplates(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	if err := EnsureMailTemplateSchema(db); err != nil {
		return err
	}
	var legacy []MailTemplate
	if err := db.Where("channel_type = ?", NotificationTemplateTypeEmail).
		Find(&legacy).Error; err != nil {
		return err
	}
	for _, row := range legacy {
		if strings.TrimSpace(row.InboxTitle) == "" && strings.TrimSpace(row.InboxBody) == "" {
			continue
		}
		var inbox MailTemplate
		err := db.Where("code = ? AND locale = ? AND channel_type = ?",
			row.Code, row.Locale, NotificationTemplateTypeInbox).First(&inbox).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			inbox = MailTemplate{
				Code:        row.Code,
				Name:        row.Name + "（站内信）",
				ChannelType: NotificationTemplateTypeInbox,
				InboxTitle:  row.InboxTitle,
				InboxBody:   row.InboxBody,
				Description: row.Description,
				Locale:      row.Locale,
				Enabled:     row.Enabled,
			}
			ApplyInboxTemplateDerivedFields(&inbox, "")
			if err := db.Create(&inbox).Error; err != nil {
				return err
			}
		}
		_ = db.Model(&MailTemplate{}).Where("id = ?", row.ID).Updates(map[string]any{
			"inbox_title": "",
			"inbox_body":  "",
		}).Error
	}
	return nil
}

func activeTemplate(db *gorm.DB) *gorm.DB {
	return db
}

func ListMailTemplatesPage(db *gorm.DB, page, size int, channelType string) ([]MailTemplate, int64, error) {
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 200 {
		size = 20
	}
	q := activeTemplate(db.Model(&MailTemplate{}))
	if t := strings.TrimSpace(channelType); t != "" {
		q = q.Where("channel_type = ?", NormalizeNotificationTemplateType(t))
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []MailTemplate
	err := q.Order("channel_type ASC, id DESC").Offset((page - 1) * size).Limit(size).Find(&list).Error
	return list, total, err
}

func GetMailTemplateByID(db *gorm.DB, id uint) (*MailTemplate, error) {
	var tpl MailTemplate
	if err := activeTemplate(db).First(&tpl, id).Error; err != nil {
		return nil, err
	}
	return &tpl, nil
}

func GetMailTemplateByCode(db *gorm.DB, code, locale string) (*MailTemplate, error) {
	return GetMailTemplateByCodeAndType(db, code, locale, NotificationTemplateTypeEmail)
}

func GetMailTemplateByCodeAndType(db *gorm.DB, code, locale, channelType string) (*MailTemplate, error) {
	var tpl MailTemplate
	q := activeTemplate(db).Where("code = ? AND channel_type = ? AND enabled = ?", code, NormalizeNotificationTemplateType(channelType), true)
	if strings.TrimSpace(locale) != "" {
		q = q.Where("locale = ?", locale)
	}
	if err := q.First(&tpl).Error; err != nil {
		return nil, err
	}
	return &tpl, nil
}

func ValidateNotificationTemplate(tpl *MailTemplate) error {
	if tpl == nil {
		return errors.New("nil template")
	}
	switch NormalizeNotificationTemplateType(tpl.ChannelType) {
	case NotificationTemplateTypeEmail:
		if strings.TrimSpace(tpl.HTMLBody) == "" {
			return fmt.Errorf("邮件模板需要 HTML 正文")
		}
	case NotificationTemplateTypeInbox:
		if strings.TrimSpace(tpl.InboxTitle) == "" || strings.TrimSpace(tpl.InboxBody) == "" {
			return fmt.Errorf("站内信模板需要标题和正文")
		}
	default:
		return fmt.Errorf("未知 channelType: %q", tpl.ChannelType)
	}
	return nil
}

func CreateMailTemplate(db *gorm.DB, tpl *MailTemplate) error {
	if tpl == nil {
		return errors.New("nil template")
	}
	return db.Create(tpl).Error
}

func SaveMailTemplate(db *gorm.DB, tpl *MailTemplate) error {
	if tpl == nil {
		return errors.New("nil template")
	}
	return db.Save(tpl).Error
}

func DeleteMailTemplateByID(db *gorm.DB, id uint) (int64, error) {
	// 硬删除：MailTemplate 在 (code, channel_type, locale) 上有唯一索引，
	// 软删除会保留行并占据唯一键，导致后续同 code 重建冲突。
	res := db.Unscoped().Delete(&MailTemplate{}, id)
	return res.RowsAffected, res.Error
}
