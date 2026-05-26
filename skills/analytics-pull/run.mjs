#!/usr/bin/env node
// analytics-pull — YT Analytics snapshot for a published video at a specific window.
// STATUS: YT Analytics API call stubbed. SQLite writes + RPM computation LIVE.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{"channel":"english-learning","yt_video_id":"abc123","snapshot_window":"72h"}' | node skills/analytics-pull/run.mjs

import { readFileSync } from "node:fs";

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

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    yt_video_id TEXT,
    channel TEXT,
    snapshot_at TEXT DEFAULT (datetime('now')),
    snapshot_window TEXT,
    views INTEGER,
    impressions INTEGER,
    ctr REAL,
    avg_view_duration_s INTEGER,
    avg_view_percentage REAL,
    retention_avg REAL,
    rpm REAL,
    subs_delta INTEGER,
    UNIQUE(yt_video_id, snapshot_window)
  );
`;

function openDb() {
  const path = process.env.FACELESS_MEDIA_DB_PATH || "/home/paperclip/faceless-media.sqlite";
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

const VALID_WINDOWS = new Set(["24h", "48h", "72h", "7d", "30d"]);

function windowToDays(w) {
  switch (w) {
    case "24h": return 1;
    case "48h": return 2;
    case "72h": return 3;
    case "7d": return 7;
    case "30d": return 30;
    default: return 1;
  }
}

async function refreshYouTubeAnalyticsToken(channel) {
  const envKey = `YOUTUBE_OAUTH_REFRESH_TOKEN__${channel.replace(/-/g, "_")}`;
  const refreshToken = process.env[envKey] || process.env[`YOUTUBE_OAUTH_REFRESH_TOKEN__${channel}`];
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) return null;
  // TODO Phase 1 deploy: actual token refresh (same as youtube-upload).
  return "stub-analytics-access-token";
}

async function fetchAnalytics(yt_video_id, snapshot_window, _accessToken) {
  // TODO Phase 1 deploy: actual YT Analytics API call.
  //   const days = windowToDays(snapshot_window);
  //   const today = new Date().toISOString().slice(0, 10);
  //   const startDate = new Date(Date.now() - days*86400000).toISOString().slice(0, 10);
  //   const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${startDate}&endDate=${today}&metrics=views,impressions,ctr,averageViewDuration,averageViewPercentage,estimatedRevenue,subscribersGained,subscribersLost&filters=video%3D%3D${yt_video_id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  //   return parseRows(await res.json());
  // Synthetic metrics scaled by window (longer window = more accumulated)
  const days = windowToDays(snapshot_window);
  return {
    _stub: true,
    views: Math.round(800 * days * (0.8 + Math.random() * 0.4)),
    impressions: Math.round(12000 * days * (0.8 + Math.random() * 0.4)),
    ctr: 0.05 + Math.random() * 0.04,
    avg_view_duration_s: Math.round(280 + Math.random() * 200),
    avg_view_percentage: 0.42 + Math.random() * 0.18,
    estimatedRevenue: Math.round((days * 6.5 * (0.7 + Math.random() * 0.6)) * 100) / 100,
    subs_delta: Math.round(8 * days * (0.6 + Math.random() * 0.8)),
  };
}

async function main() {
  const raw = readFileSync(0, "utf8") || "{}";
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  const { channel, yt_video_id, snapshot_window } = input;
  if (!channel || !yt_video_id || !snapshot_window) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "missing_required_field", required: ["channel", "yt_video_id", "snapshot_window"] }));
    process.exit(2);
  }
  if (!VALID_WINDOWS.has(snapshot_window)) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_window", got: snapshot_window, allowed: Array.from(VALID_WINDOWS) }));
    process.exit(2);
  }

  const accessToken = await refreshYouTubeAnalyticsToken(channel);
  const raw_metrics = await fetchAnalytics(yt_video_id, snapshot_window, accessToken);

  const rpm = raw_metrics.views > 0 ? (raw_metrics.estimatedRevenue / raw_metrics.views) * 1000 : 0;

  const db = openDb();
  db.prepare(`
    INSERT OR REPLACE INTO performance (
      yt_video_id, channel, snapshot_window,
      views, impressions, ctr, avg_view_duration_s,
      avg_view_percentage, retention_avg, rpm, subs_delta
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    yt_video_id, channel, snapshot_window,
    raw_metrics.views, raw_metrics.impressions, raw_metrics.ctr, raw_metrics.avg_view_duration_s,
    raw_metrics.avg_view_percentage, raw_metrics.avg_view_percentage, Math.round(rpm * 100) / 100, raw_metrics.subs_delta
  );
  db.close();

  console.log(JSON.stringify({
    channel,
    yt_video_id,
    snapshot_window,
    metrics: {
      views: raw_metrics.views,
      impressions: raw_metrics.impressions,
      ctr: Math.round(raw_metrics.ctr * 10000) / 10000,
      avg_view_duration_s: raw_metrics.avg_view_duration_s,
      avg_view_percentage: Math.round(raw_metrics.avg_view_percentage * 1000) / 1000,
      rpm: Math.round(rpm * 100) / 100,
      subs_delta: raw_metrics.subs_delta,
    },
    stub_mode: !accessToken,
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
