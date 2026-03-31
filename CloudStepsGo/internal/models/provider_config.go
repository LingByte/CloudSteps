package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
)

// ProviderConfig stores flexible provider configuration in JSON form.
// It implements driver.Valuer and sql.Scanner for GORM.
//
// Note: A nil or empty config will be stored as NULL.
type ProviderConfig map[string]any

func (c ProviderConfig) Value() (driver.Value, error) {
	if c == nil || len(c) == 0 {
		return nil, nil
	}
	b, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	return b, nil
}

func (c *ProviderConfig) Scan(value any) error {
	if c == nil {
		return errors.New("ProviderConfig: Scan on nil receiver")
	}
	if value == nil {
		*c = ProviderConfig{}
		return nil
	}

	var b []byte
	switch v := value.(type) {
	case []byte:
		b = v
	case string:
		b = []byte(v)
	default:
		*c = nil
		return fmt.Errorf("ProviderConfig: unsupported Scan type %T", value)
	}

	if len(b) == 0 {
		*c = ProviderConfig{}
		return nil
	}

	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		*c = nil
		return err
	}
	*c = ProviderConfig(m)
	return nil
}

// GroupPermission represents group permission settings.
type GroupPermission struct {
	Permissions []string `json:"Permissions"`
}

func (gp GroupPermission) Value() (driver.Value, error) {
	b, err := json.Marshal(gp)
	if err != nil {
		return nil, err
	}
	return b, nil
}

func (gp *GroupPermission) Scan(value any) error {
	if gp == nil {
		return errors.New("GroupPermission: Scan on nil receiver")
	}
	if value == nil {
		*gp = GroupPermission{}
		return nil
	}

	var b []byte
	switch v := value.(type) {
	case []byte:
		b = v
	case string:
		b = []byte(v)
	default:
		return fmt.Errorf("GroupPermission: unsupported Scan type %T", value)
	}

	if len(b) == 0 {
		*gp = GroupPermission{}
		return nil
	}

	return json.Unmarshal(b, gp)
}

// UserCredential stores third-party credential configuration.
type UserCredential struct {
	AsrConfig ProviderConfig `json:"asrConfig" gorm:"type:json"`
	TtsConfig ProviderConfig `json:"ttsConfig" gorm:"type:json"`
}

func (uc *UserCredential) GetASRProvider() string {
	if uc == nil || uc.AsrConfig == nil {
		return ""
	}
	v, ok := uc.AsrConfig["provider"].(string)
	if !ok {
		return ""
	}
	return v
}

func (uc *UserCredential) GetASRConfig(key string) any {
	if uc == nil || uc.AsrConfig == nil {
		return nil
	}
	v, ok := uc.AsrConfig[key]
	if !ok {
		return nil
	}
	return v
}

func (uc *UserCredential) GetASRConfigString(key string) string {
	v := uc.GetASRConfig(key)
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return s
}

func (uc *UserCredential) GetTTSProvider() string {
	if uc == nil || uc.TtsConfig == nil {
		return ""
	}
	v, ok := uc.TtsConfig["provider"].(string)
	if !ok {
		return ""
	}
	return v
}

func (uc *UserCredential) GetTTSConfig(key string) any {
	if uc == nil || uc.TtsConfig == nil {
		return nil
	}
	v, ok := uc.TtsConfig[key]
	if !ok {
		return nil
	}
	return v
}

func (uc *UserCredential) GetTTSConfigString(key string) string {
	v := uc.GetTTSConfig(key)
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return s
}
