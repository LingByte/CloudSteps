package middlewares

import "testing"

func TestSkipTimeoutCircuitPath(t *testing.T) {
	t.Parallel()
	if !skipTimeoutCircuitPath("/api/auth/wechat/mp/message") {
		t.Fatal("mp callback must skip circuit breaker")
	}
	if !skipTimeoutCircuitPath("/api/auth/wechat/login/status") {
		t.Fatal("login status poll must skip circuit breaker")
	}
	if skipTimeoutCircuitPath("/api/auth/login/password") {
		t.Fatal("password login should still use circuit breaker")
	}
}
