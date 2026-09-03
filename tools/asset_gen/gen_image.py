#!/usr/bin/env python3
"""CloudSteps image generator — gpt-image-2 (4sapi) / Gemini / Grok.

Outputs under materials/ai_gen/img/. Stdout: JSON. Progress: stderr.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import time
from pathlib import Path

import requests
from PIL import Image

TOOLS_DIR = Path(__file__).resolve().parent
REPO_ROOT = TOOLS_DIR.parent.parent
MATERIALS_ROOT = REPO_ROOT / "materials" / "ai_gen"

GPT_IMAGE_MODEL = "gpt-image-2"
GPT_IMAGE_COST = 8
GPT_IMAGE_SIZES = ["auto", "1024x1024", "1024x1536", "1536x1024", "1K", "2K", "4K"]
SIZE_ALIASES = {
    "1K": "1024x1024",
    "2K": "2048x2048",
    "4K": "4096x4096",
}

GEMINI_MODEL = "gemini-3.1-flash-image-preview"
GEMINI_SIZES = ["512", "1K", "2K", "4K"]
GEMINI_COSTS = {"512": 5, "1K": 7, "2K": 10, "4K": 15}

GROK_MODEL = "grok-imagine-image"
GROK_COST = 2
GROK_SIZES = ["1K", "2K"]


def load_dotenv(path: Path | None = None) -> None:
    env_path = path or (TOOLS_DIR / ".env")
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        k, v = k.strip(), v.strip().strip("'").strip('"')
        if k and k not in os.environ:
            os.environ[k] = v


def result_json(ok: bool, **kwargs) -> None:
    print(json.dumps({"ok": ok, **kwargs}, ensure_ascii=False))


def resolve_material_path(output: str | None, kind: str, default_name: str) -> Path:
    root = MATERIALS_ROOT / kind
    root.mkdir(parents=True, exist_ok=True)
    if not output:
        return root / default_name
    p = Path(output)
    if p.is_absolute():
        if MATERIALS_ROOT not in p.resolve().parents and p.resolve().parent != MATERIALS_ROOT:
            result_json(False, error=f"Output must stay under {MATERIALS_ROOT}")
            sys.exit(1)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    out = root / p.name if p.parent == Path(".") else MATERIALS_ROOT / p
    out.parent.mkdir(parents=True, exist_ok=True)
    return out


def _mime_for_image(path: Path) -> str:
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(path.suffix.lower(), "image/png")


def _image_data_uri(image_path: Path) -> str:
    b64 = base64.b64encode(image_path.read_bytes()).decode()
    return f"data:{_mime_for_image(image_path)};base64,{b64}"


def _foursapi_base() -> str:
    return os.environ.get("FOURSAPI_BASE_URL", "https://4sapi.org").rstrip("/")


def _foursapi_key() -> str:
    key = (os.environ.get("FOURSAPI_API_KEY") or os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        result_json(False, error="Missing FOURSAPI_API_KEY (or OPENAI_API_KEY)")
        sys.exit(1)
    return key


def _normalize_gpt_size(size: str) -> str | None:
    if size in (None, "", "auto"):
        return None
    return SIZE_ALIASES.get(size, size)


def _save_openai_image_payload(data: dict, output: Path) -> None:
    items = data.get("data") or []
    if not items:
        raise RuntimeError(f"No image data in response: {json.dumps(data)[:500]}")
    item = items[0]
    if item.get("b64_json"):
        img = Image.open(io.BytesIO(base64.b64decode(item["b64_json"])))
        img.save(output, format="PNG")
        return
    if item.get("url"):
        r = requests.get(item["url"], timeout=120)
        r.raise_for_status()
        Image.open(io.BytesIO(r.content)).save(output, format="PNG")
        return
    raise RuntimeError(f"Image item missing b64_json/url: {item!r}")


def _generate_gpt_image(args, output: Path, cost: int) -> None:
    key = _foursapi_key()
    base = _foursapi_base()
    auth = key if key.lower().startswith("bearer ") else key
    size = _normalize_gpt_size(getattr(args, "size", "auto"))
    moderation = getattr(args, "moderation", None)

    try:
        if args.image:
            ref = Path(args.image)
            if not ref.exists():
                result_json(False, error=f"Reference image not found: {ref}")
                sys.exit(1)
            url = f"{base}/v1/images/edits"
            form = {
                "model": (None, GPT_IMAGE_MODEL),
                "prompt": (None, args.prompt),
                "n": (None, "1"),
            }
            if size:
                form["size"] = (None, size)
            files = {"image": (ref.name, ref.read_bytes(), _mime_for_image(ref))}
            print(f"  POST {url} (edits)", file=sys.stderr)
            resp = requests.post(
                url,
                headers={"Authorization": auth, "Accept": "application/json"},
                files={**files, **form},
                timeout=300,
            )
        else:
            url = f"{base}/v1/images/generations"
            payload: dict = {
                "model": GPT_IMAGE_MODEL,
                "prompt": args.prompt,
                "n": 1,
                "response_format": "b64_json",
            }
            if size:
                payload["size"] = size
            if moderation:
                payload["moderation"] = moderation
            print(f"  POST {url} (generations)", file=sys.stderr)
            resp = requests.post(
                url,
                headers={
                    "Authorization": auth,
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=300,
            )

        if resp.status_code >= 400:
            try:
                err = resp.json()
            except Exception:
                err = resp.text[:800]
            result_json(False, error=f"HTTP {resp.status_code}: {err}")
            sys.exit(1)

        _save_openai_image_payload(resp.json(), output)
    except SystemExit:
        raise
    except Exception as e:
        result_json(False, error=str(e))
        sys.exit(1)

    print(f"Saved: {output}", file=sys.stderr)
    result_json(True, path=str(output), cost_cents=cost)


def _generate_gemini(args, output: Path, cost: int) -> None:
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        result_json(False, error="google-genai not installed")
        sys.exit(1)

    config = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(image_size=args.size, aspect_ratio=args.aspect_ratio),
    )
    contents = []
    if args.image:
        ref = Path(args.image)
        if not ref.exists():
            result_json(False, error=f"Reference image not found: {ref}")
            sys.exit(1)
        contents.append(types.Part.from_bytes(data=ref.read_bytes(), mime_type=_mime_for_image(ref)))
    contents.append(args.prompt)
    response = genai.Client().models.generate_content(
        model=GEMINI_MODEL, contents=contents, config=config
    )
    if response.parts is None:
        result_json(False, error="Generation blocked")
        sys.exit(1)
    for part in response.parts:
        if part.inline_data is not None:
            Image.open(io.BytesIO(part.inline_data.data)).save(output, format="PNG")
            print(f"Saved: {output}", file=sys.stderr)
            result_json(True, path=str(output), cost_cents=cost)
            return
    result_json(False, error="No image returned")
    sys.exit(1)


def _generate_grok(args, output: Path, cost: int) -> None:
    try:
        import xai_sdk
    except ImportError:
        result_json(False, error="xai-sdk not installed")
        sys.exit(1)

    image_url = None
    if args.image:
        ref = Path(args.image)
        if not ref.exists():
            result_json(False, error=f"Reference image not found: {ref}")
            sys.exit(1)
        image_url = _image_data_uri(ref)

    try:
        resp = xai_sdk.Client().image.sample(
            prompt=args.prompt,
            model=GROK_MODEL,
            image_url=image_url,
            aspect_ratio=args.aspect_ratio,
            resolution=args.size.lower(),
        )
        Image.open(io.BytesIO(resp.image)).save(output, format="PNG")
    except Exception as e:
        result_json(False, error=str(e))
        sys.exit(1)
    print(f"Saved: {output}", file=sys.stderr)
    result_json(True, path=str(output), cost_cents=cost)


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="CloudSteps AI image generator")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("-o", "--output", default=None, help="filename under materials/ai_gen/img/")
    parser.add_argument("--image", default=None, help="reference image for edits")
    parser.add_argument("--model", default="gpt-image-2", choices=["gpt-image-2", "gemini", "grok"])
    parser.add_argument("--size", default="auto")
    parser.add_argument("--aspect-ratio", default="1:1")
    parser.add_argument("--moderation", default=None, choices=["low", "auto"])
    args = parser.parse_args()

    backend = args.model
    if backend == "gemini":
        if args.size not in GEMINI_SIZES:
            result_json(False, error=f"Gemini size must be one of {GEMINI_SIZES}")
            sys.exit(1)
        cost = GEMINI_COSTS[args.size]
    elif backend == "grok":
        if args.size not in GROK_SIZES:
            result_json(False, error=f"Grok size must be one of {GROK_SIZES}")
            sys.exit(1)
        cost = GROK_COST
    else:
        if args.size not in GPT_IMAGE_SIZES and args.size not in SIZE_ALIASES:
            result_json(False, error=f"gpt-image-2 size must be one of {GPT_IMAGE_SIZES}")
            sys.exit(1)
        cost = GPT_IMAGE_COST

    stamp = time.strftime("%Y%m%d_%H%M%S")
    output = resolve_material_path(args.output, "img", f"img_{stamp}.png")
    print(f"Generating image ({backend} {args.size})...", file=sys.stderr)

    if backend == "gemini":
        _generate_gemini(args, output, cost)
    elif backend == "grok":
        _generate_grok(args, output, cost)
    else:
        _generate_gpt_image(args, output, cost)


if __name__ == "__main__":
    main()
