#!/usr/bin/env node
// voiceover-elevenlabs — TTS via ElevenLabs with mandatory per-channel voice rotation.
// STATUS: rotation logic + SQLite logging LIVE. ElevenLabs HTTP call stubbed pending API key.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{"channel":"english-learning","script_id":42,"video_issue_url":"..."}' | node skills/voiceover-elevenlabs/run.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch (e) {
  console.error(JSON.stringify({
    error: "adapter-broken",
    reason: "node_sqlite_unavailable",
    detail: "Bind NODE_OPTIONS=--experimental-sqlite at project or agent env level.",
    message: e.message,
  }));
  process.exit(3);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS voice_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,
    voice_id TEXT NOT NULL,
    used_at TEXT DEFAULT (datetime('now')),
    video_issue_url TEXT,
    char_count INTEGER
  );
`;

function openDb() {
  const path = process.env.FACELESS_MEDIA_DB_PATH || "/home/paperclip/faceless-media.sqlite";
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

function loadVoicePool(channel) {
  const path = resolve(repoRoot, "shared", "channels", channel, "voice-pool.md");
  const md = readFileSync(path, "utf8");
  // Parse markdown table rows: | voice_id | voice_name | ... |
  // Skip rows where voice_id === "TBD"
  const rows = [...md.matchAll(/^\|\s*([A-Za-z0-9_]+)\s*\|\s*([^|]+?)\s*\|/gm)]
    .map(m => ({ voice_id: m[1].trim(), voice_name: m[2].trim() }))
    .filter(v => v.voice_id !== "TBD" && v.voice_id !== "Voice ID" && !v.voice_id.startsWith("--"));
  return rows;
}

function loadCrossChannelVoiceIds(channel) {
  // Aggregate voice IDs from every OTHER channel's voice-pool.md to enforce cross-channel non-overlap.
  const otherChannels = ["english-learning", "finance-skeptic"].filter(c => c !== channel);
  const crossIds = new Set();
  for (const ch of otherChannels) {
    try {
      for (const v of loadVoicePool(ch)) crossIds.add(v.voice_id);
    } catch { /* ignore */ }
  }
  return crossIds;
}

function lastUsedVoiceIds(db, channel, n = 5) {
  return db.prepare(`
    SELECT voice_id, MAX(used_at) AS last_used_at FROM voice_usage
    WHERE channel = ? GROUP BY voice_id ORDER BY last_used_at DESC LIMIT ?
  `).all(channel, n).map(r => ({ voice_id: r.voice_id, last_used_at: r.last_used_at }));
}

function selectVoice(pool, lastUsed, crossChannelIds) {
  if (pool.length === 0) return null;

  // Remove any voice that's in another channel's pool (cross-channel bleed prevention)
  const eligible = pool.filter(v => !crossChannelIds.has(v.voice_id));
  if (eligible.length === 0) return null;

  // Remove most-recently-used (the hard "never twice in a row" rule)
  const mostRecent = lastUsed[0]?.voice_id;
  let candidates = eligible.filter(v => v.voice_id !== mostRecent);
  if (candidates.length === 0) candidates = eligible; // single-voice pool edge case

  // Prefer least-recently-used (or never-used)
  const usageMap = Object.fromEntries(lastUsed.map(u => [u.voice_id, u.last_used_at]));
  candidates.sort((a, b) => {
    const aUsed = usageMap[a.voice_id] || "1970-01-01";
    const bUsed = usageMap[b.voice_id] || "1970-01-01";
    return aUsed.localeCompare(bUsed); // ascending = oldest first
  });
  return candidates[0];
}

function loadScript(db, script_id) {
  return db.prepare(`SELECT * FROM scripts WHERE id = ?`).get(script_id);
}

async function callElevenLabsTTS(text, voiceId, apiKey) {
  // TODO Phase 1 deploy: actual fetch.
  //   const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
  //     method: "POST",
  //     headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
  //     body: JSON.stringify({ text, model_id: "eleven_turbo_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  //   });
  //   return Buffer.from(await res.arrayBuffer());
  if (!apiKey) {
    return { _stub: true, reason: "no_elevenlabs_key", mp3_bytes: Buffer.from(`STUB MP3 — voice ${voiceId} — ${text.substring(0, 80)}`) };
  }
  return { _stub: true, reason: "api_call_not_yet_wired", mp3_bytes: Buffer.from(`STUB MP3 — voice ${voiceId}`) };
}

async function main() {
  const raw = readFileSync(0, "utf8") || "{}";
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  const { channel, script_id, video_issue_url, voice_id_override } = input;
  if (!channel || !script_id || !video_issue_url) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "missing_required_field", required: ["channel", "script_id", "video_issue_url"] }));
    process.exit(2);
  }

  const db = openDb();
  const script = loadScript(db, script_id);
  if (!script) {
    db.close();
    console.error(JSON.stringify({ error: "decision-needed", reason: "script_not_found", script_id }));
    process.exit(2);
  }

  let selectedVoice;
  if (voice_id_override) {
    selectedVoice = { voice_id: voice_id_override, voice_name: "(override)" };
  } else {
    const pool = loadVoicePool(channel);
    const crossIds = loadCrossChannelVoiceIds(channel);
    const lastUsed = lastUsedVoiceIds(db, channel, 5);
    selectedVoice = selectVoice(pool, lastUsed, crossIds);

    if (!selectedVoice) {
      db.close();
      console.error(JSON.stringify({
        error: "decision-needed",
        reason: "no_eligible_voice",
        detail: pool.length === 0 ? "voice-pool.md has no real voice IDs (all TBD)" : "all pool voices excluded by cross-channel or recency rules",
        channel,
      }));
      process.exit(2);
    }
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const tts = await callElevenLabsTTS(script.draft_md, selectedVoice.voice_id, apiKey);

  // Write MP3 to disk
  const outDir = process.env.VOICEOVER_OUTPUT_DIR || "/home/paperclip/faceless-media/voiceovers";
  const channelDir = resolve(outDir, channel);
  if (!existsSync(channelDir)) mkdirSync(channelDir, { recursive: true });
  const issueId = video_issue_url.split("/").pop() || `script-${script_id}`;
  const mp3Path = resolve(channelDir, `${issueId}_${script.format || "long"}.mp3`);
  writeFileSync(mp3Path, tts.mp3_bytes);

  // Log usage
  db.prepare(`
    INSERT INTO voice_usage (channel, voice_id, video_issue_url, char_count) VALUES (?, ?, ?, ?)
  `).run(channel, selectedVoice.voice_id, video_issue_url, script.draft_md.length);
  db.close();

  console.log(JSON.stringify({
    channel,
    video_issue_url,
    voice_id_used: selectedVoice.voice_id,
    voice_name: selectedVoice.voice_name,
    mp3_path: mp3Path,
    char_count: script.draft_md.length,
    stub_mode: !!tts._stub,
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
