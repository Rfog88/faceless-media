#!/usr/bin/env node
// trend-scan-youtube — YT Data API scan for competitor activity + views/hour spikes per channel.
// STATUS: HTTP API call stubbed pending YOUTUBE_API_KEY__<channel> being provisioned.
// SQLite writes ARE active so downstream pipeline can test.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{"channel":"english-learning"}' | node skills/trend-scan-youtube/run.mjs

import { readFileSync } from "node:fs";
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
  CREATE TABLE IF NOT EXISTS trends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,
    signal_source TEXT NOT NULL,
    signal_payload TEXT,
    scored_at TEXT DEFAULT (datetime('now')),
    score REAL,
    used_in_packet INTEGER DEFAULT 0,
    expired INTEGER DEFAULT 0
  );
`;

function openDb() {
  const path = process.env.FACELESS_MEDIA_DB_PATH || "/home/paperclip/faceless-media.sqlite";
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

function loadKeywordsFromBrand(channel) {
  // Brand files live at <repoRoot>/shared/channels/<channel>/brand.md.
  // Parse the "## 6. Keyword seeds" section. Minimal regex parse; failure is non-fatal.
  try {
    const path = resolve(repoRoot, "shared", "channels", channel, "brand.md");
    const md = readFileSync(path, "utf8");
    const m = md.match(/##\s*\d+\.\s*Keyword seeds[\s\S]*?\n([\s\S]*?)(?=\n##\s|$)/);
    if (!m) return [];
    return [...m[1].matchAll(/-\s*"([^"]+)"/g)].map(x => x[1]);
  } catch {
    return [];
  }
}

async function callYouTubeSearchList(keyword, apiKey) {
  // TODO Phase 1 deploy: replace with actual fetch call.
  //   const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(keyword)}&publishedAfter=${dateMinus24h}&order=viewCount&maxResults=10&key=${apiKey}`;
  //   const res = await fetch(url);
  //   return await res.json();
  if (!apiKey) {
    return {
      _stub: true,
      reason: "no_yt_api_key",
      synthetic_items: [
        { videoId: "stub-1", title: `${keyword} — synthetic example A`, viewCount: 12000, ageHours: 18 },
        { videoId: "stub-2", title: `${keyword} — synthetic example B`, viewCount: 4500, ageHours: 6 },
      ],
    };
  }
  return { _stub: true, reason: "api_call_not_yet_wired", apiKey: "redacted" };
}

function viewsPerHour(viewCount, ageHours) {
  if (!ageHours || ageHours <= 0) return viewCount;
  return Math.round(viewCount / ageHours);
}

function scoreSignal(vph, niche_baseline = 50) {
  // Simple linear score: views/hour normalized to baseline. 3x baseline = score 100, 1x = 33.
  const raw = (vph / niche_baseline) * 33;
  return Math.min(100, Math.round(raw));
}

function allowStubTrendSignals() {
  return process.env.ALLOW_STUB_TREND_SIGNALS === "1";
}

function refuseStubTrendSignals(source, reason) {
  if (allowStubTrendSignals()) return;
  console.error(JSON.stringify({
    status: "blocked",
    error: "decision-needed",
    reason: `${source}_stub_mode`,
    stub_reason: reason,
    unblock_owner: "CTO",
    action: "Wire the live trend source API or rerun with ALLOW_STUB_TREND_SIGNALS=1 only for isolated local tests.",
  }));
  process.exit(4);
}

async function main() {
  const raw = readFileSync(0, "utf8") || "{}";
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  const { channel, keywords: inputKeywords } = input;
  if (!channel) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "missing_channel" }));
    process.exit(2);
  }

  const keywords = inputKeywords && inputKeywords.length > 0
    ? inputKeywords
    : loadKeywordsFromBrand(channel);

  if (keywords.length === 0) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "no_keywords_resolved", channel }));
    process.exit(2);
  }

  // Per-channel API key resolution
  const envKey = `YOUTUBE_API_KEY__${channel.replace(/-/g, "_")}`;
  const apiKey = process.env[envKey] || process.env[`YOUTUBE_API_KEY__${channel}`];

  const db = openDb();
  const insert = db.prepare(`
    INSERT INTO trends (channel, signal_source, signal_payload, score) VALUES (?, ?, ?, ?)
  `);

  let signalsAdded = 0;
  const perKeyword = {};
  let quotaUnitsUsed = 0;

  for (const kw of keywords) {
    const search = await callYouTubeSearchList(kw, apiKey);
    if (search._stub) refuseStubTrendSignals("youtube", search.reason);
    quotaUnitsUsed += 100;  // search.list cost

    const items = search.synthetic_items || search.items || [];
    const spikes = [];
    for (const item of items) {
      const vph = viewsPerHour(item.viewCount, item.ageHours);
      const score = scoreSignal(vph);
      if (score >= 50) spikes.push({ ...item, vph, score });
      insert.run(channel, "youtube", JSON.stringify({ keyword: kw, _stub: !!search._stub, ...item, vph }), score);
      signalsAdded++;
    }
    perKeyword[kw] = { videos_scanned: items.length, spikes_detected: spikes.length };
    quotaUnitsUsed += items.length;  // videos.list cost (1 per item)
  }

  db.close();

  console.log(JSON.stringify({
    channel,
    signals_added: signalsAdded,
    per_keyword: perKeyword,
    quota_units_used: quotaUnitsUsed,
    api_key_resolved: !!apiKey,
    stub_mode: !apiKey,
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
