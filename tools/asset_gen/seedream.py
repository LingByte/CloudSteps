#!/usr/bin/env python3
"""Volcengine Ark Seedream image client (mirrors SoulNexus pkg/mediagen/seedream.go)."""

from __future__ import annotations

import base64
import math
import mimetypes
import os
from pathlib import Path

import requests

from seedance import _load_dotenv, api_key  # noqa: F401 — load .env via seedance

_load_dotenv()

DEFAULT_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations"
DEFAULT_MODEL = "doubao-seedream-5-0-260128"
MIN_PIXELS = 3_686_400


class SeedreamError(RuntimeError):
	pass


def _env(name: str, default: str = "") -> str:
	return (os.environ.get(name) or default).strip()


def api_url() -> str:
	return _env("SEEDREAM_API_URL", DEFAULT_URL)


def model_id() -> str:
	return _env("SEEDREAM_MODEL_ID", DEFAULT_MODEL)


def resolve_size(width: int, height: int) -> str:
	w = width if width > 0 else 1024
	h = height if height > 0 else 1024
	pixels = w * h
	if pixels >= MIN_PIXELS:
		return f"{w}x{h}"
	scale = math.sqrt(MIN_PIXELS / float(pixels))
	return f"{max(1, int(round(w * scale)))}x{max(1, int(round(h * scale)))}"


def image_to_data_uri(path: Path) -> str:
	data = path.read_bytes()
	ct, _ = mimetypes.guess_type(str(path))
	if not ct or not ct.startswith("image/"):
		ct = "image/png"
	return f"data:{ct};base64," + base64.standard_b64encode(data).decode("ascii")


def generate(
	prompt: str,
	*,
	width: int = 1024,
	height: int = 1024,
	image: Path | None = None,
	watermark: bool = False,
	timeout_s: float = 180.0,
) -> bytes:
	"""Return PNG bytes (downloads result URL)."""
	prompt = (prompt or "").strip()
	if not prompt:
		raise SeedreamError("Empty prompt")
	body = {
		"model": model_id(),
		"prompt": prompt,
		"size": resolve_size(width, height),
		"sequential_image_generation": "disabled",
		"response_format": "url",
		"output_format": "png",
		"watermark": bool(watermark),
	}
	if image is not None:
		p = Path(image)
		if not p.is_file():
			raise SeedreamError(f"Reference image not found: {p}")
		body["image"] = image_to_data_uri(p)

	resp = requests.post(
		api_url(),
		headers={
			"Authorization": f"Bearer {api_key()}",
			"Content-Type": "application/json",
		},
		json=body,
		timeout=timeout_s,
	)
	raw = resp.content
	if resp.status_code < 200 or resp.status_code >= 300:
		raise SeedreamError(f"Seedream HTTP {resp.status_code}: {raw[:300]!r}")
	parsed = resp.json()
	if parsed.get("error"):
		raise SeedreamError(str(parsed["error"]))
	data = parsed.get("data") or []
	if not data or not str(data[0].get("url") or "").strip():
		raise SeedreamError("Seedream returned no image URL")
	url = str(data[0]["url"]).strip()
	dl = requests.get(url, timeout=120)
	dl.raise_for_status()
	return dl.content
