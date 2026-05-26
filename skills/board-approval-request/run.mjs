#!/usr/bin/env node
// board-approval-request — file per-video Board approval Issue for pre-graduation channels.
// Implements progressive automation gate (N=10 approved + K=5 trailing clean to graduate, M=3 hold cap).
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{...}' | node skills/board-approval-request/run.mjs

import { readFileSync } from "node:fs";
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
const GATE_N = 10;
const GATE_K = 5;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS channels (
    slug TEXT PRIMARY KEY,
    niche TEXT,
    launch_date TEXT,
    gate_status TEXT DEFAULT 'gated',
    n_approved INTEGER DEFAULT 0,
    last_k_clean INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS board_approval_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_url TEXT UNIQUE,
    channel TEXT,
    status TEXT,                       -- pending | approved | edits | rejected
    artifact_json TEXT,                -- full submitted artifact
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT
  );
`;

function openDb() {
  const path = process.env.FACELESS_MEDIA_DB_PATH || "/home/paperclip/faceless-media.sqlite";
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

function getChannel(db, slug) {
  return db.prepare(`SELECT * FROM channels WHERE slug = ?`).get(slug);
}

function holdQueueDepth(db, slug) {
  return db.prepare(`SELECT COUNT(*) AS n FROM board_approval_queue WHERE channel = ? AND status = 'pending'`).get(slug)?.n || 0;
}

function enqueue(db, issueUrl, channel, artifact) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO board_approval_queue (issue_url, channel, status, artifact_json)
    VALUES (?, ?, 'pending', ?)
  `);
  return stmt.run(issueUrl, channel, JSON.stringify(artifact));
}

async function callBoardNotify(payload) {
  const proc = spawnSync(
    "node",
    [resolve(repoRoot, "skills", "board-notify", "run.mjs")],
    { input: JSON.stringify(payload), encoding: "utf8" }
  );
  if (proc.status !== 0) return { status: "error", stderr: proc.stderr };
  try { return JSON.parse(proc.stdout); } catch { return { status: "ok-unparsed", raw: proc.stdout }; }
}

async function createPaperclipIssue(input) {
  // TODO Phase 1 deploy: replace with actual Paperclip API call.
  // Expected shape:
  //   POST {PAPERCLIP_API_URL}/api/issues
  //   { title, body, assigneeRole: "board", labels: ["pending_board_approval", channel], parentId: video_issue_url }
  const apiUrl = process.env.PAPERCLIP_API_URL;
  const apiToken = process.env.PAPERCLIP_API_TOKEN;
  if (!apiUrl || !apiToken) {
    return { status: "stub", reason: "paperclip_api_not_configured", would_create: input };
  }
  return { status: "stub", reason: "endpoint_pending_confirmation", would_create: input };
}

function buildApprovalBody(input) {
  return [
    `**Channel:** \`${input.channel}\``,
    `**Source Issue:** ${input.issue_url}`,
    `**Title:** ${input.video_title}`,
    "",
    `**Script:** ${input.script_url}`,
    `**Voiceover sample (30s):** ${input.voiceover_sample_url}`,
    `**Thumbnails (selected: #${input.selected_thumbnail_index + 1}):**`,
    ...input.thumbnail_urls.map((u, i) => `- ${i === input.selected_thumbnail_index ? "✅ " : ""}${u}`),
    "",
    `**Description preview:** ${(input.video_description || "").substring(0, 300)}${(input.video_description || "").length > 300 ? "..." : ""}`,
    `**Tags:** ${(input.video_tags || []).join(", ")}`,
    "",
    `**AI disclosure set:** ${input.disclosure_set ? "✅ TRUE" : "❌ FALSE"}`,
    `**Copyright preflight:** ${input.copyright_preflight_pass ? "✅ PASS" : "❌ FAIL"} (${input.asset_license_summary || "n/a"})`,
    "",
    `**Predicted CTR:** ${(input.predicted_ctr * 100).toFixed(2)}%`,
    `**Predicted retention:** ${(input.predicted_retention * 100).toFixed(1)}%`,
    "",
    "**Board response options:**",
    "- React 👍 or comment `APPROVE` to schedule upload",
    "- Comment `APPROVE-WITH-EDITS` followed by your edit (resets K-streak)",
    "- Comment `REJECT: <reason>` to kill (lessons.md entry created)",
  ].join("\n");
}

async function main() {
  const raw = readFileSync(0, "utf8");
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  // Hard validations
  if (!input.disclosure_set) {
    console.error(JSON.stringify({ status: "refused", reason: "disclosure_not_set" }));
    process.exit(4);
  }
  if (!input.copyright_preflight_pass) {
    console.error(JSON.stringify({ status: "refused", reason: "copyright_preflight_failed" }));
    process.exit(4);
  }
  if (!input.channel || !input.issue_url) {
    console.error(JSON.stringify({ status: "refused", reason: "missing_channel_or_issue_url" }));
    process.exit(2);
  }

  const db = openDb();
  const channel = getChannel(db, input.channel);
  if (!channel) {
    db.close();
    console.error(JSON.stringify({ status: "refused", reason: "channel_not_registered", channel: input.channel }));
    process.exit(2);
  }

  // Graduated channel — skip
  if (channel.gate_status === "graduated") {
    db.close();
    console.log(JSON.stringify({ status: "skip", reason: "channel_graduated", channel: input.channel }));
    return;
  }

  // Hold queue cap
  const depth = holdQueueDepth(db, input.channel);
  if (depth >= HOLD_QUEUE_CAP) {
    db.close();
    console.log(JSON.stringify({ status: "refused", reason: "hold_queue_at_cap", queue_depth: depth, cap: HOLD_QUEUE_CAP }));
    return;
  }

  // Enqueue
  enqueue(db, input.issue_url, input.channel, input);
  const depthAfter = holdQueueDepth(db, input.channel);
  db.close();

  // File Paperclip Issue (stub) + Discord ping
  const body = buildApprovalBody(input);
  const issue = await createPaperclipIssue({
    title: `[APPROVAL] ${input.channel}: ${input.video_title}`,
    body,
    labels: ["pending_board_approval", `channel:${input.channel}`],
    parentId: input.issue_url,
  });

  const notify = await callBoardNotify({
    tier: 1,
    title: `Approval needed: ${input.channel} (${depthAfter}/${HOLD_QUEUE_CAP} queued)`,
    body: `**${input.video_title}**\n\nGate progress: ${channel.n_approved}/${GATE_N} approved, ${channel.last_k_clean}/${GATE_K} clean.\n\nReview the artifact in the Issue.`,
    issue_url: issue.issue_id ? `${process.env.PAPERCLIP_API_URL}/issues/${issue.issue_id}` : input.issue_url,
    sms_on_tier_2: false,
  });

  console.log(JSON.stringify({
    status: "submitted",
    channel: input.channel,
    queue_depth_after: depthAfter,
    issue,
    notify,
    gate: { n_approved: channel.n_approved, last_k_clean: channel.last_k_clean, gate_n: GATE_N, gate_k: GATE_K },
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
