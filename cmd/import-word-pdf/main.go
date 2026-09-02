// Command import-word-pdf extracts vocabulary from scanned wordbook PDFs via vision LLM.
//
// Usage (from repo root, LLM_* env or config loaded):
//
//	go run ./cmd/import-word-pdf -pdf "PET核心单词.pdf" -out pet-words.json -max-pages 3
//
// Requires: python3 + pymupdf (pip install pymupdf)
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/CloudStepsGo/pkg/llm"
	"github.com/LingByte/CloudStepsGo/pkg/wordimport"
)

func main() {
	pdf := flag.String("pdf", "", "path to PDF")
	out := flag.String("out", "words.json", "output JSON path")
	tmpDir := flag.String("tmpdir", "", "temp dir for page images (default os.MkdirTemp)")
	maxPages := flag.Int("max-pages", 0, "max pages to process (0=all)")
	startPage := flag.Int("start-page", 1, "1-based start page")
	scale := flag.Float64("scale", 0.5, "PDF render scale")
	pagesDir := flag.String("pages-dir", "", "skip PDF render, load existing page-*.jpg dir")
	model := flag.String("model", "", "vision model override (default LLM_VISION_MODEL or LLM_MODEL)")
	flag.Parse()

	if *pdf == "" && *pagesDir == "" {
		fmt.Fprintln(os.Stderr, "provide -pdf or -pages-dir")
		os.Exit(1)
	}

	if _, err := configs.Load("configs/config.yaml"); err != nil {
		fmt.Fprintf(os.Stderr, "config load warning: %v (use LLM_* env)\n", err)
	}

	cfg := llm.VisionFromGlobal()
	if m := strings.TrimSpace(*model); m != "" {
		cfg.Model = m
	}
	if cfg.APIKey == "" {
		fmt.Fprintln(os.Stderr, "LLM not configured: set LLM_API_KEY / LLM_BASE_URL / LLM_MODEL")
		os.Exit(1)
	}

	var pages []wordimport.PageImage
	var err error
	if *pagesDir != "" {
		pages, err = wordimport.LoadPageImagesFromDir(*pagesDir)
	} else {
		dir := *tmpDir
		if dir == "" {
			dir, err = os.MkdirTemp("", "wordimport-*")
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			defer os.RemoveAll(dir)
		}
		fmt.Fprintf(os.Stderr, "rendering PDF pages to %s ...\n", dir)
		pages, err = wordimport.RenderPDFPages(*pdf, dir, *maxPages, *startPage, *scale)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Fprintf(os.Stderr, "loaded %d page image(s), calling vision model %s ...\n", len(pages), cfg.Model)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	words, err := wordimport.ExtractFromPages(ctx, pages, wordimport.Options{
		LLM:       cfg,
		MaxPages:  *maxPages,
		StartPage: *startPage,
		OnProgress: func(done, total, page int) {
			if page > 0 {
				fmt.Fprintf(os.Stderr, "  OCR page %d (%d/%d)\n", page, done+1, total)
			}
		},
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	payload := map[string]any{
		"source":    filepath.Base(*pdf),
		"pageCount": len(pages),
		"total":     len(words),
		"words":     words,
	}
	raw, _ := json.MarshalIndent(payload, "", "  ")
	if err := os.WriteFile(*out, raw, 0o644); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Fprintf(os.Stderr, "wrote %d words to %s\n", len(words), *out)
}
