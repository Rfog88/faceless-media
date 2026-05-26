---
schema: agentcompanies/v1
kind: skill
name: copyright-preflight
description: Hard gate verifying every asset in a video has a license_id logged AND that license_id exists in the channel's `asset-licenses.json` registry. Refuses pass on any unaccounted asset.
metadata:
  requires_env:
    - FACELESS_MEDIA_DB_PATH
    - NODE_OPTIONS                  # --experimental-sqlite
  implementation: skills/copyright-preflight/run.mjs
  primary_users: [producer, cto]
  storage: sqlite (reads `asset_uses`, writes `videos.copyright_preflight_pass`)
  status: live
---

# copyright-preflight

The hard gate that protects channel integrity. Refuses to mark a video as preflight-passed if ANY asset used in its assembly is missing a license_id OR has a license_id not registered in the channel's `asset-licenses.json`.

Per 2026 YT enforcement, Content ID strikes are existential — three strikes = permanent channel termination. License tracking is the cheapest insurance.

## When to use

- Called by Producer after `video-assemble` logs assets to `asset_uses` table.
- Called by CTO weekly via `copyright-audit` routine for retroactive sweep on all published videos.

## When NOT to use

- For dispute workflow (a Content ID claim arrived) — that's Phase 1.5's `copyright-dispute` skill.
- For asset sourcing — that's `video-assemble`'s call (Storyblocks / Epidemic Sound).

## Inputs

```json
{
  "channel": "english-learning",
  "video_issue_url": "<issue-url>"
}
```

## Process

1. Load `shared/channels/<slug>/asset-licenses.json` — the registry.
2. Query `asset_uses` for all entries matching `video_issue_url`.
3. For each asset_use row: verify `license_id` is non-null AND present in the registry.
4. If ALL pass → set `videos.copyright_preflight_pass = 1`, return pass.
5. If ANY fail → set `videos.copyright_preflight_pass = 0`, return fail with list of missing/invalid license_ids.

## Outputs

On pass:
```json
{
  "channel": "english-learning",
  "video_issue_url": "...",
  "pass": true,
  "assets_checked": 18,
  "licenses_verified": 18
}
```

On fail:
```json
{
  "channel": "english-learning",
  "video_issue_url": "...",
  "pass": false,
  "assets_checked": 18,
  "missing_or_invalid": [
    { "asset_id": "sb-stub-123", "issue": "license_id is null" },
    { "asset_id": "ep-stub-456", "issue": "license_id EP-FAKE-789 not in registry" }
  ]
}
```

## Implementation status

LIVE. SQLite query + JSON registry lookup + videos table update all working. The only thing that doesn't work yet is the registry being populated with real license IDs — Producer auto-populates `asset_uses` with stub license_ids during development, which means preflight will fail on real-mode until `asset-licenses.json` is filled with the matching IDs.

For Phase 1 testing: either populate `asset-licenses.json` with the stub license_ids that `video-assemble` produces, or add a `STUB_MODE` env that bypasses verification (NOT recommended; better to test the gate behavior properly).
