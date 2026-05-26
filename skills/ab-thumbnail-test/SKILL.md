---
schema: agentcompanies/v1
kind: skill
name: ab-thumbnail-test
description: Configure YT native A/B thumbnail rotation on a published video using losing variants from `thumbnail-generate`.
metadata:
  requires_env:
    - YOUTUBE_OAUTH_REFRESH_TOKEN__<channel>   # per-channel suffix
    - YOUTUBE_OAUTH_CLIENT_ID
    - YOUTUBE_OAUTH_CLIENT_SECRET
    - FACELESS_MEDIA_DB_PATH
    - NODE_OPTIONS                              # --experimental-sqlite
  implementation: skills/ab-thumbnail-test/run.mjs
  primary_users: [publisher]
  storage: sqlite (reads `videos`, writes `ab_tests`)
  status: stub-needs-yt-ab-api-or-fallback
---

# ab-thumbnail-test

Sets up A/B thumbnail rotation on a published video using the losing variants from `thumbnail-generate`. Schedules outcome check at 14 days (YT's native A/B test window).

YT's native A/B thumbnail testing requires channel eligibility (typically larger established channels). For pre-eligibility channels, this skill degrades gracefully — logs the intended test, no real rotation happens.

## When to use

- Called by Publisher immediately after `youtube-upload` succeeds.
- A/B is nice-to-have, not block-on-failure — upload should succeed even if A/B config fails.

## When NOT to use

- For thumbnail selection — that's Head of Content's call pre-publish.
- For thumbnail CTR scoring — that's `thumbnail-score`.

## Inputs

```json
{
  "channel": "english-learning",
  "yt_video_id": "abc123XYZ",
  "video_issue_url": "<issue-url>"
}
```

## Process

1. Load `videos.thumbnail_variants_json` for the source video.
2. Identify the selected variant (already set as the primary thumbnail via `youtube-upload`).
3. Pick up to 2 losing variants as A/B candidates.
4. Attempt YT native A/B test config:
   - Eligible channel → call YT Studio A/B API with variants
   - Ineligible channel → log intended test, skip actual rotation
5. Schedule outcome check 14 days out (a follow-up `analytics-pull` will fetch winning variant data).
6. Write to `ab_tests` SQLite table: yt_video_id, channel, variant_paths, started_at, scheduled_check_at.

## Outputs

On eligible channel:
```json
{
  "channel": "english-learning",
  "yt_video_id": "abc123XYZ",
  "ab_test_configured": true,
  "variants_tested": 2,
  "scheduled_check_at": "2026-06-08T13:00:00Z"
}
```

On ineligible channel (graceful degradation):
```json
{
  "channel": "english-learning",
  "yt_video_id": "abc123XYZ",
  "ab_test_configured": false,
  "reason": "channel_not_eligible_for_native_ab",
  "variants_logged": 2,
  "intended_test_recorded": true
}
```

## Implementation status

Stub for Phase 1: YT native A/B API call stubbed. SQLite logging + ineligibility-fallback path ARE LIVE.
