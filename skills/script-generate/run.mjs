#!/usr/bin/env node
// script-generate — long-form + Shorts script generation from approved packet.
// STATUS: prompt construction IS fully built. Claude API call stubbed pending adapter interface confirmation.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{...}' | node skills/script-generate/run.mjs

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
  CREATE TABLE IF NOT EXISTS scripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    packet_issue_url TEXT,
    channel TEXT,
    format TEXT,                              -- "long" | "short"
    draft_md TEXT,
    hook_used TEXT,
    word_count INTEGER,
    qa_hook_score REAL,
    qa_retention_score REAL,
    qa_fact_status TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`;

function openDb() {
  const path = process.env.FACELESS_MEDIA_DB_PATH || "/home/paperclip/faceless-media.sqlite";
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

function loadBrand(channel) {
  const path = resolve(repoRoot, "shared", "channels", channel, "brand.md");
  return readFileSync(path, "utf8");
}

function extractSection(md, sectionRegex) {
  const m = md.match(new RegExp(`##\\s*\\d+\\.\\s*${sectionRegex}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i"));
  return m ? m[1].trim() : "";
}

function loadRecentLessons(channel, n = 5) {
  try {
    const path = resolve(repoRoot, "shared", "channels", channel, "lessons.md");
    const md = readFileSync(path, "utf8");
    const sections = [...md.matchAll(/##\s+(.+?)(?=\n##\s|$)/gs)].map(x => x[0]);
    return sections.slice(-n);
  } catch {
    return [];
  }
}

function loadRecentScriptOpenings(db, channel, n = 10) {
  const rows = db.prepare(`
    SELECT draft_md FROM scripts WHERE channel = ? ORDER BY created_at DESC LIMIT ?
  `).all(channel, n);
  // Extract first sentence of each.
  return rows.map(r => (r.draft_md || "").split(/[.!?]\s/)[0].substring(0, 200)).filter(Boolean);
}

function buildPrompt({ brand, packet_md, recent_lessons, recent_openings, format }) {
  const povStatement = extractSection(brand, "POV statement");
  const audience = extractSection(brand, "Audience");
  const tonalRules = extractSection(brand, "Tonal rules");
  const hookPatterns = extractSection(brand, "Hook patterns");
  const formatMix = extractSection(brand, "Format mix");
  const topicBoundaries = extractSection(brand, "Topic boundaries");
  const povStressTest = extractSection(brand, "POV stress-test rule");
  const disclosureLang = extractSection(brand, "Disclosure language");

  return [
    "# Script generation task",
    "",
    "## Channel POV (your worldview for this script)",
    povStatement || "(no POV statement — abort)",
    "",
    "## Audience",
    audience,
    "",
    "## Tonal rules (MUST FOLLOW)",
    tonalRules,
    "",
    "## Hook patterns (MUST use one of these as your first-15-seconds template)",
    hookPatterns,
    "",
    "## Format requirements",
    formatMix,
    "",
    topicBoundaries ? `## Topic boundaries (DO NOT cover)\n${topicBoundaries}\n` : "",
    povStressTest ? `## POV stress-test rule (MUST pass)\n${povStressTest}\n` : "",
    "",
    "## Past script openings to AVOID reusing",
    recent_openings.length > 0 ? recent_openings.map((o, i) => `${i + 1}. "${o}"`).join("\n") : "(none yet)",
    "",
    "## Recent lessons (what's working / what's not)",
    recent_lessons.length > 0 ? recent_lessons.join("\n\n") : "(no lessons yet — first videos)",
    "",
    "## Research packet (source material)",
    packet_md,
    "",
    "## Output requirements",
    format === "long_only"
      ? "Generate one long-form script per Format mix specification. Output as markdown with sections [HOOK 0-15s], [SETUP], [BODY], [PAYOFF], [CTA]."
      : "Generate one long-form script per Format mix specification, PLUS 2-3 derived Shorts (15-60s each) that reuse the same voice and pull from the most retention-worthy moments in the long-form. Output the long-form first, then a '---SHORTS---' divider, then each Short with its own [HOOK], [BODY], [CTA] sections.",
    "",
    "Final reminder: every banned phrase listed in Tonal rules is a hard fail. Use the hook patterns verbatim or as a base — do not invent new hook structures.",
  ].filter(Boolean).join("\n");
}

async function callClaudeAdapter(prompt) {
  // TODO Phase 1 deploy: actual claude_local adapter call.
  // Expected interface (to confirm against live Paperclip instance):
  //   const res = await paperclipSDK.callAdapter("claude_local", { prompt, max_tokens: 8000 });
  //   return res.text;
  return {
    _stub: true,
    reason: "llm_adapter_call_not_yet_wired",
    synthetic_response: [
      "[HOOK 0-15s] Synthetic hook here matching the brand's pattern template.",
      "[SETUP] Synthetic setup paragraph that introduces what the audience is about to learn.",
      "[BODY] Synthetic body content — would be ~1500 words in real implementation. Cites packet sources.",
      "[PAYOFF] Synthetic payoff resolving the hook question.",
      "[CTA] Synthetic CTA from brand.md pattern.",
      "",
      "---SHORTS---",
      "",
      "[SHORT 1 HOOK] Synthetic short hook 1.",
      "[SHORT 1 BODY] ~30s synthetic content.",
      "[SHORT 1 CTA] Synthetic CTA.",
      "",
      "[SHORT 2 HOOK] Synthetic short hook 2.",
      "[SHORT 2 BODY] ~30s synthetic content.",
      "[SHORT 2 CTA] Synthetic CTA.",
    ].join("\n"),
  };
}

function parseClaudeResponse(text) {
  const parts = text.split(/---\s*SHORTS\s*---/i);
  const longForm = (parts[0] || "").trim();
  const shortsBlock = (parts[1] || "").trim();
  const shorts = shortsBlock
    .split(/\n\n+/)
    .filter(s => /\[SHORT\s*\d+/i.test(s))
    .reduce((acc, line) => {
      const m = line.match(/\[SHORT\s*(\d+)/i);
      if (!m) return acc;
      const idx = parseInt(m[1], 10) - 1;
      if (!acc[idx]) acc[idx] = "";
      acc[idx] += line + "\n\n";
      return acc;
    }, []);

  return {
    long_form_md: longForm,
    shorts: shorts.filter(Boolean).map(s => s.trim()),
  };
}

function extractHookUsed(scriptMd) {
  const m = scriptMd.match(/\[HOOK[^\]]*\]\s*([\s\S]*?)(?=\n\[|$)/);
  return m ? m[1].trim().substring(0, 200) : "";
}

function wordCount(md) {
  return (md || "").split(/\s+/).filter(Boolean).length;
}

async function main() {
  const raw = readFileSync(0, "utf8") || "{}";
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  const { channel, packet_issue_url, packet_md, format = "combo" } = input;
  if (!channel || !packet_issue_url || !packet_md) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "missing_required_field", required: ["channel", "packet_issue_url", "packet_md"] }));
    process.exit(2);
  }

  const brand = loadBrand(channel);
  const db = openDb();
  const recentLessons = loadRecentLessons(channel, 5);
  const recentOpenings = loadRecentScriptOpenings(db, channel, 10);

  const prompt = buildPrompt({ brand, packet_md, recent_lessons: recentLessons, recent_openings: recentOpenings, format });
  const llmResponse = await callClaudeAdapter(prompt);
  const text = llmResponse.synthetic_response || llmResponse.text || "";
  const parsed = parseClaudeResponse(text);

  // Persist
  const insert = db.prepare(`
    INSERT INTO scripts (packet_issue_url, channel, format, draft_md, hook_used, word_count) VALUES (?, ?, ?, ?, ?, ?)
  `);
  insert.run(packet_issue_url, channel, "long", parsed.long_form_md, extractHookUsed(parsed.long_form_md), wordCount(parsed.long_form_md));
  for (const s of parsed.shorts) {
    insert.run(packet_issue_url, channel, "short", s, extractHookUsed(s), wordCount(s));
  }
  db.close();

  console.log(JSON.stringify({
    channel,
    packet_issue_url,
    long_form: {
      script_md: parsed.long_form_md,
      word_count: wordCount(parsed.long_form_md),
      hook_used: extractHookUsed(parsed.long_form_md),
    },
    shorts: parsed.shorts.map(s => ({
      script_md: s,
      word_count: wordCount(s),
      hook_used: extractHookUsed(s),
    })),
    stub_mode: !!llmResponse._stub,
    prompt_length_chars: prompt.length,
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
