# Wordbook PDF import

Extract vocabulary from scanned/image PDF wordbooks (e.g. `PET核心单词.pdf`) using vision LLM.

## Setup

```bash
cd scripts/wordimport
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Configure multimodal model in `configs/config.yaml`:

```yaml
services:
  llm:
    visionModel: qwen-vl-max   # DashScope; or gpt-4o for OpenAI-compatible APIs
```

Or set `LLM_VISION_MODEL` when running the CLI.

## Extract

From repo root (with `LLM_API_KEY` / config loaded):

```bash
# Smoke test (3 content pages)
go run ./cmd/import-word-pdf \
  -pdf "PET核心单词.pdf" \
  -out pet-words.json \
  -start-page 10 \
  -max-pages 3 \
  -model qwen-vl-max

# Full book (~226 pages, slow & API cost)
go run ./cmd/import-word-pdf -pdf "PET核心单词.pdf" -out pet-words.json
```

Re-use rendered page images:

```bash
go run ./cmd/import-word-pdf -pages-dir /tmp/pet-pages -out pet-words.json
```

Output JSON matches `models.ParsedWord` and can be imported via admin **自定义词书** (`POST /api/admin/wordbooks/custom`).

## Library

`pkg/wordimport` exposes:

- `RenderPDFPages` — PDF → JPEG via PyMuPDF script
- `ExtractFromPages` / `ExtractWordsFromPage` — vision OCR per page
- `LoadPageImagesFromDir` — resume from cached renders

Illustrations on each card are not extracted in v1 (text fields only).
