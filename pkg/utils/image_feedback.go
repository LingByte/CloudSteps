package utils

import (
	"bytes"
	"fmt"
	"io"

	"github.com/LingByte/ling-base/common/imageutil"
)

const (
	// FeedbackImageMaxUploadBytes 反馈配图原始上传上限
	FeedbackImageMaxUploadBytes = 8 << 20 // 8MB
	// FeedbackImageMaxSidePx 任一边超过此像素则拒绝
	FeedbackImageMaxSidePx = 6000
	// FeedbackImageOutputSidePx 输出最长边（适合截图）
	FeedbackImageOutputSidePx = 1600
	// FeedbackImageJPEGQuality JPEG 质量
	FeedbackImageJPEGQuality = 82
)

// FeedbackImageResult 压缩后的反馈配图
type FeedbackImageResult struct {
	Data        []byte
	ContentType string
	Ext         string
	Width       int
	Height      int
}

// ProcessFeedbackImage 校验并压缩反馈配图（比头像更大边长，便于截图可读）。
func ProcessFeedbackImage(r io.Reader, declaredSize int64) (*FeedbackImageResult, error) {
	if declaredSize > FeedbackImageMaxUploadBytes {
		return nil, fmt.Errorf("图片过大，请选择不超过 %dMB 的图片", FeedbackImageMaxUploadBytes>>20)
	}

	limited := io.LimitReader(r, FeedbackImageMaxUploadBytes+1)
	raw, err := io.ReadAll(limited)
	if err != nil {
		return nil, fmt.Errorf("读取图片失败")
	}
	if int64(len(raw)) > FeedbackImageMaxUploadBytes {
		return nil, fmt.Errorf("图片过大，请选择不超过 %dMB 的图片", FeedbackImageMaxUploadBytes>>20)
	}
	if len(raw) == 0 {
		return nil, fmt.Errorf("空文件")
	}

	img, _, err := imageutil.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("无法解析图片，请上传 jpg/png/webp/gif")
	}

	w, h := imageutil.Dimensions(img)
	if w <= 0 || h <= 0 {
		return nil, fmt.Errorf("无效的图片尺寸")
	}
	if w > FeedbackImageMaxSidePx || h > FeedbackImageMaxSidePx {
		return nil, fmt.Errorf("图片尺寸过大（最长边不超过 %d 像素）", FeedbackImageMaxSidePx)
	}

	data, err := imageutil.OptimizeForWeb(img, FeedbackImageOutputSidePx, FeedbackImageJPEGQuality)
	if err != nil {
		return nil, fmt.Errorf("图片压缩失败")
	}

	out, _, err := imageutil.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("图片压缩失败")
	}
	ow, oh := imageutil.Dimensions(out)

	return &FeedbackImageResult{
		Data:        data,
		ContentType: "image/jpeg",
		Ext:         ".jpg",
		Width:       ow,
		Height:      oh,
	}, nil
}
