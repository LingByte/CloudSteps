package handlers

import (
	"context"
	"testing"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/models"
	"github.com/LingByte/ling-base/cache/lru"
)

func newWechatAuthTestHandlers(t *testing.T) *Handlers {
	t.Helper()
	cache, err := lru.New[string, any](1000, lru.WithDefaultTTL(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cache.Close() })
	return &Handlers{cache: cache}
}

func TestWechatLoginCodePeekDoesNotConsume(t *testing.T) {
	h := newWechatAuthTestHandlers(t)
	ctx := context.Background()
	h.setWechatLoginCode(ctx, "123456", "sess-1")

	got, ok := h.getWechatLoginCode(ctx, "123456")
	if !ok || got == nil || got.SessionID != "sess-1" {
		t.Fatalf("expected code mapping, got %+v ok=%v", got, ok)
	}
	again, ok := h.getWechatLoginCode(ctx, "123456")
	if !ok || again == nil || again.SessionID != "sess-1" {
		t.Fatal("peek must leave the login code in cache for wechat retries")
	}
}

func TestWechatLoginCodeTextReuseAfterConfirmed(t *testing.T) {
	h := newWechatAuthTestHandlers(t)
	ctx := context.Background()
	h.setWechatLoginCode(ctx, "654321", "sess-2")
	h.setWechatLoginSession(ctx, &models.WechatLoginSession{
		SessionID: "sess-2",
		Status:    models.WechatLoginSessionConfirmed,
		ExpiresAt: time.Now().Add(time.Minute),
	})

	reply := h.handleWechatLoginCodeText(nil, ctx, "openid-1", "654321")
	if reply != "登录成功，请回到网页继续。" {
		t.Fatalf("retry after success should not look like expired code, got %q", reply)
	}
}

func TestWechatMsgIDDedup(t *testing.T) {
	h := newWechatAuthTestHandlers(t)
	ctx := context.Background()
	h.setWechatMsgReply(ctx, 42, "登录成功，请回到网页继续。")
	got, ok := h.getWechatMsgReply(ctx, 42)
	if !ok || got != "登录成功，请回到网页继续。" {
		t.Fatalf("expected cached reply, got %q ok=%v", got, ok)
	}
	if _, ok := h.getWechatMsgReply(ctx, 0); ok {
		t.Fatal("msg id 0 must not be cached")
	}
}

func TestWechatLoginCodeInvalid(t *testing.T) {
	h := newWechatAuthTestHandlers(t)
	ctx := context.Background()
	reply := h.handleWechatLoginCodeText(nil, ctx, "openid-1", "000000")
	if reply != "验证码无效或已过期，请刷新网页重新获取。" {
		t.Fatalf("got %q", reply)
	}
}
