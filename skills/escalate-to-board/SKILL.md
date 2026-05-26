---
schema: agentcompanies/v1
kind: skill
name: escalate-to-board
description: Create a Paperclip Issue assigned to Board (Ryan) with a standardized reason, fire `board-notify` to Discord/SMS, and apply the right labels + dependency rules.
metadata:
  requires_env:
    - DISCORD_WEBHOOK_URL
    - PAPERCLIP_API_URL       # e.g. http://localhost:3100 inside droplet
    - PAPERCLIP_API_TOKEN
  implementation: skills/escalate-to-board/run.mjs
  primary_users: [all]
  status: stub-needs-paperclip-api
---

# escalate-to-board

The canonical "I need a human" channel. Every agent has this skill.

## When to use

- Any standardized reason (8 total):
  1. `api-key-missing`
  2. `subscription-rate-limit`
  3. `decision-needed` (with default-if-no-response + window)
  4. `external-quota-exceeded`
  5. `agent-conflict`
  6. `human-review-required`
  7. `adapter-broken`
  8. `unknown-failure` (attach `diagnose-why-work-stopped` output if available)

## When NOT to use

- For status updates → use `board-notify` Tier 0 instead.
- For routine peer-to-peer coordination → comment on the Issue.
- For per-video Board approval during pre-graduation → use `board-approval-request` (specialized gate primitive).
- For "I'm confused" — re-read your AGENTS.md + SOUL.md first.

## Inputs

```json
{
  "tier": 1,                                  // 1 or 2
  "reason": "decision-needed",                // one of the 8 standardized
  "title": "ElevenLabs quota exceeded for finance-skeptic",
  "context": "Producer detected ElevenLabs API returning 429 during voiceover for YT-12 (finance-skeptic). Hold queue depth: 1.",
  "suggested_action": "Approve voice-pool reduction OR upgrade ElevenLabs plan from Starter to Creator ($22/mo).",
  "issue_url": "<paperclip-issue-url>",       // parent Issue, optional
  "agent_slug": "producer",
  "error_signature": "elevenlabs-quota-exceeded",  // for tier-2 dedupe
  "channel": "finance-skeptic"                // optional, included in body if present
}
```

## Outputs

- Creates a new Issue assigned to Board with `pending_human` label and reason as another label.
- Calls `board-notify` (Discord + optional Twilio for Tier 2).
- For Tier 2: marks dependent Issues as `Blocked` until ACK.
- Stdout: JSON `{issue_id, discord: "ok", sms: "...", blocked_dependents: N}`.

## Anti-noise

- Tier-2 dedupe by `(agent_slug, error_signature)` — if an open Tier-2 exists, this call no-ops with `{dedup: true, existing: <issue_id>}`.
- Tier-1 limited to 3 nudges (immediate, +4h, +24h) per Issue; the 4th attempt auto-promotes to Tier 2.

## Implementation status

Stub for Phase 1: the Paperclip Issue-creation API endpoint shape needs confirmation against a live Paperclip instance. Currently the script calls `board-notify` and prints what it WOULD create. CTO wires the Paperclip API call after confirming endpoint shape with Board.
