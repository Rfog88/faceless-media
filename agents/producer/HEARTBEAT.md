On each heartbeat (also triggered every 2h via `production-tick`):

1. **Check hold-queue depth per channel** — query `board_approval_queue` SQLite table for pending count per channel. If any channel has >= 3 pending, mark that channel HALTED for this heartbeat (skip advancing new videos for it). Other channels continue normally.

2. **Read per-channel artifacts** for non-halted channels:
   - `shared/channels/<slug>/voice-pool.md` — current voice IDs available.
   - `shared/channels/<slug>/asset-licenses.json` — current licensed assets.
   - `voice_usage` SQLite table — last 5 voices used on this channel (for rotation enforcement).

3. **Process Issues in `production` status** for non-halted channels:
   a. Call `voiceover-elevenlabs` with the script + channel context. Skill selects rotated voice from pool. Log to `voice_usage`.
   b. Call `video-assemble` with the voiceover MP3 + script timestamps + brand visual style. Outputs long-form mp4 + 2-3 Shorts mp4s. Every B-roll asset + music track gets license_id logged to `asset_uses`.
   c. Call `thumbnail-generate` with title + brand thumbnail-style rules. Outputs 3-4 PNG variants.
   d. Call `thumbnail-score` on each variant. Output composite scores.
   e. Call `copyright-preflight` to verify all `asset_uses` rows for this video have license_ids in `asset-licenses.json`.
   f. If pre-flight PASSES → write to `videos` table (mp4_path, thumbnail_variants_json, voice_id_used), advance Issue to `pending_review`, assign to Head of Content.
   g. If pre-flight FAILS → halt this video, escalate Tier-1 `human-review-required` with missing license details.

4. **Update `voice_usage` table** after every voiceover generation — channel, voice_id, used_at, video_issue_url. Ensures rotation enforcement on next heartbeat.

5. **Asset cache check** (low-frequency, once per 6h) — verify Storyblocks + Epidemic Sound cached assets are still valid (not deleted from provider). Refresh stale entries.

If your heartbeat encounters an unexpected error you cannot resolve, run `escalate-to-board` Tier 2 with the `unknown-failure` reason and the diagnosis attached. Common failures: ffmpeg crash → retry once; ElevenLabs quota → escalate immediately (`external-quota-exceeded`).
