# Faceless Media Holdings

AI-orchestrated faceless YouTube media operation. Multi-channel "digital media hedge fund" running on Paperclip.

**Status:** Skeleton scaffolded. Awaiting brand-file authoring + agent role definitions before first import.

## Structure

- `COMPANY.md` — company manifest, mission, Phase 1 scope
- `.paperclip.yaml` — skill library + routine documentation + env keys
- `agents/` — 8 agent definitions (4 files each: AGENTS, HEARTBEAT, SOUL, TOOLS)
- `skills/` — 18 skill definitions (reused from Vantyx + new)
- `shared/` — per-channel artifacts (brand, voice pool, lessons, licenses) + global lessons
- `data/` — SQLite database (gitignored)

## Phase 1 channels (parallel pair)

- **1A**: English Learning Podcasts — `shared/channels/english-learning/`
- **1B**: The Skeptical Analyst (finance via "follow the money" frame) — `shared/channels/finance-skeptic/`

## Plan

Full plan at `C:\Users\RyanFogle\.claude\plans\you-konw-how-we-ancient-starlight.md`.

## Import

See `reference_paperclip_companies_tool.md` (memory). Command shape:

```bash
sudo -u paperclip bash -lc 'cd ~ && npx companies.sh add \
  https://github.com/Rfog88/faceless-media/tree/master \
  --include=company,agents,skills --collision=skip'
```

Routines are NOT importable — create manually in Paperclip UI per `reference_paperclip_ui_routines.md`.
