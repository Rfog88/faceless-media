#!/usr/bin/env node
// thumbnail-score — heuristic scoring of thumbnail variants. No API call needed.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{"channel":"finance-skeptic","video_issue_url":"..."}' | node skills/thumbnail-score/run.mjs

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

function openDb() {
  const path = process.env.FACELESS_MEDIA_DB_PATH || "/home/paperclip/faceless-media.sqlite";
  return new DatabaseSync(path);
}

const CHANNEL_STRATEGY_WEIGHTS = {
  "finance-skeptic": {
    "high-contrast-minimalist": 25,
    "object-focal": 22,
    "text-dominant": 18,
    "face-focal": 12,
  },
  "english-learning": {
    "text-dominant": 25,
    "face-focal": 22,
    "object-focal": 18,
    "high-contrast-minimalist": 14,
  },
};

const CHANNEL_BRAND_MOTIFS = {
  "finance-skeptic": ["red strike-through", "magnifying glass", "follow the money", "dollar bill", "chart"],
  "english-learning": ["speech-bubble", "yellow highlighter", "word-highlight", "speech bubble", "icon"],
};

function scoreTextDensity(overlayText) {
  const words = (overlayText || "").split(/\s+/).filter(Boolean).length;
  if (words >= 3 && words <= 7) return 25;
  if (words >= 2 && words <= 9) return 18;
  if (words >= 1 && words <= 12) return 10;
  return 4;
}

function scoreStrategy(channel, strategy) {
  const weights = CHANNEL_STRATEGY_WEIGHTS[channel];
  if (!weights) return 12; // unknown channel default
  return weights[strategy] ?? 8;
}

function scoreBrandMotif(channel, promptUsed) {
  const motifs = CHANNEL_BRAND_MOTIFS[channel] || [];
  const lower = (promptUsed || "").toLowerCase();
  const hits = motifs.filter(m => lower.includes(m.toLowerCase())).length;
  if (hits >= 2) return 25;
  if (hits === 1) return 18;
  return 8;
}

function scoreCuriosity(overlayText) {
  const txt = (overlayText || "").toLowerCase();
  const hasQuestion = /\?/.test(txt);
  const hasNumber = /\b\d[\d,.]*(%|\$)?/.test(txt) || /\$\d/.test(txt);
  const contrarianWords = ["who", "why", "actually", "lie", "myth", "wrong", "really"];
  const hasContrarian = contrarianWords.some(w => txt.includes(w));

  let score = 0;
  if (hasQuestion) score += 10;
  if (hasNumber) score += 10;
  if (hasContrarian) score += 8;
  return Math.min(25, score);
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

  const db = openDb();
  const row = db.prepare(`
    SELECT thumbnail_variants_json FROM videos WHERE video_issue_url = ? AND channel = ? AND format = 'long'
  `).get(video_issue_url, channel);
  db.close();

  if (!row || !row.thumbnail_variants_json) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "no_variants_found", video_issue_url }));
    process.exit(2);
  }

  const variants = JSON.parse(row.thumbnail_variants_json);
  const scores = variants.map((v, i) => {
    const breakdown = {
      text_density: scoreTextDensity(v.overlay_text),
      strategy: scoreStrategy(channel, v.strategy),
      brand_motif: scoreBrandMotif(channel, v.prompt_used),
      curiosity: scoreCuriosity(v.overlay_text),
    };
    const total = breakdown.text_density + breakdown.strategy + breakdown.brand_motif + breakdown.curiosity;
    return { variant_index: i, strategy: v.strategy, score: total, breakdown };
  });

  const recommended = scores.reduce((best, cur) => (cur.score > best.score ? cur : best), scores[0]);

  console.log(JSON.stringify({
    channel,
    video_issue_url,
    scores,
    recommended_index: recommended.variant_index,
    recommended_strategy: recommended.strategy,
    recommended_score: recommended.score,
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
