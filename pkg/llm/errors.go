package llm

import "errors"

var (
	ErrNotConfigured  = errors.New("llm not configured")
	ErrEmptyResponse  = errors.New("llm empty response")
)
