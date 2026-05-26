---
schema: agentcompanies/v1
kind: skill
name: trend-scan-trends
description: Scan Google Trends for rising queries per channel's keyword seeds. Uses unofficial Trends endpoint (no key, rate-limited).
metadata:
  requires_env:
    - FACELESS_MEDIA_DB_PATH
    - NODE_OPTIONS                  # --experimental-sqlite
  implementation: skills/trend-scan-trends/run.mjs
  primary_users: [trend-analyst]
  storage: sqlite (writes `trends` table)
  status: stub-needs-trends-fetch-shim
---

# trend-scan-trends

Pulls "rising" related queries per channel keyword from Google Trends. Used as the leading-indicator signal layer — Trends often spikes before YouTube competitor activity does.

## When to use

- Twice-daily via Trend Analyst heartbeat.
- For "is this niche/topic gaining or fading?" baseline questions.

## When NOT to use

- For breaking-news topics — Trends has 1-4 hour lag.
- For long-tail keyword discovery — Trends biases toward higher-volume terms.

## Inputs

```json
{
  "channel": "english-learning",
  "seed_keywords": ["english idiom", "esl vocabulary"]   // optional; defaults to channel brand.md keyword seeds
}
```

## Outputs

```json
{
  "channel": "english-learning",
  "signals_added": 8,
  "per_keyword": {
    "english idiom": { "rising_count": 4, "top_breakout": "english idiom origin" },
    "esl vocabulary": { "rising_count": 4, "top_breakout": "business english vocabulary" }
  }
}
```

## Implementation notes

Google Trends has NO official public API. Implementation options:
1. **Unofficial endpoint scraping** (current stub plan) — calls `https://trends.google.com/trends/api/explore` with proper headers. Fragile; breaks when Google changes shape.
2. **`google-trends-api` npm package** — wraps the unofficial endpoint. Active maintenance. Recommended path for Phase 1 deploy.
3. **SerpAPI Google Trends endpoint** — paid; reliable. Backup if unofficial breaks.

Aggressive cache: results cached 4h minimum per (channel, keyword) to avoid hammering the endpoint.

## Implementation status

Stub for Phase 1: real fetch is stubbed; SQLite writes synthetic signals so downstream pipeline can test. Real implementation picks one of the 3 paths above during build step 13.
