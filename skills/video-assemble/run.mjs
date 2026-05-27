#!/usr/bin/env node
// video-assemble — ffmpeg pipeline composing voiceover + B-roll + music into mp4 (long + shorts).
// STATUS: ffmpeg + asset-API calls stubbed. asset_uses logging IS LIVE for copyright-preflight integration.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{...}' | node skills/video-assemble/run.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
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
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_issue_url TEXT,
    channel TEXT,
    format TEXT,                       -- "long" | "short"
    mp4_path TEXT,
    duration_s INTEGER,
    voice_id_used TEXT,
    thumbnail_variants_json TEXT,
    selected_thumbnail_index INTEGER,
    copyright_preflight_pass INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS asset_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_issue_url TEXT,
    channel TEXT,
    asset_id TEXT,
    license_id TEXT,
    source TEXT,                       -- "storyblocks" | "epidemic" | etc.
    used_at TEXT DEFAULT (datetime('now'))
  );
`;

function openDb() {
  const path = process.env.FACELESS_MEDIA_DB_PATH || "/home/paperclip/faceless-media.sqlite";
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

function parseSceneBeats(scriptMd) {
  // Scene beats are bracketed markers. Extract each as a scene with its text.
  const beats = [];
  const re = /\[([A-Z 0-9-]+)\]\s*([\s\S]*?)(?=\[[A-Z]|$)/g;
  let m;
  while ((m = re.exec(scriptMd)) !== null) {
    beats.push({ marker: m[1].trim(), text: m[2].trim() });
  }
  return beats;
}

async function fetchStoryblocksClip(keyword, apiKey) {
  // TODO Phase 1 deploy: actual Storyblocks API call (search → download).
  if (!apiKey) {
    return { _stub: true, asset_id: `sb-stub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, license_id: `SB-LIC-${Date.now()}`, duration_s: 8 };
  }
  return { _stub: true, asset_id: `sb-stub-${Date.now()}`, license_id: `SB-LIC-${Date.now()}`, duration_s: 8 };
}

async function fetchEpidemicTrack(mood, apiKey) {
  if (!apiKey) {
    return { _stub: true, asset_id: `ep-stub-${Date.now()}`, license_id: `EP-LIC-${Date.now()}`, duration_s: 180 };
  }
  return { _stub: true, asset_id: `ep-stub-${Date.now()}`, license_id: `EP-LIC-${Date.now()}`, duration_s: 180 };
}

function buildFfmpegCommand({ voiceoverPath, brollClips, musicPath, outputPath }) {
  // Stub command structure — real implementation would build a complex filter graph.
  // Real version: -i voice -i music -i broll1 -i broll2 ... -filter_complex "[1:a]volume=0.2[m]; [0:a][m]amix=inputs=2[a]" -map "[a]" -map 0:v ...
  return [
    "ffmpeg",
    "-y",
    `-i ${voiceoverPath}`,
    ...brollClips.map(c => `-i ${c}`),
    `-i ${musicPath}`,
    `-filter_complex "[broll_concat][voice_with_ducked_music]"`,
    "-c:v libx264 -preset medium -crf 23",
    "-c:a aac -b:a 192k",
    "-pix_fmt yuv420p",
    "-shortest",
    outputPath,
  ].join(" ");
}

function extractShortsBlocks(scriptMd) {
  // Shorts section follows '---SHORTS---' divider.
  const parts = scriptMd.split(/---\s*SHORTS\s*---/i);
  if (parts.length < 2) return [];
  return parts[1].split(/(?=\[SHORT\s*\d+\s+HOOK\])/i)
    .map(s => s.trim())
    .filter(s => /\[SHORT\s*\d+\s+HOOK\]/i.test(s));
}

function readVoiceoverManifest(voiceoverMp3Path) {
  const dir = dirname(voiceoverMp3Path);
  const base = basename(voiceoverMp3Path, ".mp3");
  const issueId = base.replace(/_long$/, "");
  const candidates = [
    resolve(dir, `${issueId}_voiceover_manifest.json`),
    resolve(dir, `${issueId}_manifest.json`),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (parsed && Array.isArray(parsed.short_mp3_paths)) return parsed;
    } catch {
      // Ignore malformed manifest and continue.
    }
  }
  return null;
}

async function main() {
  const raw = readFileSync(0, "utf8") || "{}";
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  const { channel, script_id, voiceover_mp3_path, video_issue_url } = input;
  if (!channel || !script_id || !voiceover_mp3_path || !video_issue_url) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "missing_required_field", required: ["channel", "script_id", "voiceover_mp3_path", "video_issue_url"] }));
    process.exit(2);
  }

  const db = openDb();
  const script = db.prepare(`SELECT * FROM scripts WHERE id = ?`).get(script_id);
  if (!script) {
    db.close();
    console.error(JSON.stringify({ error: "decision-needed", reason: "script_not_found", script_id }));
    process.exit(2);
  }

  const sbKey = process.env.STORYBLOCKS_API_KEY;
  const epKey = process.env.EPIDEMIC_SOUND_API_KEY;

  // Parse long-form into scene beats; fetch a B-roll per beat.
  const longBeats = parseSceneBeats(script.draft_md);
  const longBroll = [];
  const insertAsset = db.prepare(`INSERT INTO asset_uses (video_issue_url, channel, asset_id, license_id, source) VALUES (?, ?, ?, ?, ?)`);

  for (const beat of longBeats) {
    const keyword = beat.text.split(/\s+/).slice(0, 3).join(" ");
    const clip = await fetchStoryblocksClip(keyword, sbKey);
    insertAsset.run(video_issue_url, channel, clip.asset_id, clip.license_id, "storyblocks");
    longBroll.push(clip.asset_id);
  }

  const musicTrack = await fetchEpidemicTrack("brand-default", epKey);
  insertAsset.run(video_issue_url, channel, musicTrack.asset_id, musicTrack.license_id, "epidemic");

  // Output paths
  const outDir = process.env.VIDEO_OUTPUT_DIR || "/home/paperclip/faceless-media/videos";
  const channelDir = resolve(outDir, channel);
  if (!existsSync(channelDir)) mkdirSync(channelDir, { recursive: true });
  const issueId = video_issue_url.split("/").pop() || `script-${script_id}`;

  // Long-form output
  const longMp4Path = resolve(channelDir, `${issueId}_long.mp4`);
  const longCmd = buildFfmpegCommand({
    voiceoverPath: voiceover_mp3_path,
    brollClips: longBroll,
    musicPath: musicTrack.asset_id,
    outputPath: longMp4Path,
  });
  // TODO Phase 1 deploy: spawnSync("bash", ["-c", longCmd]) and check exit code.
  // Stub: write a placeholder file so downstream skills can reference the path.
  writeFileSync(longMp4Path, `STUB MP4 — ffmpeg cmd: ${longCmd}`);

  db.prepare(`
    INSERT INTO videos (video_issue_url, channel, format, mp4_path, duration_s, voice_id_used) VALUES (?, ?, ?, ?, ?, ?)
  `).run(video_issue_url, channel, "long", longMp4Path, 600, null /* will be filled by Producer */);

  // Shorts
  const shortsBlocks = extractShortsBlocks(script.draft_md);
  const manifest = readVoiceoverManifest(voiceover_mp3_path);
  const requestedShortPaths = Array.isArray(input.short_voiceover_mp3_paths) ? input.short_voiceover_mp3_paths : [];
  const manifestShortPaths = manifest?.short_mp3_paths || [];
  const shortVoicePaths = requestedShortPaths.length > 0 ? requestedShortPaths : manifestShortPaths;
  const shortsResults = [];
  for (let i = 0; i < shortsBlocks.length; i++) {
    const shortMp4Path = resolve(channelDir, `${issueId}_short${i + 1}.mp4`);
    const shortVoicePath = shortVoicePaths[i] || voiceover_mp3_path;
    // Shorts reuse a subset of long's B-roll
    const shortBroll = longBroll.slice(i * 2, i * 2 + 2);
    const shortCmd = buildFfmpegCommand({
      voiceoverPath: shortVoicePath,
      brollClips: shortBroll,
      musicPath: musicTrack.asset_id,
      outputPath: shortMp4Path,
    });
    writeFileSync(shortMp4Path, `STUB MP4 — short ${i + 1} — ${shortCmd}`);

    db.prepare(`
      INSERT INTO videos (video_issue_url, channel, format, mp4_path, duration_s, voice_id_used) VALUES (?, ?, ?, ?, ?, ?)
    `).run(video_issue_url, channel, "short", shortMp4Path, 45, null);

    shortsResults.push({
      mp4_path: shortMp4Path,
      duration_s: 45,
      source_offset_s: 0,
      audio_mode: shortVoicePath === voiceover_mp3_path ? "derived_from_long" : "dedicated_short_tts",
      short_voiceover_mp3_path: shortVoicePath,
    });
  }

  const totalAssets = longBroll.length + 1 + shortsBlocks.length * 0; // shorts reuse, don't add to license count
  db.close();

  console.log(JSON.stringify({
    channel,
    video_issue_url,
    long_form: { mp4_path: longMp4Path, duration_s: 600, assets_used: longBroll.length + 1 },
    shorts: shortsResults,
    license_ids_logged: totalAssets,
    stub_mode: !sbKey || !epKey,
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
