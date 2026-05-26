---
schema: agentcompanies/v1
kind: skill
name: voiceover-elevenlabs
description: Generate TTS voiceover via ElevenLabs API with mandatory per-channel voice rotation. Never same voice twice in a row; never cross channels.
metadata:
  requires_env:
    - ELEVENLABS_API_KEY
    - FACELESS_MEDIA_DB_PATH
    - VOICEOVER_OUTPUT_DIR        # optional; default /home/paperclip/faceless-media/voiceovers
    - NODE_OPTIONS                 # --experimental-sqlite
  implementation: skills/voiceover-elevenlabs/run.mjs
  primary_users: [producer]
  storage: sqlite (reads + writes `voice_usage`)
  status: stub-needs-elevenlabs-key
---

# voiceover-elevenlabs

Renders a script to MP3 using a rotated voice from the channel's per-channel voice pool. Rotation is enforced deterministically: never the same voice twice in a row on the same channel, never a voice that appears in another channel's pool.

## When to use

- Called by Producer for every video in `production` status.
- Manual `Run now` only for voice-pool calibration testing (one-off samples).

## When NOT to use

- For cross-channel voice testing — that violates the cross-channel-bleed rule.
- For non-script TTS (e.g., notification audio) — that's outside the production pipeline scope.

## Inputs

```json
{
  "channel": "english-learning",
  "script_id": 42,                   // from scripts table
  "video_issue_url": "<issue-url>",  // for logging in voice_usage
  "voice_id_override": null          // optional; bypass rotation (testing only)
}
```

## Voice selection algorithm

1. Load voice pool from `shared/channels/<slug>/voice-pool.md` (parse the markdown table).
2. Query `voice_usage` SQLite for last 5 uses on this channel — extract voice_ids.
3. Eligible pool = brand.md pool minus last-used voice (hard rule).
4. Among eligible, prefer least-recently-used (compute usage rank).
5. If pool is empty after filter (single-voice pool, edge case), refuse and escalate.

## Process

1. Select voice per algorithm.
2. Call ElevenLabs `/v1/text-to-speech/{voice_id}` with the script text.
3. Save MP3 to `${VOICEOVER_OUTPUT_DIR}/${channel}/${video_issue_id}_${format}.mp3`.
4. Log to `voice_usage` table: channel, voice_id, used_at, video_issue_url, char_count.

## Outputs

```json
{
  "channel": "english-learning",
  "video_issue_url": "...",
  "voice_id_used": "rcA2sBkN...",
  "voice_name": "Bella",
  "mp3_path": "/home/paperclip/faceless-media/voiceovers/english-learning/YT-42_long.mp3",
  "char_count": 1547,
  "rotation_eligible_pool_size": 4
}
```

## Implementation status

Stub for Phase 1: ElevenLabs HTTP call stubbed pending `ELEVENLABS_API_KEY` provisioning. Voice rotation algorithm + SQLite logging ARE live. Stub writes a placeholder MP3 file so downstream pipeline can test path-handling.
