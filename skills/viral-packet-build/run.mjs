#!/usr/bin/env node
// viral-packet-build — synthesize trends signals into packet Issues for Head of Content.
// STATUS: Paperclip Issue-creation stubbed pending endpoint confirmation. SQLite + composition active.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{"channel":"english-learning"}' | node skills/viral-packet-build/run.mjs

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
  CREATE TABLE IF NOT EXISTS packets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_url TEXT UNIQUE,
    channel TEXT,
    status TEXT DEFAULT 'new',
    packet_md TEXT,
    score REAL,
    signal_count INTEGER,
    approved_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`;

function openDb() {
  const path = process.env.FACELESS_MEDIA_DB_PATH || "/home/paperclip/faceless-media.sqlite";
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

function loadBannedTopics(channel) {
  try {
    const path = resolve(repoRoot, "shared", "channels", channel, "brand.md");
    const md = readFileSync(path, "utf8");
    // Match "Topic boundaries" section if present (finance-skeptic has it as section 10).
    const m = md.match(/##\s*\d+\.\s*Topic boundaries[\s\S]*?\n([\s\S]*?)(?=\n##\s|$)/i);
    if (!m) return [];
    return [...m[1].matchAll(/-\s*([^\n(]+?)(?:\s*\(|$)/g)].map(x => x[1].trim().toLowerCase());
  } catch {
    return [];
  }
}

function loadRecentLessons(channel, n = 10) {
  try {
    const path = resolve(repoRoot, "shared", "channels", channel, "lessons.md");
    const md = readFileSync(path, "utf8");
    // Lesson entries are H2 sections; grab the last `n`.
    const sections = [...md.matchAll(/##\s+(.+?)(?=\n##\s|$)/gs)].map(x => x[0]);
    return sections.slice(-n);
  } catch {
    return [];
  }
}

function clusterSignals(signals) {
  // Phase 1: simple keyword-overlap clustering on signal_payload text.
  // Map signal -> set of keywords; cluster signals sharing >=2 keywords.
  const clusters = [];
  for (const sig of signals) {
    const payload = JSON.parse(sig.signal_payload || "{}");
    const text = [payload.keyword, payload.title, payload.query, payload.seed].filter(Boolean).join(" ").toLowerCase();
    const tokens = new Set(text.split(/\W+/).filter(t => t.length >= 4));
    let placed = false;
    for (const cluster of clusters) {
      const overlap = [...cluster.tokens].filter(t => tokens.has(t)).length;
      if (overlap >= 2) {
        cluster.signals.push(sig);
        for (const t of tokens) cluster.tokens.add(t);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ tokens, signals: [sig] });
  }
  return clusters;
}

function scoreCluster(cluster, bannedTopics, lessons) {
  // Banned-topic check first — return 0 if any banned topic matches the cluster's text.
  const allText = cluster.signals.map(s => s.signal_payload || "").join(" ").toLowerCase();
  for (const banned of bannedTopics) {
    if (allText.includes(banned)) return 0;
  }

  // Base score: avg of contributing signal scores
  const avgScore = cluster.signals.reduce((a, s) => a + (s.score || 0), 0) / cluster.signals.length;

  // Cross-source boost: +15 if 2+ signal_source values
  const sources = new Set(cluster.signals.map(s => s.signal_source));
  const sourceBoost = sources.size >= 2 ? 15 : 0;

  // Lesson-citation boost/penalty: scan lesson text for topic-related supportive/warning words
  // Phase 1: very simple positive/negative pattern match.
  let lessonAdjust = 0;
  const lessonText = lessons.join("\n").toLowerCase();
  for (const token of cluster.tokens) {
    if (lessonText.includes(`${token} worked`) || lessonText.includes(`${token} performed`)) lessonAdjust += 5;
    if (lessonText.includes(`${token} failed`) || lessonText.includes(`${token} underperformed`)) lessonAdjust -= 10;
  }

  return Math.max(0, Math.min(100, Math.round(avgScore + sourceBoost + lessonAdjust)));
}

function buildPacketMarkdown(cluster, score, channel) {
  const signals = cluster.signals;
  const topic = signals[0] && signals[0].signal_payload
    ? (JSON.parse(signals[0].signal_payload).keyword || JSON.parse(signals[0].signal_payload).title || "untitled")
    : "untitled";

  return [
    `# Packet: ${topic}`,
    "",
    `**Channel:** \`${channel}\``,
    `**Score:** ${score}`,
    `**Signal count:** ${signals.length}`,
    "",
    "## Evidence",
    ...signals.map(s => `- [${s.signal_source}] score ${s.score || 0} — ${(s.signal_payload || "").substring(0, 200)}`),
    "",
    "## Recommended format",
    "Long-form + 2-3 derived Shorts (default per channel brand.md format mix).",
    "",
    "## Note for Head of Content",
    "Apply POV stress-test before approving. Send back to Trend Analyst if off-brand.",
  ].join("\n");
}

async function createPaperclipIssue(input) {
  // TODO Phase 1 deploy: actual Paperclip API call.
  const apiUrl = process.env.PAPERCLIP_API_URL;
  const apiToken = process.env.PAPERCLIP_API_TOKEN;
  if (!apiUrl || !apiToken) {
    return { status: "stub", reason: "paperclip_api_not_configured", would_create: { title: input.title, labels: input.labels } };
  }
  return { status: "stub", reason: "endpoint_pending_confirmation" };
}

async function main() {
  const raw = readFileSync(0, "utf8") || "{}";
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  const { channel, min_score = 50, max_packets = 5 } = input;
  if (!channel) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "missing_channel" }));
    process.exit(2);
  }

  const db = openDb();
  const signals = db.prepare(`
    SELECT id, channel, signal_source, signal_payload, score
    FROM trends
    WHERE channel = ? AND used_in_packet = 0 AND expired = 0
      AND scored_at > datetime('now', '-24 hours')
    ORDER BY score DESC
  `).all(channel);

  if (signals.length === 0) {
    db.close();
    console.log(JSON.stringify({ channel, packets_created: 0, reason: "no_unused_signals" }));
    return;
  }

  const bannedTopics = loadBannedTopics(channel);
  const lessons = loadRecentLessons(channel, 10);
  const clusters = clusterSignals(signals);

  // Score and sort
  const scored = clusters.map(c => ({ ...c, _score: scoreCluster(c, bannedTopics, lessons) }));
  scored.sort((a, b) => b._score - a._score);
  const eligible = scored.filter(c => c._score >= min_score).slice(0, max_packets);

  const insertPacket = db.prepare(`
    INSERT INTO packets (issue_url, channel, status, packet_md, score, signal_count) VALUES (?, ?, 'pending_approval', ?, ?, ?)
  `);
  const markUsed = db.prepare(`UPDATE trends SET used_in_packet = 1 WHERE id = ?`);

  const created = [];
  for (const cluster of eligible) {
    const md = buildPacketMarkdown(cluster, cluster._score, channel);
    const topic = (cluster.signals[0] && cluster.signals[0].signal_payload)
      ? (JSON.parse(cluster.signals[0].signal_payload).keyword || JSON.parse(cluster.signals[0].signal_payload).title || "untitled")
      : "untitled";

    const issue = await createPaperclipIssue({
      title: `[PACKET] ${channel}: ${topic}`,
      body: md,
      labels: [`channel:${channel}`, `priority:${cluster._score >= 75 ? 1 : cluster._score >= 60 ? 2 : 3}`],
    });

    const issueUrl = issue.issue_id ? `${process.env.PAPERCLIP_API_URL}/issues/${issue.issue_id}` : `stub://packet/${Date.now()}`;
    insertPacket.run(issueUrl, channel, md, cluster._score, cluster.signals.length);
    for (const sig of cluster.signals) markUsed.run(sig.id);
    created.push({ issue_url: issueUrl, topic, score: cluster._score, signal_count: cluster.signals.length });
  }

  db.close();

  console.log(JSON.stringify({
    channel,
    packets_created: created.length,
    packets: created,
    signals_consumed: eligible.reduce((a, c) => a + c.signals.length, 0),
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
