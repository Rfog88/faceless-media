---
schema: agentcompanies/v1
kind: skill
name: script-qa
description: Score a generated script for hook quality, retention, fact integrity, banned-phrase compliance, and POV stress-test (if applicable). Hard gate before production.
metadata:
  requires_env:
    - FACELESS_MEDIA_DB_PATH
    - NODE_OPTIONS                  # --experimental-sqlite
  implementation: skills/script-qa/run.mjs
  primary_users: [script-writer]
  storage: sqlite (reads + writes `scripts` table)
  status: heuristic-active (mostly)
---

# script-qa

Heuristic + structural scoring of generated scripts. Runs deterministically (mostly) — no LLM call needed for the core rubrics, only for the optional "is this hook genuinely strong?" judgment pass.

Per the per-channel brand.md POV stress-test rule, this skill is the LAST line of defense before Head of Content gets the script. POV violations caught here don't waste Head of Content's time.

## When to use

- Called by Script Writer after `script-generate` produces a draft.
- Pass requires: hook_score >= 7 AND retention_score >= 7 AND fact_status != fail AND banned_phrase_count == 0.

## When NOT to use

- For POV-stress-test enforcement at scale — that's Head of Content's call (this skill flags but doesn't reject solely on POV).
- For first-draft polish — script-qa is binary (pass/fail), not editorial feedback. Use script-generate iterations for refinement.

## Inputs

```json
{
  "channel": "finance-skeptic",
  "script_id": 42,                  // from scripts SQLite table
  "format": "long"                  // "long" | "short"
}
```

## Rubrics

### hook_score (0-10)
- +2 if first 15 seconds use one of brand.md hook templates (regex match against templates)
- +2 if first sentence contains movement/question/before-after structure
- +2 if specific number or claim is in the hook (vs vague)
- +2 if hook avoids generic openers ("Today we're going to talk about...", "In this video...")
- +2 if hook is under 30 seconds spoken length (~75 words)

### retention_score (0-10)
- +2 if structural beats present (channel-specific):
  - english-learning: [HOOK], learning goal stated, vocab callouts, recap, [CTA]
  - finance-skeptic: [HOOK], setup, reality/numbers, motive ("who benefits"), [CTA]
- +2 if pacing markers present (paragraph breaks every ~90 seconds of spoken content)
- +2 if curiosity gap is opened in hook and answered in payoff
- +2 if no dead spots (passages of >120 words without a beat shift)
- +2 if length matches brand.md format mix (long-form: 15-25 min for english-learning, 8-12 min for finance-skeptic)

### fact_status (pass | review | fail)
- **pass:** ≥1 source citation present (URL or specific "[Source: X]" marker). For finance-skeptic: source cited in first 30s.
- **review:** claims made but unclear sourcing; needs human verification.
- **fail:** unsourced specific numerical claims (e.g., "5 million people..." with no citation) OR claim of person's exact track record without source.

### banned_phrase scan
- Scans script text for each banned phrase from brand.md.
- Count of matches written to output. ANY match = qa fail regardless of other scores.

### POV stress-test (finance-skeptic only)
- Heuristic check: does the script contain at least one "who benefits / who profits / where does the money go" question explicitly answered?
- If yes: pov_stress_test_flag = "pass"
- If no: pov_stress_test_flag = "fail" — flagged for Head of Content, but does NOT auto-fail the qa (Head of Content makes the final call).

## Outputs

```json
{
  "script_id": 42,
  "channel": "finance-skeptic",
  "hook_score": 8,
  "retention_score": 7,
  "fact_status": "pass",
  "banned_phrase_count": 0,
  "banned_phrase_matches": [],
  "pov_stress_test_flag": "pass",
  "qa_status": "pass",
  "qa_reasons": []
}
```

## Implementation status

Heuristic rubrics ARE live (no API call needed). The optional "hook judgment" LLM pass is stubbed and skipped in Phase 1.
