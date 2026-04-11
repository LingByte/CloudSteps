package handlers

import (
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/constants"
	"github.com/LingByte/CloudStepsGo/pkg/response"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var errCoachingTeacherCapFull = errors.New("本月老师计费额度已满，无法开始上课")

const (
	coachingAuditAppointmentCreate = "appointment_create"
	coachingAuditAppointmentUpdate = "appointment_update"
	coachingAuditAppointmentDelete = "appointment_delete"
	coachingAuditQuotaUpsert       = "quota_upsert"
	coachingAuditUsagePeriodPut    = "usage_period_put"
	coachingAuditSessionStart      = "session_start"
	coachingAuditSessionEnd        = "session_end"
)

func coachingTeacherCapAllowsStart(db *gorm.DB, teacherID uint, ref time.Time) error {
	loc := time.Local
	ref = ref.In(loc)
	y, m, _ := ref.Date()
	periodStart := time.Date(y, m, 1, 0, 0, 0, 0, loc)
	var p models.TeacherCoachingUsagePeriod
	err := db.Where("teacher_id = ? AND period_start = ? AND is_deleted = 0", teacherID, periodStart).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if p.CapMinutes > 0 && p.UsedMinutes >= p.CapMinutes {
		return errCoachingTeacherCapFull
	}
	return nil
}

func coachingWriteCoachingAudit(db *gorm.DB, c *gin.Context, action, targetType string, targetID, appointmentID uint, summary string, detail map[string]any) {
	u := models.CurrentUser(c)
	if u == nil {
		return
	}
	var detailJSON string
	if len(detail) > 0 {
		if b, err := json.Marshal(detail); err == nil {
			detailJSON = string(b)
		}
	}
	row := models.CoachingAuditLog{
		ActorID:         u.ID,
		ActorUsername:   u.Username,
		ActorRole:       u.Role,
		Action:          action,
		TargetType:      targetType,
		TargetID:        targetID,
		AppointmentID:   appointmentID,
		Summary:         summary,
		DetailJSON:      detailJSON,
		IP:              c.ClientIP(),
	}
	_ = db.Create(&row).Error
}

type coachingAuditLogOut struct {
	ID            uint           `json:"id"`
	CreatedAt     time.Time      `json:"createdAt"`
	ActorID       uint           `json:"actorId"`
	ActorUsername string         `json:"actorUsername"`
	ActorRole     string         `json:"actorRole"`
	Action        string         `json:"action"`
	TargetType    string         `json:"targetType"`
	TargetID      uint           `json:"targetId"`
	AppointmentID uint           `json:"appointmentId"`
	Summary       string         `json:"summary"`
	Detail        map[string]any `json:"detail,omitempty"`
	IP            string         `json:"ip,omitempty"`
}

func (h *Handlers) coachingAdminListAuditLogs(c *gin.Context) {
	db := c.MustGet(constants.DbField).(*gorm.DB)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	tx := db.Model(&models.CoachingAuditLog{})
	if a := c.Query("action"); a != "" {
		tx = tx.Where("action = ?", a)
	}
	if aid := c.Query("appointmentId"); aid != "" {
		if v, _ := strconv.Atoi(aid); v > 0 {
			tx = tx.Where("appointment_id = ?", v)
		}
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		response.Fail(c, "查询失败", err.Error())
		return
	}
	var rows []models.CoachingAuditLog
	if err := tx.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		response.Fail(c, "查询失败", err.Error())
		return
	}
	out := make([]coachingAuditLogOut, 0, len(rows))
	for _, r := range rows {
		item := coachingAuditLogOut{
			ID: r.ID, CreatedAt: r.CreatedAt, ActorID: r.ActorID,
			ActorUsername: r.ActorUsername, ActorRole: r.ActorRole,
			Action: r.Action, TargetType: r.TargetType, TargetID: r.TargetID,
			AppointmentID: r.AppointmentID, Summary: r.Summary, IP: r.IP,
		}
		if r.DetailJSON != "" {
			var m map[string]any
			if json.Unmarshal([]byte(r.DetailJSON), &m) == nil {
				item.Detail = m
			}
		}
		out = append(out, item)
	}
	response.Success(c, "ok", gin.H{
		"list": out, "total": total, "page": page, "pageSize": pageSize,
	})
}
