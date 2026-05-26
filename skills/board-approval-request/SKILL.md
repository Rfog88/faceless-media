---
schema: agentcompanies/v1
kind: skill
name: board-approval-request
description: Files per-video Board approval Issue with full artifact. Implements the progressive automation gate for pre-graduation channels (N>=10 approved + K>=5 trailing clean to graduate, M=3 hold queue cap).
metadata:
  requires_env:
    - DISCORD_WEBHOOK_URL
    - PAPERCLIP_API_URL
    - PAPERCLIP_API_TOKEN
    - FACELESS_MEDIA_DB_PATH
    - NODE_OPTIONS               # --experimental-sqlite
  implementation: skills/board-approval-request/run.mjs
  primary_users: [head-of-content, cto]
  status: stub-needs-paperclip-api
---

# board-approval-request

Implements [[progressive-automation-gate]] for video publishing. Every channel's first 10 publishes require per-video Board approval. Files the approval Issue with the full artifact, fires `board-notify` Tier 1 with the link, and enforces the hold-queue cap.

## When to use

- Called by Head of Content after a video clears `pending_review` (production complete, thumbnail picked).
- **Only for pre-graduation channels.** If channel is graduated, this skill returns no-op and instructs caller to advance directly to `ready_to_publish`.

## When NOT to use

- For non-publish actions (operational escalations) — use `escalate-to-board`.
- For graduated channels — skip the gate entirely.

## Inputs

```json
{
  "channel": "english-learning",
  "issue_url": "<paperclip-issue-url-of-the-video>",
  "title": "Episode 4: Three idioms about money",
  "script_url": "<url-or-path>",
  "voiceover_sample_url": "<url-to-30s-sample>",
  "thumbnail_urls": ["<url-1>", "<url-2>", "<url-3>"],
  "selected_thumbnail_index": 1,
  "video_title": "...",
  "video_description": "...",
  "video_tags": ["..."],
  "disclosure_set": true,
  "copyright_preflight_pass": true,
  "asset_license_summary": "12 assets, all licensed (Storyblocks: 9, Epidemic: 3)",
  "predicted_ctr": 0.062,
  "predicted_retention": 0.51
}
```

## Hard validations (refuse if any fail)

- `disclosure_set === true` (non-negotiable per 2026 YT enforcement)
- `copyright_preflight_pass === true` (no upload without all assets licensed)
- Hold queue for this channel < M=3 (cap)

## Outputs

- On graduated channel: `{status: "skip", reason: "channel_graduated"}` — caller advances directly to ready_to_publish.
- On hold-queue cap: `{status: "refused", reason: "hold_queue_at_cap", queue_depth: 3}` — caller halts further drafts for this channel.
- On hard-validation fail: `{status: "refused", reason: "disclosure_not_set"|"copyright_preflight_failed"}`.
- On success: `{status: "submitted", issue_id, queue_depth_after}`.

## Board response handling

Handled by the polling routine `board-approval-poll` (assignee: cto), NOT this skill. Board responses:
- **APPROVE** → mark `board_approval_queue.status='approved'`, increment `channels.n_approved`, increment `channels.last_k_clean` (cap at 5).
- **APPROVE-WITH-EDITS** → mark `status='edits'`, increment `n_approved`, reset `last_k_clean` to 0.
- **REJECT (with reason)** → mark `status='rejected'`, do NOT increment counters. Issue killed; lessons.md entry created.

Graduation auto-trigger: when `n_approved >= 10 AND last_k_clean >= 5`, CTO heartbeat announces "auto-mode active for channel:<slug>".

## Anti-noise

- Tier-1 escalation only — no @here or SMS for routine approval requests.
- 24h timeout reminder fires once per pending Issue past 24h (handled by `board-approval-poll`).
- DND window honored per `BOARD_DND_HOURS`.

## Implementation status

Stub for Phase 1: Paperclip Issue-creation API call is stubbed pending endpoint confirmation. SQLite queue tracking IS active. Discord notification IS active.
