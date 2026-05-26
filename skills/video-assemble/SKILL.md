---
schema: agentcompanies/v1
kind: skill
name: video-assemble
description: ffmpeg pipeline that composes voiceover + B-roll + music into long-form mp4 + 2-3 derived Shorts. Every asset gets license_id logged to `asset_uses`.
metadata:
  requires_env:
    - STORYBLOCKS_API_KEY
    - EPIDEMIC_SOUND_API_KEY
    - FACELESS_MEDIA_DB_PATH
    - VIDEO_OUTPUT_DIR              # optional; default /home/paperclip/faceless-media/videos
    - ASSET_CACHE_DIR               # optional; default /home/paperclip/faceless-media/asset-cache
    - NODE_OPTIONS                  # --experimental-sqlite
  implementation: skills/video-assemble/run.mjs
  primary_users: [producer]
  storage: sqlite (reads `scripts`, writes `videos` + `asset_uses`)
  status: stub-needs-ffmpeg-and-asset-apis
---

# video-assemble

Composes a finished mp4 (long-form + 2-3 Shorts) from voiceover MP3 + Storyblocks B-roll + Epidemic Sound music. Every asset is logged to `asset_uses` with its license_id — `copyright-preflight` will refuse to advance if any asset is unlicensed.

## When to use

- Called by Producer after `voiceover-elevenlabs` returns an MP3.
- Manual `Run now` only for ffmpeg/style calibration testing.

## When NOT to use

- For thumbnail generation — that's `thumbnail-generate`.
- For video editing of an existing mp4 — out of scope; we generate, not edit.

## Inputs

```json
{
  "channel": "english-learning",
  "script_id": 42,
  "voiceover_mp3_path": "/home/paperclip/faceless-media/voiceovers/english-learning/YT-42_long.mp3",
  "video_issue_url": "<issue-url>"
}
```

## Process

1. Load script + brand.md visual style (thumbnail/brand motifs section gives the aesthetic).
2. Parse script for scene-beat markers (`[HOOK]`, `[SETUP]`, `[BODY]`, etc.). Each beat = a scene needing B-roll.
3. For each scene: query Storyblocks API for B-roll matching scene keyword (cached locally for 30d). Log license_id to `asset_uses`.
4. Pick music track from Epidemic Sound matching brand mood (cached locally). Log license_id to `asset_uses`.
5. Construct ffmpeg command: voiceover audio + B-roll video stack + background music (ducked under voiceover) + brand-tinted transitions.
6. Render long-form mp4 (1080p, H.264, AAC audio).
7. For each Short in the script: identify the source moment in long-form, extract a 9:16 segment with hook overlay text. Render Shorts mp4s.
8. Write to `videos` table: mp4_path, format (long|short), voice_id_used, brand_style_applied.

## Outputs

```json
{
  "channel": "english-learning",
  "video_issue_url": "...",
  "long_form": {
    "mp4_path": "/home/paperclip/faceless-media/videos/english-learning/YT-42_long.mp4",
    "duration_s": 1240,
    "assets_used": 18
  },
  "shorts": [
    { "mp4_path": "...", "duration_s": 45, "source_offset_s": 122 },
    { "mp4_path": "...", "duration_s": 38, "source_offset_s": 408 }
  ],
  "license_ids_logged": 21
}
```

## Implementation status

Stub for Phase 1: ffmpeg command + Storyblocks + Epidemic Sound API calls all stubbed. The asset-logging logic to `asset_uses` table IS LIVE — copyright pre-flight will work correctly against the stub-mode data.
