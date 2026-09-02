package wordimport

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

type extractScriptResult struct {
	Pages []struct {
		Page int    `json:"page"`
		File string `json:"file"`
	} `json:"pages"`
	Total int `json:"total"`
}

// RenderPDFPages shells out to scripts/wordimport/extract_pdf_pages.py (requires Python + pymupdf).
func RenderPDFPages(pdfPath, outDir string, maxPages, startPage int, scale float64) ([]PageImage, error) {
	script := filepath.Join("scripts", "wordimport", "extract_pdf_pages.py")
	if _, err := os.Stat(script); err != nil {
		return nil, fmt.Errorf("missing %s (run from repo root): %w", script, err)
	}
	if scale <= 0 {
		scale = 0.5
	}
	args := []string{script, pdfPath, outDir, "--scale", fmt.Sprintf("%g", scale), "--start-page", strconv.Itoa(startPage)}
	if maxPages > 0 {
		args = append(args, "--max-pages", strconv.Itoa(maxPages))
	}
	cmd := exec.Command(resolvePython3(), args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("extract_pdf_pages.py: %w\n%s", err, strings.TrimSpace(string(out)))
	}
	var res extractScriptResult
	if err := json.Unmarshal(out, &res); err != nil {
		return nil, fmt.Errorf("parse extract script output: %w", err)
	}
	pages := make([]PageImage, 0, len(res.Pages))
	for _, p := range res.Pages {
		data, err := os.ReadFile(filepath.Join(outDir, p.File))
		if err != nil {
			return nil, err
		}
		pages = append(pages, PageImage{Page: p.Page, Data: data, MIME: "image/jpeg"})
	}
	return pages, nil
}

// resolvePython3 prefers scripts/wordimport/.venv when present (pymupdf).
func resolvePython3() string {
	venv := filepath.Join("scripts", "wordimport", ".venv", "bin", "python3")
	if st, err := os.Stat(venv); err == nil && !st.IsDir() {
		return venv
	}
	return "python3"
}

// LoadPageImagesFromDir reads page-*.jpg produced by the extract script.
func LoadPageImagesFromDir(dir string) ([]PageImage, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var pages []PageImage
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), "page-") {
			continue
		}
		var pageNo int
		_, err := fmt.Sscanf(e.Name(), "page-%d.jpg", &pageNo)
		if err != nil {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, err
		}
		pages = append(pages, PageImage{Page: pageNo, Data: data, MIME: "image/jpeg"})
	}
	if len(pages) == 0 {
		return nil, fmt.Errorf("no page-*.jpg in %s", dir)
	}
	sort.Slice(pages, func(i, j int) bool { return pages[i].Page < pages[j].Page })
	return pages, nil
}
