---
schema: agentcompanies/v1
kind: company
name: Faceless Media Holdings
slug: faceless-media-holdings
version: 0.1.0
description: AI-orchestrated faceless YouTube media operation — multi-channel "digital media hedge fund" with data-driven trend research, retention-engineered production, and progressive automation gates per channel.
---

# Faceless Media Holdings

> Multi-channel faceless YouTube media operation. One company, N channels, 8 agents that serve all channels via channel-scoped context.

## Mission

Build a data-driven, AI-orchestrated faceless YouTube media network. Each channel is a separate Google/AdSense identity but shares the same agent roster, skill library, trend intelligence backend, and quality gates. Scale horizontally by adding channels, not agents.

## Phase 1 scope (channels 1A + 1B in parallel)

| Channel | Slug | Niche | Why this position |
|---|---|---|---|
| 1A | `english-learning` | English Learning Podcasts (intermediate-ESL, pedagogy-first) | Lowest copyright surface, audio-first format = simplest production, $11.88 RPM, 21x growth, ~10K competitors. Pipeline-proof channel. |
| 1B | `finance-skeptic` | The Skeptical Analyst — finance via "who profits from you believing this?" frame | Synthetic-persona POV (Board not authoring own perspective). Skeptic frame is the moat against 2026 AI-finance-slop enforcement. $10-15 RPM ceiling. Tonally opposite to 1A — stress-tests pipeline flexibility. |

**Phase 1.5 trigger:** both Phase 1 channels graduated the progressive automation gate (10 Board-approved publishes, last 5 clean). Then add 2A (Senior Health Advice) + 2B (Betrayal/Revenge Narratives).

## Org chart

```
Board (Ryan, human)
└── CEO (AI · claude_local)            — Visionary; capital allocation across channels
    ├── CTO (AI · codex_local)          — Pipeline owner; budget; copyright pre-flight; gate graduation
    │   ├── Trend Analyst (codex_local) — Daily scan PER CHANNEL: YT + Reddit + Trends + TikTok
    │   ├── Producer (codex_local)      — TTS + B-roll + music + thumbnails
    │   └── Analytics Lead (codex_local)— CTR/retention/RPM; per-channel + cross-channel lessons
    └── Head of Content (claude_local)  — Approves packets; thumbnail strategy; PER-VIDEO BOARD-APPROVAL OWNER
        ├── Script Writer (claude_local)— Drafts + retention-engineers scripts (channel-aware)
        └── Publisher (codex_local)     — Metadata, upload, AI-disclosure toggle, A/B thumbnails
```

**Adapter split rationale** (per [[claude-codex-adapter-split]] memory): 3 Claude / 5 Codex. Editorial/judgment agents (CEO strategy, Head of Content POV-gatekeeping, Script Writer editorial voice) on Claude Max. Structured-ops/tool-orchestration agents (CTO pipeline, Trend Analyst data synthesis, Producer ffmpeg/TTS orchestration, Publisher YT API, Analytics Lead data pulls) on Codex via ChatGPT Pro. Distributes load across two separate subscription quotas.

## Non-negotiables

1. AI disclosure on every upload (hard-coded in `youtube-upload` skill).
2. Separate Google + AdSense per channel — no centralization.
3. Copyright pre-flight is a hard QA gate (no upload without license IDs).
4. Voice rotation enforced — no same voice twice in a row per channel.
5. Progressive automation gate per channel — 10 approved + 5 trailing clean to graduate.
6. Editorial POV recorded in per-channel `shared/channels/<slug>/brand.md`.

## Reference

Full plan: `C:\Users\RyanFogle\.claude\plans\you-konw-how-we-ancient-starlight.md`

## Status

Skeleton scaffolded. Brand files + agent role definitions pending next build session.
