package utils

import (
	"strings"
	"testing"
)

func TestSplitIcibaPOSGloss(t *testing.T) {
	cases := []struct {
		line, wantPOS, wantGloss string
	}{
		{"adj. 不合法的，非法的", "adj.", "不合法的，非法的"},
		{"n. 自我，自己", "n.", "自我，自己"},
		{"vt.& vi.改变", "", "vt.& vi.改变"},
		{"  adv. 或许 ", "adv.", "或许"},
	}
	for _, tc := range cases {
		pos, gloss := splitIcibaPOSGloss(tc.line)
		if pos != tc.wantPOS || gloss != tc.wantGloss {
			t.Errorf("splitIcibaPOSGloss(%q) = pos %q gloss %q; want pos %q gloss %q", tc.line, pos, gloss, tc.wantPOS, tc.wantGloss)
		}
	}
}

func TestExtractIcibaClassIDsFromIndexHTML(t *testing.T) {
	body := []byte(`<a href="?action=courses&classid=11">x</a> href='classid=99' classid=11 dup`)
	got := ExtractIcibaClassIDsFromIndexHTML(body)
	want := []int{11, 99}
	if len(got) != len(want) {
		t.Fatalf("got %v want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v want %v", got, want)
		}
	}
}

func TestParseIcibaWordPageHTML(t *testing.T) {
	const snippet = `<!DOCTYPE html><html><body>
<div class="word_h2"><p>四级必备词汇 第3课<span><em id="newword">x</em></span></p></div>
<ul class="word_main_list" id="word_list_1">
<li>
	<div class="word_main_list_w"><span title="illegal">illegal</span></div>
	<div class="word_main_list_y"><strong>[iˈli:ɡəl]</strong><a id="https://res.iciba.com/a.mp3" class="icon_s"></a></div>
	<div class="word_main_list_s"><span title="adj. 不合法的，非法的">adj. 不合法的，非法的</span></div>
</li>
<li>
	<div class="word_main_list_w"><span title="self">self</span></div>
	<div class="word_main_list_y"><strong>[self]</strong></div>
	<div class="word_main_list_s"><span title="n. 自我，自己">n. 自我，自己</span></div>
</li>
</ul>
</body></html>`

	page, err := ParseIcibaWordPageHTML(strings.NewReader(snippet), "https://word.iciba.com/?action=words&class=11&course=3", 11, 3)
	if err != nil {
		t.Fatal(err)
	}
	if page.LessonTitle != "四级必备词汇 第3课" {
		t.Fatalf("LessonTitle = %q", page.LessonTitle)
	}
	if len(page.Words) != 2 {
		t.Fatalf("len(Words) = %d", len(page.Words))
	}
	w0 := page.Words[0]
	if w0.Word != "illegal" || w0.Phonetic != "[iˈli:ɡəl]" || w0.AudioURL != "https://res.iciba.com/a.mp3" {
		t.Fatalf("words[0] = %+v", w0)
	}
	if w0.PartOfSpeech != "adj." || w0.GlossZH != "不合法的，非法的" {
		t.Fatalf("words[0] pos/gloss = %q / %q", w0.PartOfSpeech, w0.GlossZH)
	}
	if page.Words[1].Word != "self" || page.Words[1].PartOfSpeech != "n." {
		t.Fatalf("words[1] = %+v", page.Words[1])
	}
}
