#!/usr/bin/env node
// copyright-preflight — verify every asset in a video has a license_id registered in channel's asset-licenses.json.
// STATUS: LIVE. No API call needed.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{"channel":"english-learning","video_issue_url":"..."}' | node skills/copyright-preflight/run.mjs

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

function openDb() {
  const path = process.env.FACELESS_MEDIA_DB_PATH || "/home/paperclip/faceless-media.sqlite";
  return new DatabaseSync(path);
}

function loadLicenseRegistry(channel) {
  const path = resolve(repoRoot, "shared", "channels", channel, "asset-licenses.json");
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw);
  // Returns a Set of valid license_ids for quick membership check.
  const licenses = Array.isArray(data.licenses) ? data.licenses : [];
  return new Set(licenses.map(l => typeof l === "string" ? l : l.license_id).filter(Boolean));
}

async function main() {
  const raw = readFileSync(0, "utf8") || "{}";
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  const { channel, video_issue_url } = input;
  if (!channel || !video_issue_url) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "missing_required_field", required: ["channel", "video_issue_url"] }));
    process.exit(2);
  }

  let registry;
  try {
    registry = loadLicenseRegistry(channel);
  } catch (e) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "registry_unreadable", channel, detail: e.message }));
    process.exit(2);
  }

  const db = openDb();
  const assetUses = db.prepare(`
    SELECT asset_id, license_id, source FROM asset_uses WHERE video_issue_url = ?
  `).all(video_issue_url);

  if (assetUses.length === 0) {
    db.close();
    console.error(JSON.stringify({ error: "decision-needed", reason: "no_assets_logged_for_video", video_issue_url, channel }));
    process.exit(2);
  }

  const missingOrInvalid = [];
  for (const a of assetUses) {
    if (!a.license_id) {
      missingOrInvalid.push({ asset_id: a.asset_id, source: a.source, issue: "license_id is null" });
      continue;
    }
    if (!registry.has(a.license_id)) {
      missingOrInvalid.push({ asset_id: a.asset_id, source: a.source, issue: `license_id ${a.license_id} not in registry` });
    }
  }

  const pass = missingOrInvalid.length === 0;

  // Update videos table
  db.prepare(`
    UPDATE videos SET copyright_preflight_pass = ? WHERE video_issue_url = ? AND channel = ?
  `).run(pass ? 1 : 0, video_issue_url, channel);
  db.close();

  if (pass) {
    console.log(JSON.stringify({
      channel,
      video_issue_url,
      pass: true,
      assets_checked: assetUses.length,
      licenses_verified: assetUses.length,
    }));
  } else {
    console.log(JSON.stringify({
      channel,
      video_issue_url,
      pass: false,
      assets_checked: assetUses.length,
      missing_or_invalid: missingOrInvalid,
    }));
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
