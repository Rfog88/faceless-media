---
schema: agentcompanies/v1
kind: skill
name: thumbnail-generate
description: Generate 3-4 thumbnail variants per video. AI image gen base + text overlay per channel brand.md thumbnail style.
metadata:
  requires_env:
    - OPENAI_API_KEY              # optional; codex_local adapter preferred
    - FACELESS_MEDIA_DB_PATH
    - THUMBNAIL_OUTPUT_DIR        # optional; default /home/paperclip/faceless-media/thumbnails
    - NODE_OPTIONS                # --experimental-sqlite
  implementation: skills/thumbnail-generate/run.mjs
  primary_users: [producer]
  storage: sqlite (writes `videos.thumbnail_variants_json`)
  status: stub-needs-image-gen-adapter
---

# thumbnail-generate

Generates 3-4 thumbnail variants per video. Each variant explores a different composition strategy (face/no-face, object-focal, text-heavy, contrast variation) so Head of Content has real choice rather than near-identical options.

## When to use

- Called by Producer for every video in `production` status, after `video-assemble` completes.
- Manual `Run now` for brand-style calibration during build.

## When NOT to use

- For thumbnail selection — that's Head of Content's call.
- For thumbnail CTR scoring — that's `thumbnail-score`.

## Inputs

```json
{
  "channel": "finance-skeptic",
  "video_issue_url": "<issue-url>",
  "video_title": "...",
  "hook_phrase": "...",                   // optional; used as overlay text seed
  "variant_count": 4                      // optional; default 4
}
```

## Process

1. Load `shared/channels/<slug>/brand.md` thumbnail style section — color palette, text density rules, face vs no-face policy, brand motifs.
2. For each variant: construct image-gen prompt mixing brand style + video topic + a distinct composition strategy (variant 1: face-focal, 2: object-focal, 3: text-dominant, 4: high-contrast minimalist).
3. Call image-gen adapter (codex_local preferred, OPENAI_API_KEY fallback).
4. Apply text overlay per brand style (font, color, position, max words).
5. Save PNG variants to disk.
6. Update `videos.thumbnail_variants_json` with the array of variant paths + composition strategy + base prompt.

## Outputs

```json
{
  "channel": "finance-skeptic",
  "video_issue_url": "...",
  "variants": [
    { "image_path": "...", "strategy": "face-focal", "overlay_text": "..." },
    { "image_path": "...", "strategy": "object-focal", "overlay_text": "..." },
    { "image_path": "...", "strategy": "text-dominant", "overlay_text": "..." },
    { "image_path": "...", "strategy": "high-contrast-minimalist", "overlay_text": "..." }
  ]
}
```

## Implementation status

Stub for Phase 1: image gen call + text overlay rendering stubbed. Variant strategy logic + brand-style prompt construction ARE LIVE. Stub writes placeholder PNG files so downstream skills (thumbnail-score, board-approval-request) can reference paths.
