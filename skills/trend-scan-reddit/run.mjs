#!/usr/bin/env node
// trend-scan-reddit — Reddit API scan for emerging topics per channel's subreddit list.
// STATUS: OAuth token fetch stubbed pending REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET.
// SQLite writes ARE active for downstream pipeline testing.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{"channel":"finance-skeptic"}' | node skills/trend-scan-reddit/run.mjs

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

function loadSubredditsFromBrand(channel) {
  try {
    const path = resolve(repoRoot, "shared", "channels", channel, "brand.md");
    const md = readFileSync(path, "utf8");
    const m = md.match(/##\s*\d+\.\s*Subreddit list[\s\S]*?\n([\s\S]*?)(?=\n##\s|$)/);
    if (!m) return [];
    return [...m[1].matchAll(/-\s*r\/([A-Za-z0-9_]+)/g)].map(x => x[1]);
  } catch {
    return [];
  }
}

async function getRedditOAuthToken() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;

  // TODO Phase 1 deploy: actual OAuth fetch.
  //   const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  //   const res = await fetch("https://www.reddit.com/api/v1/access_token", {
  //     method: "POST",
  //     headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "faceless-media/0.1" },
  //     body: "grant_type=client_credentials",
  //   });
  //   const j = await res.json();
  //   return j.access_token;
  return null;
}

async function fetchSubredditEndpoint(subreddit, endpoint, token) {
  // endpoint = "new" | "hot"
  if (!token) {
    return {
      _stub: true,
      reason: "no_reddit_token",
      synthetic_posts: [
        { id: `stub-${subreddit}-1`, title: `[${subreddit}] synthetic post A`, score: 250, num_comments: 89, age_hours: 6 },
        { id: `stub-${subreddit}-2`, title: `[${subreddit}] synthetic post B`, score: 1200, num_comments: 45, age_hours: 18 },
      ],
    };
  }
  // TODO Phase 1 deploy: actual API fetch.
  //   const res = await fetch(`https://oauth.reddit.com/r/${subreddit}/${endpoint}?limit=25`, {
  //     headers: { Authorization: `Bearer ${token}`, "User-Agent": "faceless-media/0.1" },
  //   });
  //   return await res.json();
  return { _stub: true, reason: "api_call_not_yet_wired" };
}

function commentVelocityScore(score, num_comments, age_hours) {
  if (!age_hours || age_hours <= 0) return 0;
  const cph = num_comments / age_hours;
  const ratio = score > 0 ? num_comments / score : 0;
  // Comment velocity above 5 cph + comment/upvote ratio above 0.2 = high-controversy = high signal.
  const cphScore = Math.min(50, Math.round(cph * 10));
  const ratioScore = Math.min(50, Math.round(ratio * 250));
  return cphScore + ratioScore;
}

async function main() {
  const raw = readFileSync(0, "utf8") || "{}";
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  const { channel, subreddits: inputSubs } = input;
  if (!channel) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "missing_channel" }));
    process.exit(2);
  }

  const subs = inputSubs && inputSubs.length > 0
    ? inputSubs
    : loadSubredditsFromBrand(channel);

  if (subs.length === 0) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "no_subreddits_resolved", channel }));
    process.exit(2);
  }

  const token = await getRedditOAuthToken();
  const db = openDb();
  const insert = db.prepare(`
    INSERT INTO trends (channel, signal_source, signal_payload, score) VALUES (?, ?, ?, ?)
  `);

  let signalsAdded = 0;
  const perSubreddit = {};

  for (const sub of subs) {
    const newPosts = (await fetchSubredditEndpoint(sub, "new", token)).synthetic_posts || [];
    const hotPosts = (await fetchSubredditEndpoint(sub, "hot", token)).synthetic_posts || [];
    const all = [...newPosts, ...hotPosts];

    let highVelocity = 0;
    for (const post of all) {
      const score = commentVelocityScore(post.score, post.num_comments, post.age_hours);
      if (score >= 50) highVelocity++;
      insert.run(channel, "reddit", JSON.stringify({ subreddit: sub, ...post }), score);
      signalsAdded++;
    }
    perSubreddit[sub] = { posts_scanned: all.length, high_velocity_count: highVelocity };
  }

  db.close();

  console.log(JSON.stringify({
    channel,
    signals_added: signalsAdded,
    per_subreddit: perSubreddit,
    oauth_resolved: !!token,
    stub_mode: !token,
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
