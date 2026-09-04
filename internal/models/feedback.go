package models

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/LingByte/CloudStepsGo/internal/constants"
	common "github.com/LingByte/ling-base/common"
)

const (
	FeedbackStatusOpen   = "open"
	FeedbackStatusClosed = "closed"

	FeedbackRoleUser  = "user"
	FeedbackRoleAdmin = "admin"

	FeedbackContentMinRunes = 1
	FeedbackContentMaxRunes = 12000
	FeedbackContactMaxRunes = 128
	FeedbackPreviewMaxRunes = 80
)

var (
	ErrFeedbackClosed         = errors.New("feedback ticket is closed")
	ErrFeedbackContentInvalid = errors.New("feedback content is invalid")
	ErrFeedbackContactInvalid = errors.New("feedback contact is invalid")
)

// FeedbackTicket is a support conversation opened by a signed-in user.
// The opening message lives on the ticket; later messages are FeedbackReply rows.
type FeedbackTicket struct {
	common.BaseModel
	UserID           uint            `json:"userId" gorm:"index;not null"`
	Content          string          `json:"content" gorm:"type:text;not null"`
	Contact          string          `json:"contact,omitempty" gorm:"size:128"`
	Status           string          `json:"status" gorm:"size:16;index;not null;default:open"`
	UserUnread       bool            `json:"userUnread" gorm:"index;not null;default:false;comment:用户侧未读（管理员回复后置 true）"`
	LastRepliedAt    *time.Time      `json:"lastRepliedAt,omitempty"`
	LastReplierRole  string          `json:"lastReplierRole,omitempty" gorm:"size:16"`
	LastReplyPreview string          `json:"lastReplyPreview,omitempty" gorm:"size:255"`
	ReplyCount       int             `json:"replyCount" gorm:"not null;default:0"`
	Replies          []FeedbackReply `json:"replies,omitempty" gorm:"foreignKey:TicketID"`
	User             *User           `json:"user,omitempty" gorm:"foreignKey:UserID"`
}

func (FeedbackTicket) TableName() string { return constants.TABLE_FEEDBACK_TICKETS }

func (t *FeedbackTicket) CanReply() bool {
	return t != nil && t.Status != FeedbackStatusClosed && !t.DeletedAt.Valid
}

// FeedbackReply is one message on a feedback ticket, from the user or an admin.
type FeedbackReply struct {
	common.BaseModel
	TicketID uint   `json:"ticketId" gorm:"index;not null"`
	AuthorID uint   `json:"authorId" gorm:"index;not null"`
	Role     string `json:"role" gorm:"size:16;not null"`
	Content  string `json:"content" gorm:"type:text;not null"`
}

func (FeedbackReply) TableName() string { return constants.TABLE_FEEDBACK_REPLIES }

func NormalizeFeedbackContent(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", ErrFeedbackContentInvalid
	}
	if strings.HasPrefix(s, "{") {
		p := ParseFeedbackContent(s)
		encoded, err := EncodeFeedbackContent(p.Text, p.Images)
		if err != nil {
			return "", err
		}
		return encoded, nil
	}
	n := utf8.RuneCountInString(s)
	if n < FeedbackContentMinRunes || n > FeedbackContentMaxRunes {
		return "", ErrFeedbackContentInvalid
	}
	return s, nil
}

func NormalizeFeedbackContact(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", nil
	}
	if utf8.RuneCountInString(s) > FeedbackContactMaxRunes {
		return "", ErrFeedbackContactInvalid
	}
	return s, nil
}

// FeedbackContentPayload is text + image attachments stored in Content.
type FeedbackContentPayload struct {
	V      int      `json:"v"`
	Text   string   `json:"text"`
	Images []string `json:"images,omitempty"`
}

// ParseFeedbackContent turns stored content into text + image attachments.
func ParseFeedbackContent(raw string) FeedbackContentPayload {
	s := strings.TrimSpace(raw)
	if s == "" {
		return FeedbackContentPayload{V: 1}
	}
	if strings.HasPrefix(s, "{") {
		var p FeedbackContentPayload
		if err := json.Unmarshal([]byte(s), &p); err == nil && (p.V > 0 || p.Text != "" || len(p.Images) > 0) {
			if p.V == 0 {
				p.V = 1
			}
			p.Text = strings.TrimSpace(p.Text)
			imgs := make([]string, 0, len(p.Images))
			for _, u := range p.Images {
				u = strings.TrimSpace(u)
				if u != "" {
					imgs = append(imgs, u)
				}
			}
			p.Images = imgs
			return p
		}
	}
	imgs := make([]string, 0)
	text := feedbackImageMDRe.ReplaceAllStringFunc(s, func(m string) string {
		sub := feedbackImageURLRe.FindStringSubmatch(m)
		if len(sub) == 2 && strings.TrimSpace(sub[1]) != "" {
			imgs = append(imgs, strings.TrimSpace(sub[1]))
		}
		return " "
	})
	text = feedbackLinkMDRe.ReplaceAllString(text, "$1")
	text = strings.Join(strings.Fields(text), " ")
	return FeedbackContentPayload{V: 1, Text: text, Images: imgs}
}

// EncodeFeedbackContent serializes text + images for storage.
func EncodeFeedbackContent(text string, images []string) (string, error) {
	imgs := make([]string, 0, len(images))
	for _, u := range images {
		u = strings.TrimSpace(u)
		if u != "" {
			imgs = append(imgs, u)
		}
	}
	p := FeedbackContentPayload{
		V:      1,
		Text:   strings.TrimSpace(text),
		Images: imgs,
	}
	if p.Text == "" && len(p.Images) == 0 {
		return "", ErrFeedbackContentInvalid
	}
	b, err := json.Marshal(p)
	if err != nil {
		return "", err
	}
	if utf8.RuneCountInString(string(b)) > FeedbackContentMaxRunes {
		return "", ErrFeedbackContentInvalid
	}
	return string(b), nil
}

func PreviewFeedback(raw string, maxRunes int) string {
	if maxRunes <= 0 {
		maxRunes = FeedbackPreviewMaxRunes
	}
	p := ParseFeedbackContent(raw)
	s := strings.TrimSpace(p.Text)
	if len(p.Images) > 0 {
		if s == "" {
			s = "[图片]"
		} else {
			s += " [图片]"
		}
	}
	s = strings.Join(strings.Fields(s), " ")
	runes := []rune(s)
	if len(runes) <= maxRunes {
		return s
	}
	return string(runes[:maxRunes]) + "…"
}

var (
	feedbackImageMDRe  = regexp.MustCompile(`!\[[^\]]*]\([^)]+\)`)
	feedbackImageURLRe = regexp.MustCompile(`!\[[^\]]*]\(([^)]+)\)`)
	feedbackLinkMDRe   = regexp.MustCompile(`\[([^\]]+)]\([^)]+\)`)
)

func NewFeedbackTicket(userID uint, content, contact, operator string) (*FeedbackTicket, error) {
	body, err := NormalizeFeedbackContent(content)
	if err != nil {
		return nil, err
	}
	contactVal, err := NormalizeFeedbackContact(contact)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	ticket := &FeedbackTicket{
		UserID:           userID,
		Content:          body,
		Contact:          contactVal,
		Status:           FeedbackStatusOpen,
		LastRepliedAt:    &now,
		LastReplierRole:  FeedbackRoleUser,
		LastReplyPreview: PreviewFeedback(body, FeedbackPreviewMaxRunes),
	}
	ticket.SetCreateInfo(operator)
	return ticket, nil
}

func NewFeedbackReply(ticketID, authorID uint, role, content, operator string) (*FeedbackReply, error) {
	body, err := NormalizeFeedbackContent(content)
	if err != nil {
		return nil, err
	}
	if role != FeedbackRoleUser && role != FeedbackRoleAdmin {
		role = FeedbackRoleUser
	}
	reply := &FeedbackReply{
		TicketID: ticketID,
		AuthorID: authorID,
		Role:     role,
		Content:  body,
	}
	reply.SetCreateInfo(operator)
	return reply, nil
}
