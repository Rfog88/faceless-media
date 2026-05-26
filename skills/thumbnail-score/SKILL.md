---
schema: agentcompanies/v1
kind: skill
name: thumbnail-score
description: Heuristic CTR predictor for thumbnail variants. Scores contrast, face-presence, text density, color, curiosity-pull.
metadata:
  requires_env:
    - FACELESS_MEDIA_DB_PATH
    - NODE_OPTIONS                  # --experimental-sqlite
  implementation: skills/thumbnail-score/run.mjs
  primary_users: [producer, head-of-content]
  storage: sqlite (reads `videos`)
  status: heuristic-active
---

# thumbnail-score

Heuristic scoring of thumbnail variants. No image-analysis call required — scoring is based on metadata from `thumbnail-generate` (strategy id, overlay text length, prompt structure) and channel brand.md style preferences.

Real CTR prediction is a perception problem that requires either an image model or actual published-A/B-test data. Phase 1 uses heuristics; Phase 2+ can layer in `ab-thumbnail-test` outcomes to calibrate.

## When to use

- Called by Producer after `thumbnail-generate` produces variants.
- Called by Head of Content during `pending_review` to assist thumbnail selection (does not replace human judgment).

## When NOT to use

- For real CTR measurement — that's `analytics-pull` post-publish.
- For thumbnail selection — that's Head of Content's call. This is input, not decision.

## Inputs

```json
{
  "channel": "finance-skeptic",
  "video_issue_url": "<issue-url>"
}
```

## Heuristic scoring (0-100 per variant)

- **text_density_score (0-25):** 3-7 word overlays score full. >10 word overlays penalty. 0-2 word overlays penalty (too sparse).
- **strategy_score (0-25):** weighted by channel brand.md preferences. finance-skeptic prefers `high-contrast-minimalist` + `object-focal`. english-learning prefers `text-dominant` + `face-focal`.
- **brand_motif_score (0-25):** does the prompt include brand motif keywords (e.g., "speech-bubble", "yellow highlighter" for english-learning; "red strike-through", "magnifying glass" for finance-skeptic)?
- **curiosity_score (0-25):** does the overlay text contain a question, a specific number, or a contrarian claim?

## Outputs

```json
{
  "channel": "finance-skeptic",
  "video_issue_url": "...",
  "scores": [
    { "variant_index": 0, "strategy": "face-focal", "score": 62, "breakdown": {...} },
    { "variant_index": 1, "strategy": "object-focal", "score": 78, "breakdown": {...} },
    { "variant_index": 2, "strategy": "text-dominant", "score": 71, "breakdown": {...} },
    { "variant_index": 3, "strategy": "high-contrast-minimalist", "score": 84, "breakdown": {...} }
  ],
  "recommended_index": 3
}
```

## Implementation status

Heuristics ARE LIVE. No external API call. Phase 2 will calibrate weights against `performance` table CTR data.
