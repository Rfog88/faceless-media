---
schema: agentcompanies/v1
kind: skill
name: analytics-pull
description: Pull YT Analytics for a published video at a specific snapshot window (24h, 48h, 72h, 7d, 30d). Writes to `performance` SQLite table.
metadata:
  requires_env:
    - YOUTUBE_OAUTH_REFRESH_TOKEN__<channel>   # per-channel; needs yt-analytics.readonly + yt-analytics-monetary.readonly scopes
    - YOUTUBE_OAUTH_CLIENT_ID
    - YOUTUBE_OAUTH_CLIENT_SECRET
    - FACELESS_MEDIA_DB_PATH
    - NODE_OPTIONS                              # --experimental-sqlite
  implementation: skills/analytics-pull/run.mjs
  primary_users: [analytics-lead]
  storage: sqlite (writes `performance`)
  status: stub-needs-yt-analytics-oauth
---

# analytics-pull

Pulls a snapshot of a video's performance metrics at a specific window post-publish. Used by Analytics Lead to write 24h/48h/72h/7d/30d snapshots to the `performance` table, which feeds the lessons.md flywheel.

## When to use

- Called by Analytics Lead daily via `analytics-rollup` routine.
- For each video due for a snapshot (based on published_at vs current time), one call per (video, window).

## When NOT to use

- For real-time YouTube Studio metrics — those are not available via API; YT Analytics has a 24-48h lag.
- For revenue forecasting — out of scope; we report, don't predict.

## Inputs

```json
{
  "channel": "english-learning",
  "yt_video_id": "abc123XYZ",
  "snapshot_window": "72h"           // "24h" | "48h" | "72h" | "7d" | "30d"
}
```

## Metrics pulled

- views (total)
- impressions (thumbnail impressions count)
- ctr (impressions → clicks ratio)
- avg_view_duration (seconds)
- avg_view_percentage (retention)
- estimatedRevenue (USD, monetized channels only)
- subs_delta (gained - lost) over the window

## Process

1. Refresh OAuth token (yt-analytics scopes).
2. Call YT Analytics API `reports.query` with the right dimensions + metrics for the window.
3. Compute RPM = (estimatedRevenue / views) * 1000.
4. Write to `performance` table: yt_video_id, channel, snapshot_at (now), snapshot_window, ctr, retention_avg (= avg_view_percentage), rpm, views, subs_delta.

## Outputs

```json
{
  "channel": "english-learning",
  "yt_video_id": "abc123XYZ",
  "snapshot_window": "72h",
  "metrics": {
    "views": 2451,
    "impressions": 38400,
    "ctr": 0.064,
    "avg_view_duration_s": 412,
    "avg_view_percentage": 0.52,
    "rpm": 8.2,
    "subs_delta": 23
  }
}
```

## Implementation status

Stub for Phase 1: YT Analytics API call stubbed. SQLite writes + RPM computation ARE LIVE. Stub returns synthetic metrics in a realistic range so downstream lessons.md curation can be tested.
