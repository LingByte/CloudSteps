package handlers

import (
	"errors"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	errCoachingLessonNotEligible = errors.New("仅排课上课可扣除学员课时")
	errCoachingLessonNoQuota     = errors.New("学员课时不足")
)

// coachingAppointmentIsPractice 首页无排课练习（notes=practice）不扣学员课时。
func coachingAppointmentIsPractice(ap *models.CoachingAppointment) bool {
	if ap == nil {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(ap.Notes), "practice")
}

// coachingConsumeStudentLesson 排课课次完成训后检测时扣 1 学员课时（幂等）。
// practice 课次直接返回 already billed / not eligible，不扣减。
func coachingConsumeStudentLesson(db *gorm.DB, appointmentID uint, auditC *gin.Context) (*models.CoachingAppointment, error) {
	var ap models.CoachingAppointment
	if err := db.Where("id = ?", appointmentID).First(&ap).Error; err != nil {
		return nil, err
	}
	if coachingAppointmentIsPractice(&ap) {
		return &ap, errCoachingLessonNotEligible
	}
	if ap.Status != models.CoachingStatusInProgress && ap.Status != models.CoachingStatusCompleted {
		return nil, errors.New("课次未开始或状态不可扣课时")
	}
	if ap.StudentLessonsBilled > 0 {
		return &ap, nil // 幂等成功
	}

	err := db.Transaction(func(tx *gorm.DB) error {
		var locked models.CoachingAppointment
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", appointmentID).First(&locked).Error; err != nil {
			return err
		}
		if locked.StudentLessonsBilled > 0 {
			ap = locked
			return nil
		}
		var q models.StudentTeacherCoachingQuota
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("teacher_id = ? AND student_id = ?", locked.TeacherID, locked.StudentID).
			First(&q).Error; err != nil {
			return err
		}
		if q.RemainingLessons < 1 {
			return errCoachingLessonNoQuota
		}
		res := tx.Model(&models.StudentTeacherCoachingQuota{}).
			Where("id = ? AND version = ? AND remaining_lessons >= 1", q.ID, q.Version).
			Updates(map[string]any{
				"remaining_lessons": q.RemainingLessons - 1,
				"version":           q.Version + 1,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errors.New("课时更新冲突，请重试")
		}
		if err := tx.Model(&locked).Update("student_lessons_billed", 1).Error; err != nil {
			return err
		}
		locked.StudentLessonsBilled = 1
		// 若已完课，同步 session 快照（训后检测可能在下课之后）
		_ = tx.Model(&models.CoachingSessionRecord{}).
			Where("appointment_id = ?", appointmentID).
			Update("student_lessons_billed", 1).Error
		ap = locked
		return nil
	})
	if err != nil {
		return nil, err
	}
	if auditC != nil {
		coachingWriteCoachingAudit(db, auditC, coachingAuditQuotaUpsert, "appointment", appointmentID, appointmentID, "训后检测扣除学员课时", map[string]any{
			"teacherId": ap.TeacherID, "studentId": ap.StudentID, "lessons": 1,
		})
	}
	return &ap, nil
}

// coachingCompleteAppointment 完课：只扣老师教学池分钟并写入 session（幂等：已有 session 则返回）。
// 学员课时不在此处扣除（见 coachingConsumeStudentLesson）。
func coachingCompleteAppointment(db *gorm.DB, appointmentID uint, endedAt time.Time, auditC *gin.Context, autoEnd bool) (*models.CoachingSessionRecord, *models.CoachingAppointment, error) {
	var existing models.CoachingSessionRecord
	if err := db.Where("appointment_id = ?", appointmentID).First(&existing).Error; err == nil {
		var ap models.CoachingAppointment
		_ = db.Where("id = ?", appointmentID).First(&ap).Error
		return &existing, &ap, nil
	}

	var ap models.CoachingAppointment
	if err := db.Where("id = ?", appointmentID).First(&ap).Error; err != nil {
		return nil, nil, err
	}
	if ap.Status != models.CoachingStatusInProgress {
		return nil, nil, errors.New("只有上课中的排课可以下课")
	}
	if ap.ActualStartedAt == nil {
		return nil, nil, errors.New("缺少实际上课开始时间")
	}

	loc := time.Local
	endedAt = models.CoachingEffectiveEndTime(&ap, endedAt, loc)
	actual := models.CoachingBillingActualMinutes(&ap, *ap.ActualStartedAt, endedAt, loc)

	var rec models.CoachingSessionRecord
	err := db.Transaction(func(tx *gorm.DB) error {
		var lockedAp models.CoachingAppointment
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", appointmentID).First(&lockedAp).Error; err != nil {
			return err
		}
		if lockedAp.Status != models.CoachingStatusInProgress {
			return errors.New("只有上课中的排课可以下课")
		}
		ap = lockedAp

		period, err := coachingGetOrCreateUsagePeriod(tx, ap.TeacherID, endedAt)
		if err != nil {
			return err
		}
		var lockedPeriod models.TeacherCoachingUsagePeriod
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", period.ID).First(&lockedPeriod).Error; err != nil {
			return err
		}

		teacherCred := actual
		// 老师有活跃订阅（包月/包年/买断）时不扣减授课池，但时间仍记录
		teacherSubscribed := models.TeacherHasActiveSubscription(tx, ap.TeacherID)
		if !teacherSubscribed {
			var pool models.TeacherTeachingPool
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("teacher_id = ?", ap.TeacherID).
				First(&pool).Error; err != nil {
				return err
			}
			if pool.RemainingMinutes < teacherCred {
				teacherCred = pool.RemainingMinutes
			}
			if teacherCred > 0 {
				poolRes := tx.Model(&models.TeacherTeachingPool{}).
					Where("id = ? AND version = ?", pool.ID, pool.Version).
					Updates(map[string]any{
						"remaining_minutes": pool.RemainingMinutes - teacherCred,
						"version":           pool.Version + 1,
					})
				if poolRes.Error != nil {
					return poolRes.Error
				}
				if poolRes.RowsAffected == 0 {
					return errors.New("老师授课池更新冲突，请重试")
				}
			}
		} else {
			teacherCred = 0 // 订阅用户不扣减授课池
		}
		// 用量周期仍记录实际使用分钟（含订阅用户）
		if err := tx.Model(&lockedPeriod).Update("used_minutes", lockedPeriod.UsedMinutes+actual).Error; err != nil {
			return err
		}
		rec = models.CoachingSessionRecord{
			AppointmentID: appointmentID, TeacherID: ap.TeacherID, StudentID: ap.StudentID,
			StartedAt: *ap.ActualStartedAt, EndedAt: endedAt,
			ActualMinutes: actual, BilledMinutes: teacherCred, TeacherCreditedMinutes: teacherCred,
			StudentLessonsBilled: ap.StudentLessonsBilled,
			Status:               models.CoachingSessionStatusCompleted,
		}
		if err := tx.Create(&rec).Error; err != nil {
			return err
		}
		updates := map[string]any{
			"status": models.CoachingStatusCompleted,
		}
		// 首页单词练习：计划窗常为 180 分钟，完课后改写为实际练习起止，避免课表显示「预设三小时」
		if coachingAppointmentIsPractice(&ap) && ap.ActualStartedAt != nil {
			startLocal := ap.ActualStartedAt.In(loc)
			endLocal := endedAt.In(loc)
			updates["start_time"] = startLocal.Format("15:04")
			updates["end_time"] = endLocal.Format("15:04")
			if actual > 0 {
				updates["duration_minutes"] = actual
			}
		}
		return tx.Model(&ap).Updates(updates).Error
	})
	if err != nil {
		return nil, nil, err
	}
	_ = db.First(&rec, rec.ID).Error
	_ = db.First(&ap, ap.ID).Error

	if auditC != nil {
		summary := "下课完课"
		action := coachingAuditSessionEnd
		if autoEnd {
			summary = "排课结束自动下课"
			action = coachingAuditSessionAutoEnd
		}
		coachingWriteCoachingAudit(db, auditC, action, "session", rec.ID, appointmentID, summary, map[string]any{
			"teacherId": rec.TeacherID, "studentId": rec.StudentID,
			"actualMinutes": rec.ActualMinutes, "billedMinutes": rec.BilledMinutes,
			"teacherCreditedMinutes": rec.TeacherCreditedMinutes,
			"studentLessonsBilled":   rec.StudentLessonsBilled,
			"autoEnd":                autoEnd,
		})
	} else {
		coachingWriteCoachingAuditSystem(db, coachingAuditSessionAutoEnd, "session", rec.ID, appointmentID, "排课结束自动下课", map[string]any{
			"appointmentId": appointmentID, "actualMinutes": rec.ActualMinutes,
		})
	}
	return &rec, &ap, nil
}

// CoachingAutoEndOverdueSessions 将已过排课结束时间但仍 in_progress 的课自动完课
func CoachingAutoEndOverdueSessions(db *gorm.DB) (int, error) {
	loc := time.Local
	now := time.Now().In(loc)
	var list []models.CoachingAppointment
	if err := db.Where("status = ?", models.CoachingStatusInProgress).Find(&list).Error; err != nil {
		return 0, err
	}
	n := 0
	for i := range list {
		ap := list[i]
		_, slotEnd, _, err := models.CoachingAppointmentSlotBounds(&ap, loc)
		if err != nil {
			continue
		}
		if now.Before(slotEnd) {
			continue
		}
		if _, _, err := coachingCompleteAppointment(db, ap.ID, slotEnd, nil, true); err != nil {
			continue
		}
		n++
	}
	return n, nil
}
