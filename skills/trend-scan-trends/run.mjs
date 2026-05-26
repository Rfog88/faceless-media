#!/usr/bin/env node
// trend-scan-trends — Google Trends rising-queries scan per channel keyword seeds.
// STATUS: real fetch stubbed; SQLite writes synthetic signals for downstream testing.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{"channel":"english-learning"}' | node skills/trend-scan-trends/run.mjs

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
  CREATE TABLE IF NOT EXISTS trends_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT,
    cached_at TEXT DEFAULT (datetime('now'))
  );
`;

function openDb() {
  const path = process.env.FACELESS_MEDIA_DB_PATH || "/home/paperclip/faceless-media.sqlite";
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

function loadKeywordsFromBrand(channel) {
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

function getCached(db, key, maxAgeHours = 4) {
  const row = db.prepare(`
    SELECT payload FROM trends_cache
    WHERE cache_key = ? AND cached_at > datetime('now', '-' || ? || ' hours')
  `).get(key, maxAgeHours);
  return row ? JSON.parse(row.payload) : null;
}

function setCached(db, key, payload) {
  db.prepare(`INSERT OR REPLACE INTO trends_cache (cache_key, payload, cached_at) VALUES (?, ?, datetime('now'))`)
    .run(key, JSON.stringify(payload));
}

async function fetchRisingQueries(keyword) {
  // TODO Phase 1 deploy: choose one of:
  //   1. google-trends-api npm package — googleTrends.relatedQueries({ keyword })
  //   2. SerpAPI Google Trends endpoint (paid, reliable)
  //   3. Direct unofficial endpoint scrape
  // For now return synthetic structured response.
  return {
    _stub: true,
    reason: "trends_fetch_not_yet_wired",
    rising: [
      { query: `${keyword} explained`, breakout_score: 75 },
      { query: `${keyword} for beginners`, breakout_score: 45 },
      { query: `${keyword} 2026`, breakout_score: 32 },
      { query: `best ${keyword}`, breakout_score: 28 },
    ],
  };
}

async function main() {
  const raw = readFileSync(0, "utf8") || "{}";
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  const { channel, seed_keywords: inputKeywords } = input;
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

  const db = openDb();
  const insert = db.prepare(`
    INSERT INTO trends (channel, signal_source, signal_payload, score) VALUES (?, ?, ?, ?)
  `);

  let signalsAdded = 0;
  const perKeyword = {};

  for (const kw of keywords) {
    const cacheKey = `gtrends:${channel}:${kw}`;
    let payload = getCached(db, cacheKey);
    if (!payload) {
      payload = await fetchRisingQueries(kw);
      setCached(db, cacheKey, payload);
    }
    const rising = payload.rising || [];
    let topBreakout = null;
    for (const item of rising) {
      if (!topBreakout || item.breakout_score > topBreakout.breakout_score) topBreakout = item;
      insert.run(channel, "gtrends", JSON.stringify({ seed: kw, ...item }), item.breakout_score);
      signalsAdded++;
    }
    perKeyword[kw] = { rising_count: rising.length, top_breakout: topBreakout?.query || null };
  }

  db.close();

  console.log(JSON.stringify({
    channel,
    signals_added: signalsAdded,
    per_keyword: perKeyword,
    stub_mode: true,
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
