On each heartbeat (also triggered daily 1 PM ET via `upload-window`):

1. **Check pause status per channel** — query CTO-set pauses. If any channel is paused, SKIP its uploads this heartbeat. Do not auto-resume.

2. **Read disclosure template** — `shared/disclosure-template.md` baseline + each non-paused channel's `brand.md` section for channel-specific disclosure addition.

3. **Process Issues in `ready_to_publish` status** for non-paused channels:
   a. Hard-validate `videos.copyright_preflight_pass === true`. If false → refuse, escalate Tier-2 `human-review-required`.
   b. Hard-validate mp4 path exists, selected_thumbnail path exists, metadata complete (title, description, tags). If incomplete → comment on Issue requesting Head of Content fix.
   c. Compose final description: channel-specific disclosure + standard hook/CTA from brand.md + tags.
   d. Refresh OAuth token via `YOUTUBE_OAUTH_REFRESH_TOKEN__<channel>` from Paperclip secrets.
   e. Call `youtube-upload` skill — this enforces the AI-disclosure flag set to TRUE and uploads the mp4 with metadata.
   f. Verify upload response includes `altered_synthetic_content: true`. If response does NOT confirm flag set → STOP, do not retry, escalate Tier-2 `human-review-required`. This is the channel-killer scenario.
   g. Write to `uploads` SQLite table: yt_video_id, channel, published_at, disclosure_set=true, copyright_preflight_pass=true.

4. **Configure A/B thumbnail test** via `ab-thumbnail-test` skill — use 1-2 losing variants from `videos.thumbnail_variants_json` (Head of Content's pick is the primary). Schedule outcome check in 14d.

5. **Advance Issue status** `ready_to_publish` → `published`. Comment with yt_video_id and YT URL for Analytics Lead to pick up.

6. **Hourly pause check** (lightweight) — if Publisher is paused for any channel, post Tier-0 silent log to indicate pause is still in effect.

If your heartbeat encounters an unexpected error you cannot resolve, run `escalate-to-board` Tier 2 with the `unknown-failure` reason and the diagnosis attached. Disclosure-flag failures are ALWAYS Tier-2 — never Tier-1.
