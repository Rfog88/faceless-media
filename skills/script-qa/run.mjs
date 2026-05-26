#!/usr/bin/env node
// script-qa — heuristic + structural scoring of generated scripts.
// STATUS: rubrics are LIVE. No LLM call needed for Phase 1.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{"channel":"finance-skeptic","script_id":42}' | node skills/script-qa/run.mjs

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

function loadBrand(channel) {
  const path = resolve(repoRoot, "shared", "channels", channel, "brand.md");
  return readFileSync(path, "utf8");
}

function extractSection(md, sectionRegex) {
  const m = md.match(new RegExp(`##\\s*\\d+\\.\\s*${sectionRegex}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i"));
  return m ? m[1].trim() : "";
}

function extractHookTemplates(brand) {
  const section = extractSection(brand, "Hook patterns");
  // Templates are numbered list items. Pull each quoted/templated string.
  return [...section.matchAll(/^\d+\.\s+"?(.+?)"?\s*$/gm)].map(x => x[1]);
}

function extractBannedPhrases(brand) {
  const section = extractSection(brand, "Tonal rules");
  // Banned phrases are under a "Banned phrases:" sub-bullet list as quoted strings.
  const bannedBlock = section.match(/Banned phrases[\s\S]*$/i)?.[0] || "";
  return [...bannedBlock.matchAll(/-\s*"([^"]+)"/g)].map(x => x[1].toLowerCase());
}

function extractFormatLength(brand, format) {
  const section = extractSection(brand, "Format mix");
  // english-learning: 15-25 min; finance-skeptic: 8-12 min
  if (format === "long") {
    const m = section.match(/long-form:?\s*(\d+)-(\d+)\s*min/i);
    return m ? { min: parseInt(m[1], 10), max: parseInt(m[2], 10) } : { min: 8, max: 20 };
  }
  return { min: 0.25, max: 1 }; // Shorts: 15-60s = 0.25-1 min
}

function wordCountToMinutes(words) {
  return words / 140; // 140 wpm target (esl) / similar for finance-skeptic
}

function getFirst15s(script) {
  // First 15s @ 140 wpm = ~35 words. Pull first ~75 words to give some headroom.
  return script.split(/\s+/).slice(0, 75).join(" ");
}

function scoreHook(script, hookTemplates, _channel) {
  const first = getFirst15s(script).toLowerCase();
  let score = 0;
  const reasons = [];

  // +2 if matches a brand hook template (loose match — first 4 distinctive words)
  let templateMatch = false;
  for (const tpl of hookTemplates) {
    const firstFew = tpl.replace(/\[.+?\]/g, "").toLowerCase().split(/\s+/).slice(0, 4).join(" ");
    if (first.includes(firstFew.substring(0, 30))) {
      templateMatch = true;
      break;
    }
  }
  if (templateMatch) { score += 2; reasons.push("uses brand hook template"); }
  else reasons.push("does not match any brand hook template (-2)");

  // +2 movement/question/before-after structure
  if (/\?/.test(first) || /(here'?s|imagine|picture|story|wondered)/i.test(first)) {
    score += 2; reasons.push("hook has movement/question structure");
  }

  // +2 specific number or claim in hook
  if (/\b\d[\d,.]*(%|\s*(dollars|years|million|billion|people|users))/i.test(first) || /\$\d/.test(first)) {
    score += 2; reasons.push("hook contains specific number");
  }

  // +2 avoids generic openers
  if (!/^(today|in this video|hi everyone|welcome|hello)/i.test(first.trim())) {
    score += 2; reasons.push("hook avoids generic opener");
  } else {
    reasons.push("hook uses generic opener (-2)");
  }

  // +2 hook is under 75 words
  if (first.split(/\s+/).length <= 75) {
    score += 2; reasons.push("hook within 15s spoken length");
  }

  return { score: Math.min(10, score), reasons };
}

function scoreRetention(script, channel, format, brand) {
  let score = 0;
  const reasons = [];

  // +2 structural beats present
  const beats = channel === "english-learning"
    ? ["[HOOK]", "learning goal", "[CTA]"]
    : channel === "finance-skeptic"
    ? ["[HOOK]", "[SETUP]", "[CTA]"]
    : ["[HOOK]", "[CTA]"];
  const beatsPresent = beats.filter(b => script.toLowerCase().includes(b.toLowerCase())).length;
  if (beatsPresent === beats.length) { score += 2; reasons.push("all structural beats present"); }
  else reasons.push(`missing beats: ${beats.filter(b => !script.toLowerCase().includes(b.toLowerCase())).join(", ")} (-2)`);

  // +2 pacing markers (paragraph breaks every ~90s of spoken content = roughly every 200 words)
  const paras = script.split(/\n\n+/).filter(p => p.trim().length > 0);
  const totalWords = script.split(/\s+/).filter(Boolean).length;
  const expectedParas = Math.max(1, Math.floor(totalWords / 200));
  if (paras.length >= expectedParas) { score += 2; reasons.push("paragraph pacing OK"); }
  else reasons.push("dead spots — paragraphs too long");

  // +2 curiosity gap (hook poses a question; payoff section addresses it)
  const hookHasQuestion = /\?/.test(getFirst15s(script));
  const payoffSection = script.match(/\[PAYOFF\]([\s\S]+?)(?=\[|$)/i)?.[1] || "";
  if (hookHasQuestion && payoffSection.length > 100) { score += 2; reasons.push("curiosity gap opened + addressed"); }

  // +2 no dead spots (no passage >120 words without a beat shift)
  const passages = script.split(/\n\n+|\[/);
  const hasLongDead = passages.some(p => p.split(/\s+/).filter(Boolean).length > 120);
  if (!hasLongDead) { score += 2; reasons.push("no long dead passages"); }
  else reasons.push("contains >120-word passages without beat shift (-2)");

  // +2 length matches brand format mix
  if (format === "long") {
    const lengthRange = extractFormatLength(brand, "long");
    const lengthMin = wordCountToMinutes(totalWords);
    if (lengthMin >= lengthRange.min && lengthMin <= lengthRange.max) {
      score += 2; reasons.push(`length ${lengthMin.toFixed(1)}min within brand range ${lengthRange.min}-${lengthRange.max}min`);
    } else {
      reasons.push(`length ${lengthMin.toFixed(1)}min OUTSIDE brand range ${lengthRange.min}-${lengthRange.max}min (-2)`);
    }
  }

  return { score: Math.min(10, score), reasons };
}

function scoreFactStatus(script, channel) {
  const reasons = [];
  // Look for source citations: URLs, "[Source: ...]", "according to ..."
  const hasUrl = /https?:\/\/\S+/.test(script);
  const hasSourceMarker = /\[Source:\s*[^\]]+\]/i.test(script);
  const hasAccording = /according to (a|the|an)?\s+\w+/i.test(script);
  const hasAnyCitation = hasUrl || hasSourceMarker || hasAccording;

  // Check unsourced specific numerical claims
  const numericalClaims = script.match(/\b\d[\d,.]*(\s*(million|billion|thousand|percent|%))/gi) || [];
  const looksUnsourced = numericalClaims.length > 2 && !hasAnyCitation;

  // Channel-specific: finance-skeptic requires citation in first 30s
  if (channel === "finance-skeptic") {
    const first30s = script.split(/\s+/).slice(0, 150).join(" "); // ~150 words
    const hasFirst30sCitation = /https?:\/\/\S+|\[Source:|according to/i.test(first30s);
    if (!hasFirst30sCitation) {
      reasons.push("no source cited in first 30s (finance-skeptic requirement)");
      return { status: looksUnsourced ? "fail" : "review", reasons };
    }
  }

  if (looksUnsourced) {
    reasons.push("specific numerical claims without sources");
    return { status: "fail", reasons };
  }
  if (!hasAnyCitation && numericalClaims.length > 0) {
    return { status: "review", reasons: ["numerical claims present but sourcing weak"] };
  }
  return { status: "pass", reasons: ["source citations present"] };
}

function scanBannedPhrases(script, bannedPhrases) {
  const lower = script.toLowerCase();
  const matches = bannedPhrases.filter(p => lower.includes(p));
  return { count: matches.length, matches };
}

function povStressTest(script, channel) {
  if (channel !== "finance-skeptic") return { applicable: false, flag: "n/a" };
  // Check for "who benefits" / "who profits" / "where does the money go" patterns
  const stressTerms = [
    /who (benefits|profits|gains)/i,
    /where does the money/i,
    /follow the money/i,
    /who's selling/i,
    /motive/i,
  ];
  const hits = stressTerms.filter(re => re.test(script)).length;
  return { applicable: true, flag: hits >= 1 ? "pass" : "fail", question_hits: hits };
}

async function main() {
  const raw = readFileSync(0, "utf8") || "{}";
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  const { channel, script_id, format = "long" } = input;
  if (!channel || !script_id) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "missing_required_field", required: ["channel", "script_id"] }));
    process.exit(2);
  }

  const db = openDb();
  const row = db.prepare(`SELECT * FROM scripts WHERE id = ?`).get(script_id);
  if (!row) {
    db.close();
    console.error(JSON.stringify({ error: "decision-needed", reason: "script_not_found", script_id }));
    process.exit(2);
  }

  const brand = loadBrand(channel);
  const hookTemplates = extractHookTemplates(brand);
  const bannedPhrases = extractBannedPhrases(brand);

  const hookResult = scoreHook(row.draft_md, hookTemplates, channel);
  const retentionResult = scoreRetention(row.draft_md, channel, row.format || format, brand);
  const factResult = scoreFactStatus(row.draft_md, channel);
  const bannedResult = scanBannedPhrases(row.draft_md, bannedPhrases);
  const povResult = povStressTest(row.draft_md, channel);

  // Compute qa_status
  const qaReasons = [];
  const pass = hookResult.score >= 7
    && retentionResult.score >= 7
    && factResult.status !== "fail"
    && bannedResult.count === 0;

  if (hookResult.score < 7) qaReasons.push(`hook_score ${hookResult.score} < 7`);
  if (retentionResult.score < 7) qaReasons.push(`retention_score ${retentionResult.score} < 7`);
  if (factResult.status === "fail") qaReasons.push("fact_status FAIL");
  if (bannedResult.count > 0) qaReasons.push(`banned phrases used: ${bannedResult.matches.join(", ")}`);
  if (povResult.flag === "fail") qaReasons.push("POV stress-test flag FAIL (head-of-content to review)");

  // Persist scores
  db.prepare(`
    UPDATE scripts SET qa_hook_score = ?, qa_retention_score = ?, qa_fact_status = ? WHERE id = ?
  `).run(hookResult.score, retentionResult.score, factResult.status, script_id);
  db.close();

  console.log(JSON.stringify({
    script_id,
    channel,
    hook_score: hookResult.score,
    hook_reasons: hookResult.reasons,
    retention_score: retentionResult.score,
    retention_reasons: retentionResult.reasons,
    fact_status: factResult.status,
    fact_reasons: factResult.reasons,
    banned_phrase_count: bannedResult.count,
    banned_phrase_matches: bannedResult.matches,
    pov_stress_test: povResult,
    qa_status: pass ? "pass" : "fail",
    qa_reasons: qaReasons,
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
