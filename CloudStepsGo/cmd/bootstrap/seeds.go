package bootstrap

import (
	"errors"
	"strings"

	"github.com/LingByte/CloudStepsGo/pkg/config"
	"github.com/LingByte/CloudStepsGo/pkg/constants"
	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/CloudStepsGo/pkg/utils"
	"gorm.io/gorm"
)

type SeedService struct {
	db *gorm.DB
}

func (s *SeedService) SeedAll() error {
	if err := s.seedConfigs(); err != nil {
		return err
	}
	if err := s.seedUsers(); err != nil {
		return err
	}
	return nil
}

func (s *SeedService) seedUsers() error {
	defaultAdminEmail := "admin@cloudstep.com"
	defaultAdminPassword := "admin123"
	defaultPassword := "demo123"

	return s.db.Transaction(func(tx *gorm.DB) error {
		// 1) admin
		var count int64
		tx.Model(&models.User{}).Where("email = ?", strings.ToLower(defaultAdminEmail)).Count(&count)
		if count == 0 {
			admin := models.User{
				Email:       strings.ToLower(defaultAdminEmail),
				Password:    models.HashPassword(defaultAdminPassword),
				DisplayName: "Admin",
				Role:        models.RoleAdmin,
				Enabled:     true,
				Activated:   true,
				Source:      "seed",
			}
			if err := tx.Create(&admin).Error; err != nil {
				return err
			}
		}

		// 2) teachers (role=user)
		teachers := []models.User{
			{Email: "teacher1@cloudstep.com", Password: models.HashPassword(defaultPassword), DisplayName: "Teacher 1", Role: models.RoleUser, Enabled: true, Activated: true, Source: "seed"},
			{Email: "teacher2@cloudstep.com", Password: models.HashPassword(defaultPassword), DisplayName: "Teacher 2", Role: models.RoleUser, Enabled: true, Activated: true, Source: "seed"},
			{Email: "teacher3@cloudstep.com", Password: models.HashPassword(defaultPassword), DisplayName: "Teacher 3", Role: models.RoleUser, Enabled: true, Activated: true, Source: "seed"},
		}
		for _, u := range teachers {
			tx.Model(&models.User{}).Where("email = ?", strings.ToLower(u.Email)).Count(&count)
			if count > 0 {
				continue
			}
			u.Email = strings.ToLower(u.Email)
			if err := tx.Create(&u).Error; err != nil {
				return err
			}
		}

		// 3) demo students (role=student)
		students := []models.User{
			{Email: "student1@cloudstep.com", Password: models.HashPassword(defaultPassword), DisplayName: "Student 1", Role: models.RoleStudent, Enabled: true, Activated: true, Source: "seed"},
			{Email: "student2@cloudstep.com", Password: models.HashPassword(defaultPassword), DisplayName: "Student 2", Role: models.RoleStudent, Enabled: true, Activated: true, Source: "seed"},
			{Email: "student3@cloudstep.com", Password: models.HashPassword(defaultPassword), DisplayName: "Student 3", Role: models.RoleStudent, Enabled: true, Activated: true, Source: "seed"},
			{Email: "student4@cloudstep.com", Password: models.HashPassword(defaultPassword), DisplayName: "Student 4", Role: models.RoleStudent, Enabled: true, Activated: true, Source: "seed"},
			{Email: "student5@cloudstep.com", Password: models.HashPassword(defaultPassword), DisplayName: "Student 5", Role: models.RoleStudent, Enabled: true, Activated: true, Source: "seed"},
			{Email: "student6@cloudstep.com", Password: models.HashPassword(defaultPassword), DisplayName: "Student 6", Role: models.RoleStudent, Enabled: true, Activated: true, Source: "seed"},
		}
		for _, u := range students {
			tx.Model(&models.User{}).Where("email = ?", strings.ToLower(u.Email)).Count(&count)
			if count > 0 {
				continue
			}
			u.Email = strings.ToLower(u.Email)
			if err := tx.Create(&u).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *SeedService) seedConfigs() error {
	defaults := []utils.Config{
		{Key: constants.KEY_SITE_NAME, Desc: "Site Name", Autoload: true, Public: true, Format: "text", Value: func() string {
			if config.GlobalConfig.Server.Name != "" {
				return config.GlobalConfig.Server.Name
			}
			return "QINIU SIP"
		}()},
		{Key: constants.KEY_SITE_DESCRIPTION, Desc: "Site Description", Autoload: true, Public: true, Format: "text", Value: func() string {
			if config.GlobalConfig.Server.Desc != "" {
				return config.GlobalConfig.Server.Desc
			}
			return "QINIU SIP"
		}()},
	}
	for _, cfg := range defaults {
		var existingConfig utils.Config
		result := s.db.Where("`key` = ?", cfg.Key).First(&existingConfig)

		if result.Error != nil {
			if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
				return result.Error
			}
			if err := s.db.Create(&cfg).Error; err != nil {
				return err
			}
		} else {
			existingConfig.Value = cfg.Value
			existingConfig.Desc = cfg.Desc
			existingConfig.Autoload = cfg.Autoload
			existingConfig.Public = cfg.Public
			existingConfig.Format = cfg.Format
			if err := s.db.Save(&existingConfig).Error; err != nil {
				return err
			}
		}
	}
	return nil
}
