package handlers

import (
	lbresponse "github.com/LingByte/ling-base/common/response"
	response "github.com/LingByte/ling-base/common/response/gin"
	"github.com/LingByte/CloudStepsGo/pkg/utils"
	"github.com/gin-gonic/gin"
)

// failUserMessage returns a business error with a direct user-facing message
// (avoids i18n MsgKey overriding the specific validation text).
func failUserMessage(c *gin.Context, err error) {
	msg := utils.UserFacingError(err)
	if msg == "" {
		response.FailI18n(c, "common.invalid_params", nil)
		return
	}
	code := lbresponse.CodeBadRequest
	if utils.IsRegistrationThrottleError(err) {
		code = lbresponse.CodeRateLimited
	}
	response.FailAppError(c, &lbresponse.AppError{
		Code:    code,
		Message: msg,
	})
}
