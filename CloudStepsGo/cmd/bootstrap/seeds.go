package bootstrap

import (
	"errors"

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
	defaultAdminUsername := "admin"
	defaultPassword := "demo123"

	return s.db.Transaction(func(tx *gorm.DB) error {
		// 1) admin
		var count int64
		tx.Model(&models.User{}).Where("username = ?", defaultAdminUsername).Count(&count)
		if count == 0 {
			admin := models.User{
				Username:    "admin",
				Password:    models.HashPassword("admin123"),
				DisplayName: "Admin",
				Role:        models.RoleAdmin,
				Source:      "seed",
			}
			if err := tx.Create(&admin).Error; err != nil {
				return err
			}
		}

		// 2) teachers (role=teacher)
		teachers := []models.User{
			{Username: "teacher1", Password: models.HashPassword(defaultPassword), DisplayName: "Teacher 1", Role: models.RoleTeacher, Source: "seed"},
			{Username: "teacher2", Password: models.HashPassword(defaultPassword), DisplayName: "Teacher 2", Role: models.RoleTeacher, Source: "seed"},
			{Username: "teacher3", Password: models.HashPassword(defaultPassword), DisplayName: "Teacher 3", Role: models.RoleTeacher, Source: "seed"},
		}
		for _, u := range teachers {
			tx.Model(&models.User{}).Where("username = ?", u.Username).Count(&count)
			if count > 0 {
				continue
			}
			if err := tx.Create(&u).Error; err != nil {
				return err
			}
		}

		// 3) demo students (role=student)
		students := []models.User{
			{Username: "student1", Password: models.HashPassword(defaultPassword), DisplayName: "Student 1", Role: models.RoleStudent, Source: "seed"},
			{Username: "student2", Password: models.HashPassword(defaultPassword), DisplayName: "Student 2", Role: models.RoleStudent, Source: "seed"},
			{Username: "student3", Password: models.HashPassword(defaultPassword), DisplayName: "Student 3", Role: models.RoleStudent, Source: "seed"},
			{Username: "student4", Password: models.HashPassword(defaultPassword), DisplayName: "Student 4", Role: models.RoleStudent, Source: "seed"},
			{Username: "student5", Password: models.HashPassword(defaultPassword), DisplayName: "Student 5", Role: models.RoleStudent, Source: "seed"},
			{Username: "student6", Password: models.HashPassword(defaultPassword), DisplayName: "Student 6", Role: models.RoleStudent, Source: "seed"},
		}
		for _, u := range students {
			tx.Model(&models.User{}).Where("username = ?", u.Username).Count(&count)
			if count > 0 {
				continue
			}
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
