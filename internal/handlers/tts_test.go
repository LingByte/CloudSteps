package handlers

import (
	"bytes"
	"io"
	"strings"
	"testing"
)

type memStore struct {
	objects map[string][]byte
	baseURL string
}

func newMemStore() *memStore {
	return &memStore{objects: map[string][]byte{}, baseURL: "https://cdn.example/"}
}

func (m *memStore) Read(key string) (io.ReadCloser, int64, error) {
	b, ok := m.objects[key]
	if !ok {
		return nil, 0, io.EOF
	}
	return io.NopCloser(bytes.NewReader(b)), int64(len(b)), nil
}

func (m *memStore) Write(key string, r io.Reader) error {
	b, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	m.objects[key] = b
	return nil
}

func (m *memStore) Delete(key string) error {
	delete(m.objects, key)
	return nil
}

func (m *memStore) Exists(key string) (bool, error) {
	_, ok := m.objects[key]
	return ok, nil
}

func (m *memStore) PublicURL(key string) string {
	return m.baseURL + key
}

func TestTtsObjectKey_stableAndNoTimestamp(t *testing.T) {
	a := ttsObjectKey("Hello world.", 1005, "en")
	b := ttsObjectKey("Hello world.", 1005, "en")
	if a != b {
		t.Fatalf("unstable key: %q vs %q", a, b)
	}
	if !strings.HasPrefix(a, "tts/") || !strings.HasSuffix(a, ".wav") {
		t.Fatalf("bad key format: %q", a)
	}
	if strings.Contains(a, "_") {
		t.Fatalf("key should not include timestamp suffix: %q", a)
	}
	other := ttsObjectKey("Hello world!", 1005, "en")
	if a == other {
		t.Fatal("different text should yield different keys")
	}
}

func TestTtsCachedPublicURL_hitAndMiss(t *testing.T) {
	store := newMemStore()
	key := ttsObjectKey("Hi", 1, "en")

	url, hit, err := ttsCachedPublicURL(store, key)
	if err != nil {
		t.Fatal(err)
	}
	if hit || url != "" {
		t.Fatalf("expected miss, got hit=%v url=%q", hit, url)
	}

	if err := store.Write(key, strings.NewReader("wav")); err != nil {
		t.Fatal(err)
	}
	url, hit, err = ttsCachedPublicURL(store, key)
	if err != nil {
		t.Fatal(err)
	}
	if !hit {
		t.Fatal("expected hit")
	}
	if url != store.PublicURL(key) {
		t.Fatalf("url=%q", url)
	}
}
