---
schema: agentcompanies/v1
kind: skill
name: script-generate
description: Generate long-form script + 2-3 derived Shorts from an approved packet. Reads per-channel brand.md to enforce POV, hook patterns, banned phrases, format, and structure.
metadata:
  requires_env:
    - FACELESS_MEDIA_DB_PATH
    - NODE_OPTIONS                  # --experimental-sqlite
  implementation: skills/script-generate/run.mjs
  primary_users: [script-writer]
  storage: sqlite (reads `packets`, writes `scripts`)
  status: stub-needs-llm-adapter
---

# script-generate

The editorial-execution skill. Takes an approved packet, reads the channel's `brand.md`, and generates a long-form script (channel-specific length) plus 2-3 derived Shorts using the same voice and visuals.

## When to use

- Called by Script Writer agent on Issues in `scripting` status.
- Manual `Run now` only for prompt-tuning iterations during build.

## When NOT to use

- For QA scoring — that's `script-qa`.
- For packet generation — that's `viral-packet-build`.
- For ad-hoc copy outside the packet pipeline.

## Inputs

```json
{
  "channel": "finance-skeptic",
  "packet_issue_url": "<paperclip-issue-url>",
  "packet_md": "<full packet markdown>",
  "format": "combo"                 // "long_only" | "combo" (default; long + 2-3 shorts)
}
```

## Process (the value is in the prompt construction)

1. Load `shared/channels/<slug>/brand.md` — POV statement, tonal rules, hook patterns, banned phrases, format mix, video structure, topic boundaries.
2. Load last 10 scripts for this channel from `scripts` SQLite — extract their opening hook phrases (avoid reuse).
3. Load most recent 5 lessons from `shared/channels/<slug>/lessons.md` — what worked, what didn't on retention.
4. Construct the script-generation prompt with these explicit sections:
   - **POV statement (verbatim)** — the channel persona's worldview
   - **Hook templates (verbatim)** — model MUST use one as the base of the script's first 15s
   - **Banned phrases (verbatim)** — model MUST NOT use any of these
   - **Tonal rules** — register, pace, affect, channel-specific extras (e.g., finance-skeptic's "cite a real source in first 30s")
   - **Format specification** — long-form length + Shorts derivation count + episode/video structure
   - **Topic boundaries** — what cannot be in scope
   - **POV stress-test rule** — if applicable to this channel (currently only finance-skeptic)
   - **Past script openings to avoid** — last 10 opening lines from this channel
   - **Recent lessons** — what hook patterns / formats are working / failing
   - **Packet content** — the actual research material
5. Call Claude (`claude_local` adapter) via the appropriate adapter interface.
6. Parse the response into long-form + Shorts segments.
7. Write to `scripts` SQLite table: draft_md, format, hook_used, channel.
8. Return scripts to caller (Script Writer agent) for QA.

## Outputs

```json
{
  "channel": "finance-skeptic",
  "packet_issue_url": "...",
  "long_form": {
    "title": "...",
    "script_md": "...",
    "word_count": 1547,
    "hook_template_used": "[X] is the most repeated financial advice on the internet. Here's who actually benefits when you follow it."
  },
  "shorts": [
    { "title": "...", "script_md": "...", "duration_estimate_s": 45 },
    { "title": "...", "script_md": "...", "duration_estimate_s": 38 }
  ]
}
```

## Implementation status

Stub for Phase 1: the prompt construction IS fully built (which is most of the value here). The actual Claude API call is stubbed with a placeholder response so downstream pipeline (script-qa, producer) can test. Real Claude call wires in when adapter call interface is confirmed against live Paperclip instance.
