package llm

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/ling-base/relay"
	"github.com/LingByte/ling-base/relay/channel/openai"
	"github.com/LingByte/ling-base/relay/meter"
)

// Config is runtime LLM configuration (OpenAI-compatible chat API).
type Config struct {
	APIKey  string
	BaseURL string
	Model   string
}

// FromGlobal reads LLM settings from loaded app config.
func FromGlobal() Config {
	if configs.Global == nil {
		return Config{}
	}
	c := configs.Global.Services.LLM
	model := strings.TrimSpace(c.Model)
	if model == "" {
		model = "gpt-4o-mini"
	}
	return Config{
		APIKey:  strings.TrimSpace(c.APIKey),
		BaseURL: normalizeBaseURL(c.BaseURL),
		Model:   model,
	}
}

func normalizeBaseURL(raw string) string {
	u := strings.TrimSpace(raw)
	u = strings.TrimSuffix(u, "/")
	u = strings.TrimSuffix(u, "/v1")
	return u
}

// Enabled reports whether chat completion can be called.
func (c Config) Enabled() bool {
	return c.APIKey != "" && c.BaseURL != "" && c.Model != ""
}

func (c Config) relayClient() *relay.Client {
	provider := openai.NewProvider(c.APIKey, openai.WithBaseURL(c.BaseURL))
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   15 * time.Second,
		ResponseHeaderTimeout: 90 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
	httpClient := &http.Client{
		Timeout:   2 * time.Minute,
		Transport: transport,
	}
	return relay.New(
		relay.WithProvider(provider),
		relay.WithMeter(meter.NewMemoryMeter()),
		relay.WithHTTPClient(httpClient),
	)
}

// Chat runs a single-turn chat (system + user) and returns assistant text.
func (c Config) Chat(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	if !c.Enabled() {
		return "", ErrNotConfigured
	}
	client := c.relayClient()
	resp, err := client.Chat(ctx, &relay.ChatRequest{
		Model: c.Model,
		Messages: []relay.Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
	})
	if err != nil {
		return "", err
	}
	if resp == nil || len(resp.Choices) == 0 {
		return "", ErrEmptyResponse
	}
	msg := resp.Choices[0].Message
	text := strings.TrimSpace(msg.StringContent())
	if text == "" {
		switch v := msg.Content.(type) {
		case string:
			text = strings.TrimSpace(v)
		case json.RawMessage:
			_ = json.Unmarshal(v, &text)
			text = strings.TrimSpace(text)
		}
	}
	if text == "" {
		return "", ErrEmptyResponse
	}
	return text, nil
}
