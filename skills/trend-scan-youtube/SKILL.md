---
schema: agentcompanies/v1
kind: skill
name: trend-scan-youtube
description: Scan YT Data API for competitor uploads + views/hour spikes per channel's brand.md keyword seeds. Writes signals to `trends` SQLite table.
metadata:
  requires_env:
    - YOUTUBE_API_KEY__<channel>   # per-channel suffix; resolved at call time
    - FACELESS_MEDIA_DB_PATH
    - NODE_OPTIONS                  # --experimental-sqlite
  implementation: skills/trend-scan-youtube/run.mjs
  primary_users: [trend-analyst]
  storage: sqlite (writes `trends` table)
  status: blocked-until-yt-api-live
---

# trend-scan-youtube

Pulls competitor activity from the YouTube Data API per channel's keyword seeds. Computes views/hour deltas vs niche baseline to surface spike-worthy signals.

## When to use

- Twice-daily via Trend Analyst heartbeat (morning + evening scan windows).
- Manual `Run now` for ad-hoc investigation of a specific keyword.

## When NOT to use

- For trends scoring or packet construction — that's `viral-packet-build`.
- Production runs refuse stubbed YouTube results by default so synthetic rows cannot feed packet scoring. Use `ALLOW_STUB_TREND_SIGNALS=1` only for isolated local tests.
- For trend interpretation / brand-fit — that's Head of Content's call on the packet.

## Inputs

```json
{
  "channel": "english-learning",
  "keywords": ["english idiom", "esl vocabulary"]   // optional; defaults to channel brand.md keyword seeds
}
```

## Outputs

```json
{
  "channel": "english-learning",
  "signals_added": 12,
  "per_keyword": {
    "english idiom": { "videos_scanned": 8, "spikes_detected": 2 },
    "esl vocabulary": { "videos_scanned": 5, "spikes_detected": 1 }
  },
  "quota_units_used": 800
}
```

## Quota cost (YT Data API)

- `search.list` = 100 units each. Default: 5 keyword scans per heartbeat = 500 units/heartbeat.
- `videos.list` = 1 unit per video. ~20 videos per heartbeat = 20 units.
- 2 heartbeats/day × ~520 units = ~1040 units/day per channel. Comfortably under 10K/day default.

## Implementation status

Stub for Phase 1: actual YT Data API HTTP calls require `YOUTUBE_API_KEY__<channel>` (per-channel suffix) set in Paperclip secrets. Currently the script writes a structured trace of what it WOULD scan + writes synthetic signals to SQLite for downstream pipeline testing. Real API call wires in after channel-1 provisioning (build step 13).
