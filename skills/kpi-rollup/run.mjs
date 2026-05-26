#!/usr/bin/env node
// kpi-rollup — morning digest of yesterday's Faceless Media metrics.
// Posts via board-notify Tier 0 only if delta-worthy OR a channel is at hold-queue cap.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: node skills/kpi-rollup/run.mjs [--window daily|weekly]

import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
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

const HOLD_QUEUE_CAP = 3;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS channels (
    slug TEXT PRIMARY KEY,
    niche TEXT,
    launch_date TEXT,
    gate_status TEXT DEFAULT 'gated',
    n_approved INTEGER DEFAULT 0,
    last_k_clean INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS uploads (
    yt_video_id TEXT PRIMARY KEY,
    issue_url TEXT,
    channel TEXT,
    format TEXT,
    published_at TEXT,
    disclosure_set INTEGER,
    copyright_preflight_pass INTEGER
  );
  CREATE TABLE IF NOT EXISTS performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    yt_video_id TEXT,
    channel TEXT,
    snapshot_at TEXT,
    snapshot_window TEXT,
    ctr REAL,
    retention_avg REAL,
    rpm REAL,
    views INTEGER,
    subs_delta INTEGER
  );
  CREATE TABLE IF NOT EXISTS board_approval_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_url TEXT UNIQUE,
    channel TEXT,
    status TEXT,                  -- pending | approved | edits | rejected
    created_at TEXT DEFAULT (datetime('now'))
  );
`;

function openDb() {
  const path = process.env.FACELESS_MEDIA_DB_PATH || "/home/paperclip/faceless-media.sqlite";
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

function listChannels(db) {
  return db.prepare(`SELECT slug, niche, gate_status, n_approved, last_k_clean FROM channels ORDER BY slug`).all();
}

function channelMetrics(db, channelSlug, hours) {
  const published = db.prepare(`
    SELECT COUNT(*) AS n
    FROM uploads
    WHERE channel = ? AND published_at > datetime('now', '-' || ? || ' hours')
  `).get(channelSlug, hours)?.n || 0;

  const perf7d = db.prepare(`
    SELECT AVG(ctr) AS ctr_avg, AVG(retention_avg) AS ret_avg, SUM(subs_delta) AS subs_delta
    FROM performance
    WHERE channel = ?
      AND snapshot_window = '72h'
      AND snapshot_at > datetime('now', '-7 days')
  `).get(channelSlug);

  const holdQueue = db.prepare(`
    SELECT COUNT(*) AS n FROM board_approval_queue
    WHERE channel = ? AND status = 'pending'
  `).get(channelSlug)?.n || 0;

  return {
    published,
    ctr_7d: perf7d?.ctr_avg || 0,
    retention_7d: perf7d?.ret_avg || 0,
    subs_delta_7d: perf7d?.subs_delta || 0,
    hold_queue: holdQueue,
  };
}

function priorAverages(db, channelSlug, hours, days) {
  const row = db.prepare(`
    SELECT AVG(daily.n) AS published_avg
    FROM (
      SELECT date(published_at) AS d, COUNT(*) AS n
      FROM uploads
      WHERE channel = ?
        AND published_at > datetime('now', '-' || ? || ' days')
        AND published_at < datetime('now', '-' || ? || ' hours')
      GROUP BY 1
    ) daily
  `).get(channelSlug, days, hours);
  return { published_avg: row?.published_avg || 0 };
}

function deltaPct(actual, avg) {
  const a = parseFloat(avg) || 0;
  if (a === 0) return actual > 0 ? 100 : 0;
  return ((parseFloat(actual) - a) / a) * 100;
}

function crossChannel(db, hours) {
  const total = db.prepare(`
    SELECT COUNT(*) AS n FROM uploads WHERE published_at > datetime('now', '-' || ? || ' hours')
  `).get(hours)?.n || 0;

  const graduated = db.prepare(`
    SELECT slug FROM channels WHERE gate_status = 'graduated'
  `).all().map(r => r.slug);

  return { total_published: total, graduated_channels: graduated };
}

async function postDigest(payload) {
  const proc = spawnSync(
    "node",
    [resolve(repoRoot, "skills", "board-notify", "run.mjs")],
    { input: JSON.stringify(payload), encoding: "utf8" }
  );
  if (proc.status !== 0) return { status: "error", stderr: proc.stderr };
  return { status: "ok" };
}

async function main() {
  const { values } = parseArgs({ options: { window: { type: "string", default: "daily" } } });
  const isWeekly = values.window === "weekly";
  const hours = isWeekly ? 168 : 24;
  const baselineDays = isWeekly ? 28 : 7;

  const db = openDb();
  const channels = listChannels(db);

  const perChannel = channels.map(c => {
    const m = channelMetrics(db, c.slug, hours);
    const avg = priorAverages(db, c.slug, hours, baselineDays);
    return {
      slug: c.slug,
      gate_status: c.gate_status,
      n_approved: c.n_approved,
      last_k_clean: c.last_k_clean,
      ...m,
      published_delta_pct: deltaPct(m.published, avg.published_avg),
    };
  });

  const cross = crossChannel(db, hours);
  db.close();

  // Trigger conditions: any channel >15% delta on published, any hold queue at/over cap, gate graduation, no published in 48h+
  const meaningful = perChannel.some(c =>
    Math.abs(c.published_delta_pct) >= 15 ||
    c.hold_queue >= HOLD_QUEUE_CAP
  ) || cross.graduated_channels.length > 0;

  if (!meaningful) {
    console.log(JSON.stringify({ posted: false, reason: "no_meaningful_delta", channels: perChannel, cross }));
    return;
  }

  const lines = [];
  for (const c of perChannel) {
    const gateLine = c.gate_status === "graduated"
      ? "✅ graduated"
      : `🔒 ${c.n_approved}/10 approved, ${c.last_k_clean}/5 clean`;
    const queueLine = c.hold_queue >= HOLD_QUEUE_CAP ? ` ⚠️ HOLD QUEUE AT CAP (${c.hold_queue})` : c.hold_queue > 0 ? ` (queue: ${c.hold_queue})` : "";
    lines.push(`**${c.slug}** — ${gateLine}${queueLine}`);
    lines.push(`- published: ${c.published}${c.published_delta_pct !== null ? ` (${c.published_delta_pct > 0 ? "+" : ""}${c.published_delta_pct.toFixed(0)}% vs ${baselineDays}d avg)` : ""}`);
    lines.push(`- 7d CTR: ${(c.ctr_7d * 100).toFixed(2)}%, retention: ${(c.retention_7d * 100).toFixed(1)}%, subs Δ: ${c.subs_delta_7d}`);
  }
  lines.push("");
  lines.push(`**Cross-channel:** ${cross.total_published} published this window. Graduated: ${cross.graduated_channels.length > 0 ? cross.graduated_channels.join(", ") : "none yet"}.`);

  const result = await postDigest({
    tier: 0,
    title: `Faceless Media ${isWeekly ? "weekly" : "daily"} KPI rollup`,
    body: lines.join("\n"),
  });

  console.log(JSON.stringify({ posted: true, channels: perChannel, cross, notify: result }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
