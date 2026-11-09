package wechatpay

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"testing"
)

func TestDecryptAESGCMRoundTrip(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef"
	nonce := "0123456789ab"
	plain := []byte(`{"trade_state":"SUCCESS"}`)
	block, err := aes.NewCipher([]byte(key))
	if err != nil {
		t.Fatal(err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	sealed := gcm.Seal(nil, []byte(nonce), plain, []byte("pay"))
	got, err := decryptAESGCM(key, nonce, "pay", base64.StdEncoding.EncodeToString(sealed))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(plain) {
		t.Fatalf("got %s", got)
	}
	if _, err := rand.Read(make([]byte, 1)); err != nil {
		t.Fatal(err)
	}
}
