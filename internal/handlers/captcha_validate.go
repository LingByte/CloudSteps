package handlers

import (
	"strconv"
	"strings"

	"github.com/LingByte/ling-base/captcha"
)

// validateCaptchaPayload wraps captcha.ValidatePayload and coerces math answers
// sent as decimal strings (from text inputs) into ints. ling-base intValue()
// ignores strings and treats them as 0, which falsely rejects correct answers.
func validateCaptchaPayload(id, typ string, value interface{}) error {
	if strings.EqualFold(strings.TrimSpace(typ), string(captcha.TypeMath)) {
		switch v := value.(type) {
		case string:
			n, err := strconv.Atoi(strings.TrimSpace(v))
			if err == nil {
				value = n
			}
		}
	}
	return captcha.ValidatePayload(id, typ, value)
}
