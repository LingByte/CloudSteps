package llm

import "testing"

func TestParseJSONArray(t *testing.T) {
	raw := "Here is the list:\n```json\n[{\"word\":\"cat\"}]\n```"
	arr, err := ParseJSONArray(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(arr) != 1 || arr[0]["word"] != "cat" {
		t.Fatalf("unexpected %v", arr)
	}
}
