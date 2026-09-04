package utils

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func TestProcessFeedbackImage_CompressesPNG(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 40, 30))
	for y := 0; y < 30; y++ {
		for x := 0; x < 40; x++ {
			img.Set(x, y, color.RGBA{R: 10, G: 20, B: 30, A: 255})
		}
	}
	var src bytes.Buffer
	if err := png.Encode(&src, img); err != nil {
		t.Fatal(err)
	}
	out, err := ProcessFeedbackImage(&src, int64(src.Len()))
	if err != nil {
		t.Fatal(err)
	}
	if out.Ext != ".jpg" || out.Width <= 0 || out.Height <= 0 || len(out.Data) == 0 {
		t.Fatalf("unexpected result %+v len=%d", out, len(out.Data))
	}
}
