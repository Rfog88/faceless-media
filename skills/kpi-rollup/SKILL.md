---
schema: agentcompanies/v1
kind: skill
name: kpi-rollup
description: Compute morning KPI digest (videos published, gate progress, channel KPIs, hold queue depths, quota burn) and post via board-notify Tier 0 if delta-worthy.
metadata:
  requires_env:
    - FACELESS_MEDIA_DB_PATH   # optional; default /home/paperclip/faceless-media.sqlite
    - DISCORD_WEBHOOK_URL
    - NODE_OPTIONS              # set to --experimental-sqlite on Node 22.x
  implementation: skills/kpi-rollup/run.mjs
  primary_users: [ceo, cto, analytics-lead]
  storage: sqlite (read-only here; populated by youtube-upload + analytics-pull + board-approval-request)
---

# kpi-rollup

Pull yesterday's metrics from the Faceless Media SQLite store:
- `uploads` table (videos published)
- `performance` table (CTR, retention, RPM snapshots)
- `channels` table (gate status, n_approved, last_k_clean)
- `pending_board_approval` count per channel (hold queue depth)

Compose a per-channel digest plus a cross-channel summary. Compare to a 7-day moving average. Post via `board-notify` Tier 0 **only if at least one metric has changed by >15%** from average OR a channel is at/over its hold-queue cap — otherwise stay silent.

## When to use

- CEO heartbeat morning step.
- Weekly Monday rollup (longer horizon).
- Triggered by `kpi-rollup-morning` routine on weekdays 7:45 AM ET.

## When NOT to use

- Mid-day rollups — that's noise unless something is on fire.
- During DND window (Tier 0 is silently dropped by board-notify).

## Inputs

```json
{
  "window": "daily"           // or "weekly"
}
```

## Outputs

- If delta-worthy: posts to Discord via board-notify; stdout `{posted: true, deltas: [...]}`.
- Otherwise: stdout `{posted: false, reason: "no_meaningful_delta"}`.

## Metrics calculated

Per channel:
1. **Videos published (24h)** — count from `uploads`.
2. **Gate progress** — `n_approved` / 10, plus `last_k_clean` / 5.
3. **Hold queue depth** — count of issues in `pending_board_approval` for this channel. Alert if >= M=3.
4. **Avg CTR (last 7d)** — from `performance` 72h snapshots.
5. **Avg retention (last 7d)** — same source.
6. **Subs delta (24h)** — sum of subs_delta from latest snapshots.

Cross-channel:
1. **Total videos published this week.**
2. **Channels graduated this week.**
3. **Global lessons added.**
4. **Any Tier-2 escalations in last 24h.**

## Implementation status

Live for the videos/performance/channels metrics (queries the SQLite store directly). The Paperclip per-agent budget metric is deferred until `PAPERCLIP_API_TOKEN` is wired properly.
