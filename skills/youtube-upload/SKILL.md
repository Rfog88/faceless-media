---
schema: agentcompanies/v1
kind: skill
name: youtube-upload
description: Upload mp4 to YouTube via Data API v3 with HARD-CODED AI-disclosure flag (altered_synthetic_content=true). Per-channel OAuth routing. Refuses upload if copyright_preflight_pass != true.
metadata:
  requires_env:
    - YOUTUBE_OAUTH_REFRESH_TOKEN__<channel>   # per-channel suffix; resolved at call time
    - YOUTUBE_OAUTH_CLIENT_ID                   # shared OAuth app
    - YOUTUBE_OAUTH_CLIENT_SECRET               # shared OAuth app
    - FACELESS_MEDIA_DB_PATH
    - NODE_OPTIONS                              # --experimental-sqlite
  implementation: skills/youtube-upload/run.mjs
  primary_users: [publisher]
  storage: sqlite (reads `videos`, writes `uploads`)
  status: stub-needs-oauth-and-api
---

# youtube-upload

The compliance-layer skill. Uploads a finished mp4 to a specific YouTube channel under that channel's OAuth identity. **Hard-codes the AI-disclosure flag.** Verifies the flag was set in the upload response. Halts with Tier-2 escalation if the flag cannot be verified.

Per 2026 YT enforcement (Feb 2026: 16 channels with 4.7B cumulative views terminated for AI slop), undisclosed synthetic content = channel-killer. This skill exists to make disclosure non-negotiable at the code level, not just policy level.

## When to use

- Called by Publisher agent on Issues in `ready_to_publish` status during the daily upload window.
- Manual `Run now` STRICTLY FORBIDDEN — every upload should flow through the gate or graduated channel path.

## When NOT to use

- For test uploads — there is no test mode. If you upload, it's public.
- For non-disclosed content — there is no path to that here. By design.

## Inputs

```json
{
  "channel": "english-learning",
  "video_issue_url": "<issue-url>",
  "mp4_path": "/path/to/video.mp4",
  "thumbnail_path": "/path/to/selected_thumb.png",
  "title": "...",
  "description_base": "...",          // baseline; disclosure boilerplate appended automatically
  "tags": ["...", "..."],
  "category_id": 27,                  // YT category; 27=Education default for english-learning, 25=News for finance-skeptic
  "scheduled_publish_at": null        // ISO timestamp or null for immediate
}
```

## Hard validations (refuse if any fail)

1. `videos.copyright_preflight_pass === 1` in SQLite — refuse + Tier-2 escalate `human-review-required` if false.
2. mp4_path file exists on disk — refuse + Tier-1 escalate if missing.
3. thumbnail_path file exists — refuse + Tier-1 escalate if missing.
4. `YOUTUBE_OAUTH_REFRESH_TOKEN__<channel>` env var present — refuse + Tier-2 `api-key-missing` if absent.
5. After upload: verify response includes `altered_synthetic_content: true`. If not — STOP, do NOT retry, escalate Tier-2 `human-review-required`. This is the channel-killer scenario.

## Process

1. Run all hard validations.
2. Refresh OAuth access token using channel's refresh_token + shared client_id + client_secret.
3. Compose final description: `description_base` + 2 line breaks + baseline disclosure boilerplate from `shared/disclosure-template.md` + 2 line breaks + channel-specific disclosure addition from `shared/channels/<slug>/brand.md` section 10/12.
4. Call YT Data API `videos.insert` (resumable upload):
   - snippet: title, description, tags, categoryId
   - status: privacyStatus (private if scheduled / public if immediate), publishAt (if scheduled), selfDeclaredMadeForKids: false, **altered_synthetic_content: true**
5. Upload thumbnail via `thumbnails.set`.
6. Verify response payload includes `altered_synthetic_content: true`. If missing or false → STOP + Tier-2 escalate.
7. Log to `uploads` SQLite table: yt_video_id, channel, format, published_at, disclosure_set=1, copyright_preflight_pass=1.
8. Return success with yt_video_id and YT URL.

## Outputs

On success:
```json
{
  "channel": "english-learning",
  "video_issue_url": "...",
  "yt_video_id": "abc123XYZ",
  "yt_url": "https://www.youtube.com/watch?v=abc123XYZ",
  "published_at": "2026-05-25T18:00:00Z",
  "disclosure_set": true,
  "copyright_preflight_pass": true
}
```

On disclosure-flag-verification failure:
```json
{
  "error": "human-review-required",
  "channel": "...",
  "video_issue_url": "...",
  "reason": "altered_synthetic_content flag not confirmed in response",
  "yt_video_id_pending": "..."         // may or may not exist depending on point of failure
}
```

## Implementation status

Stub for Phase 1: OAuth refresh + YT Data API upload calls are stubbed. Disclosure-boilerplate composition + hard-validation logic + SQLite writes ARE LIVE. The stub returns a fake yt_video_id and confirms `altered_synthetic_content: true` so downstream pipeline (analytics-pull, ab-thumbnail-test) can test against a known yt_video_id.

When the real API is wired, the disclosure-flag verification step is the most important code path in the entire company.
