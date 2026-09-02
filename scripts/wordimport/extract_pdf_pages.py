#!/usr/bin/env python3
"""Render PDF pages to JPEG files for wordimport (requires pymupdf).

Usage:
  python3 extract_pdf_pages.py <pdf_path> <output_dir> [--max-pages N] [--scale 0.5] [--start-page 1]

Prints JSON to stdout: {"pages": [{"page": 1, "file": "page-0001.jpg"}, ...]}
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import pymupdf
except ImportError:
    print("error: install pymupdf (pip install pymupdf)", file=sys.stderr)
    sys.exit(2)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path")
    parser.add_argument("output_dir")
    parser.add_argument("--max-pages", type=int, default=0)
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--scale", type=float, default=0.5, help="render scale (0.5 ≈ half resolution)")
    args = parser.parse_args()

    pdf_path = Path(args.pdf_path)
    out_dir = Path(args.output_dir)
    if not pdf_path.is_file():
        print(f"error: PDF not found: {pdf_path}", file=sys.stderr)
        return 1
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = pymupdf.open(pdf_path)
    mat = pymupdf.Matrix(args.scale, args.scale)
    pages_out = []
    count = 0
    for i in range(doc.page_count):
        page_no = i + 1
        if page_no < args.start_page:
            continue
        if args.max_pages > 0 and count >= args.max_pages:
            break
        pix = doc[i].get_pixmap(matrix=mat, alpha=False)
        fname = f"page-{page_no:04d}.jpg"
        fpath = out_dir / fname
        pix.save(str(fpath))
        pages_out.append({"page": page_no, "file": fname})
        count += 1

    print(json.dumps({"pages": pages_out, "total": len(pages_out)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
