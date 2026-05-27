---
schema: agentcompanies/v1
kind: skill
name: trend-scan-reddit
description: Scan per-channel subreddit list for emerging topics + comment-velocity signals. Uses official Reddit API (OAuth client_credentials).
metadata:
  requires_env:
    - REDDIT_CLIENT_ID
    - REDDIT_CLIENT_SECRET
    - FACELESS_MEDIA_DB_PATH
    - NODE_OPTIONS                  # --experimental-sqlite
  implementation: skills/trend-scan-reddit/run.mjs
  primary_users: [trend-analyst]
  storage: sqlite (writes `trends` table)
  status: blocked-until-reddit-api-live
---

# trend-scan-reddit

Production runs refuse stubbed Reddit results by default so synthetic rows cannot feed packet scoring. Use `ALLOW_STUB_TREND_SIGNALS=1` only for isolated local tests.

Pulls activity from subreddits listed in each channel's `brand.md`. Surfaces emerging discussion topics and high-comment-velocity threads (high comments/upvote ratio = controversial = curiosity opportunity).

## When to use

- Twice-daily via Trend Analyst heartbeat.
- Especially valuable in evening scan window (afternoon Reddit cross-pollination from TikTok/Twitter).

## When NOT to use

- For brand-banned subreddits (e.g., crypto-pump subs for finance-skeptic). The skill respects channel brand.md subreddit lists.
- For Reddit-search across topics — that's outside the per-channel subreddit-list constraint.

## Inputs

```json
{
  "channel": "finance-skeptic",
  "subreddits": ["economics", "personalfinance"]   // optional; defaults to channel brand.md list
}
```

## Outputs

```json
{
  "channel": "finance-skeptic",
  "signals_added": 18,
  "per_subreddit": {
    "economics": { "posts_scanned": 25, "high_velocity_count": 4 },
    "personalfinance": { "posts_scanned": 25, "high_velocity_count": 2 }
  }
}
```

## Reddit API specifics

- Uses OAuth `client_credentials` flow (no user account needed for read-only).
- Endpoints: `/r/<sub>/new.json?limit=25`, `/r/<sub>/hot.json?limit=25`.
- Rate limit: 60 requests/min for OAuth apps. With 2 subreddits × 2 endpoints × 2 heartbeats = 8 req per channel per day. Comfortably under limit.

## Implementation status

Stub for Phase 1: OAuth token fetch is stubbed pending REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET being provisioned. SQLite writes ARE active with synthetic signals so downstream pipeline can test.
