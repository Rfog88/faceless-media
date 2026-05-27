---
schema: agentcompanies/v1
kind: skill
name: viral-packet-build
description: Synthesize multi-source trend signals into a research packet. Clusters signals, scores against per-channel lessons, files as Paperclip Issue with `channel:<slug>` label.
metadata:
  requires_env:
    - PAPERCLIP_API_URL
    - PAPERCLIP_API_KEY
    - PAPERCLIP_COMPANY_ID
    - FACELESS_MEDIA_DB_PATH
    - NODE_OPTIONS                  # --experimental-sqlite
  implementation: skills/viral-packet-build/run.mjs
  primary_users: [trend-analyst]
  storage: sqlite (reads `trends`, writes `packets`)
  status: live-paperclip-issue-create
---

# viral-packet-build

Closes the synthesis side of Trend Analyst's loop. Takes raw signals from `trends` table (written by `trend-scan-*` skills), clusters by topic similarity, scores against the channel's lessons.md, and files high-scoring clusters as Paperclip Issues for Head of Content's approval queue.

## When to use

- End of each Trend Analyst heartbeat (after all `trend-scan-*` skills have written signals).
- Manual `Run now` to re-score after a brand.md edit (since scoring depends on lessons + topic boundaries).

## When NOT to use

- For one-off topic research — that's `trend-scan-*` directly.
- For Issue creation outside the trend pipeline — those are direct Paperclip API calls, not packets.

## Inputs

```json
{
  "channel": "english-learning",
  "min_score": 50,                  // optional; default 50
  "max_packets": 5                  // optional; default 5
}
```

## Process

1. Read unused signals (`used_in_packet=false`, `expired=false`, `scored_at > 24h ago`) for the channel.
2. Cluster signals by topic similarity (simple keyword-overlap algorithm for Phase 1; embeddings later).
3. Read per-channel `lessons.md` for recent 5-10 entries.
4. Score each cluster:
   - Base score: avg of contributing signal scores
   - Boost if 2+ signal sources (cross-source corroboration)
   - Boost if a recent lesson supports the angle
   - Penalty if a recent lesson warns against the angle
   - ZERO if topic matches a channel's banned topic-boundary
5. For top-scoring clusters above `min_score`, up to `max_packets`:
   a. Compose packet markdown with topic, evidence (signal citations), lesson citations, hook angle, thumbnail angle, format recommendation
   b. File as Paperclip Issue assigned to Head of Content with title prefix `[PACKET][channel:<slug>]` and Paperclip priority mapped from score
   c. Mark contributing `trends` rows as `used_in_packet=true`
   d. Write packet metadata to `packets` SQLite table

## Outputs

```json
{
  "channel": "english-learning",
  "packets_created": 3,
  "packets": [
    { "issue_url": "...", "topic": "...", "score": 78, "signal_count": 5 },
    ...
  ],
  "signals_consumed": 12
}
```

## Implementation status

Paperclip Issue-creation is live. Packet build refuses to mark trends used or write `packets` rows when issue creation is unavailable, so production runs cannot report `packets_created` from stubbed issue creation.
