# CloudSteps asset generation

Default image backend: **gpt-image-2** via 4sapi.

All outputs go under **`materials/ai_gen/img/`**.

## Setup

```bash
cd tools/asset_gen
python3 -m venv .venv
source .venv/bin/activate
pip install requests pillow
cp .env.example .env   # fill FOURSAPI_API_KEY
```

## Generate

```bash
set -a && source tools/asset_gen/.env && set +a
python3 tools/asset_gen/gen_image.py \
  --prompt "云阶分享海报背景，薄荷绿玻璃质感，预留二维码空白区" \
  -o invite_bg.png
```

Image-to-image:

```bash
python3 tools/asset_gen/gen_image.py \
  --image materials/ai_gen/img/cloudsteps-invite-poster-bg.png \
  --prompt "同一构图，略微调色到更偏薄荷绿" \
  -o invite_bg_v2.png
```

Agent skill: `.cursor/skills/asset-gen/SKILL.md`.
