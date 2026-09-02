package utils

import (
	"errors"
	"testing"
)

func TestRegistrationGuardMessage_passwordRules(t *testing.T) {
	cases := []struct {
		err  error
		want string
	}{
		{errors.New("password must contain at least one lowercase letter"), "密码需包含至少一个小写字母"},
		{errors.New("password must be at least 6 characters long"), "密码至少 6 位"},
		{errors.New("registration rate limit exceeded for this IP, please try again later"), "注册过于频繁，请稍后再试"},
	}
	for _, tc := range cases {
		if got := RegistrationGuardMessage(tc.err); got != tc.want {
			t.Fatalf("RegistrationGuardMessage(%q) = %q, want %q", tc.err, got, tc.want)
		}
	}
}

func TestUserFacingError_validationField(t *testing.T) {
	err := validateUsername("a")
	if err == nil {
		t.Fatal("expected validation error")
	}
	if got := UserFacingError(err); got != "账号至少 2 个字符" {
		t.Fatalf("UserFacingError() = %q", got)
	}
}
