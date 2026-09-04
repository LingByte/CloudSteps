package handlers

import "testing"

func TestValidateCaptchaPayload_mathStringCoercion(t *testing.T) {
	// Without a live captcha store this only checks that string math values
	// don't panic and still go through ValidatePayload; full verify needs store.
	err := validateCaptchaPayload("", "math", "8")
	if err == nil {
		t.Fatal("expected required/invalid error for empty id")
	}
	err = validateCaptchaPayload("x", "math", "not-a-number")
	if err == nil {
		t.Fatal("expected invalid error for non-numeric math answer")
	}
}
