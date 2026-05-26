#!/usr/bin/env node
// ab-thumbnail-test — configure YT native A/B rotation with losing thumbnail variants.
// STATUS: SQLite logging + ineligibility fallback LIVE. YT A/B API call stubbed.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{...}' | node skills/ab-thumbnail-test/run.mjs

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
  CREATE TABLE IF NOT EXISTS ab_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    yt_video_id TEXT,
    channel TEXT,
    variants_json TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    scheduled_check_at TEXT,
    eligible INTEGER,
    winner_variant_index INTEGER,
    winner_resolved_at TEXT
  );
`;

function openDb() {
  const path = process.env.FACELESS_MEDIA_DB_PATH || "/home/paperclip/faceless-media.sqlite";
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

async function attemptYouTubeABConfig(_yt_video_id, _variants, _channel) {
  // TODO Phase 1 deploy: actual YT Studio A/B test API call (if eligible) or graceful skip.
  // The eligibility check is dynamic; YT returns 403 if channel not eligible.
  // Stub returns eligible=false so downstream knows test wasn't actually configured.
  return { _stub: true, eligible: false, reason: "channel_eligibility_unknown_in_stub" };
}

function plusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

async function main() {
  const raw = readFileSync(0, "utf8") || "{}";
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  const { channel, yt_video_id, video_issue_url } = input;
  if (!channel || !yt_video_id || !video_issue_url) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "missing_required_field", required: ["channel", "yt_video_id", "video_issue_url"] }));
    process.exit(2);
  }

  const db = openDb();
  const video = db.prepare(`
    SELECT thumbnail_variants_json, selected_thumbnail_index FROM videos WHERE video_issue_url = ? AND channel = ? AND format = 'long'
  `).get(video_issue_url, channel);

  if (!video || !video.thumbnail_variants_json) {
    db.close();
    console.error(JSON.stringify({ error: "decision-needed", reason: "no_variants_found_for_video", video_issue_url }));
    process.exit(2);
  }

  const variants = JSON.parse(video.thumbnail_variants_json);
  const selectedIdx = video.selected_thumbnail_index ?? 0;
  // Pick up to 2 losing variants to A/B-test against the primary
  const losers = variants.filter((_, i) => i !== selectedIdx).slice(0, 2);

  const apiResult = await attemptYouTubeABConfig(yt_video_id, losers, channel);
  const eligible = apiResult.eligible === true;
  const scheduledCheck = plusDays(14);

  db.prepare(`
    INSERT INTO ab_tests (yt_video_id, channel, variants_json, scheduled_check_at, eligible)
    VALUES (?, ?, ?, ?, ?)
  `).run(yt_video_id, channel, JSON.stringify(losers), scheduledCheck, eligible ? 1 : 0);
  db.close();

  if (eligible) {
    console.log(JSON.stringify({
      channel,
      yt_video_id,
      ab_test_configured: true,
      variants_tested: losers.length,
      scheduled_check_at: scheduledCheck,
    }));
  } else {
    console.log(JSON.stringify({
      channel,
      yt_video_id,
      ab_test_configured: false,
      reason: apiResult.reason || "channel_not_eligible_for_native_ab",
      variants_logged: losers.length,
      intended_test_recorded: true,
    }));
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
