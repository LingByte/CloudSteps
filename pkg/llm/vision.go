package llm

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/LingByte/ling-base/relay"
)

// ChatVision sends a text + image message and returns assistant text.
func (c Config) ChatVision(ctx context.Context, systemPrompt, userPrompt string, image []byte, mime string) (string, error) {
	if strings.TrimSpace(c.APIKey) == "" {
		return "", ErrNotConfigured
	}
	if len(image) == 0 {
		return "", fmt.Errorf("image is required")
	}
	if mime == "" {
		mime = "image/jpeg"
	}
	b64 := base64.StdEncoding.EncodeToString(image)
	dataURL := fmt.Sprintf("data:%s;base64,%s", mime, b64)

	client := c.relayClient()
	resp, err := client.Chat(ctx, &relay.ChatRequest{
		Model: c.Model,
		Messages: []relay.Message{
			{Role: "system", Content: systemPrompt},
			{
				Role: "user",
				Content: []map[string]any{
					{"type": "text", "text": userPrompt},
					{
						"type": "image_url",
						"image_url": map[string]string{
							"url":    dataURL,
							"detail": "high",
						},
					},
				},
			},
		},
	})
	if err != nil {
		return "", err
	}
	if resp == nil || len(resp.Choices) == 0 {
		return "", ErrEmptyResponse
	}
	text := strings.TrimSpace(resp.Choices[0].Message.StringContent())
	if text == "" {
		return "", ErrEmptyResponse
	}
	return text, nil
}

// ParseJSONArray extracts a JSON array substring from model output.
func ParseJSONArray(raw string) ([]map[string]any, error) {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)
	start := strings.Index(raw, "[")
	end := strings.LastIndex(raw, "]")
	if start < 0 || end <= start {
		return nil, fmt.Errorf("no JSON array in model output")
	}
	var out []map[string]any
	if err := json.Unmarshal([]byte(raw[start:end+1]), &out); err != nil {
		return nil, err
	}
	return out, nil
}
