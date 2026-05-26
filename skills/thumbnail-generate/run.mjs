#!/usr/bin/env node
// thumbnail-generate — 3-4 thumbnail variants per video with brand-style overlays.
// STATUS: variant strategy + brand-style prompt construction LIVE. Image gen + overlay rendering stubbed.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{...}' | node skills/thumbnail-generate/run.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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

function loadBrandThumbnailStyle(channel) {
  const path = resolve(repoRoot, "shared", "channels", channel, "brand.md");
  const md = readFileSync(path, "utf8");
  const m = md.match(/##\s*\d+\.\s*Thumbnail style[\s\S]*?\n([\s\S]*?)(?=\n##\s|$)/i);
  return m ? m[1].trim() : "";
}

const STRATEGIES = [
  { id: "face-focal", description: "expressive stock face (curiosity, surprise) — single subject, eyes toward text overlay" },
  { id: "object-focal", description: "single symbolic object on contrasting background — minimalist staging" },
  { id: "text-dominant", description: "large text occupies 60% of frame, supporting visual element minimal" },
  { id: "high-contrast-minimalist", description: "dark background + one bright accent + one specific number or word" },
];

function buildImagePrompt(channel, videoTitle, hookPhrase, brandStyle, strategy) {
  return [
    `Create a YouTube thumbnail for a video titled: "${videoTitle}"`,
    `Hook phrase / angle: ${hookPhrase || videoTitle}`,
    "",
    "Composition strategy:",
    strategy.description,
    "",
    "Brand style guide:",
    brandStyle,
    "",
    "Output: 1280x720 image, vivid but uncluttered, optimized for mobile-preview scroll-stop power.",
    "Avoid: shocked-face cliches (unless face-focal strategy), tabloid-yellow energy, multiple competing focal points.",
  ].join("\n");
}

function buildOverlayText(videoTitle, hookPhrase, strategy) {
  // Strategy-specific overlay text length
  const words = (hookPhrase || videoTitle).split(/\s+/);
  if (strategy.id === "text-dominant") return words.slice(0, 6).join(" ");
  if (strategy.id === "high-contrast-minimalist") {
    // Look for a number in the title; use that + 1-2 words.
    const numMatch = (videoTitle + " " + (hookPhrase || "")).match(/\$?\d[\d,.]*/);
    return numMatch ? `${numMatch[0]} — ${words.slice(0, 2).join(" ")}` : words.slice(0, 3).join(" ");
  }
  return words.slice(0, 4).join(" ");
}

async function callImageGenAdapter(prompt) {
  // TODO Phase 1 deploy: prefer codex_local adapter; fallback to OpenAI DALL-E.
  // Stub returns a placeholder bytes blob.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { _stub: true, reason: "no_image_gen_adapter", png_bytes: Buffer.from(`STUB PNG — prompt: ${prompt.substring(0, 200)}`) };
  }
  return { _stub: true, reason: "api_call_not_yet_wired", png_bytes: Buffer.from(`STUB PNG`) };
}

function renderTextOverlay(_basePngBytes, _overlayText, _brandStyle) {
  // TODO Phase 1 deploy: real text overlay via sharp or canvas.
  // Stub: return the base bytes with overlay-text comment appended.
  return Buffer.from(`STUB PNG WITH OVERLAY: "${_overlayText}"`);
}

async function main() {
  const raw = readFileSync(0, "utf8") || "{}";
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  const { channel, video_issue_url, video_title, hook_phrase, variant_count = 4 } = input;
  if (!channel || !video_issue_url || !video_title) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "missing_required_field", required: ["channel", "video_issue_url", "video_title"] }));
    process.exit(2);
  }

  const brandStyle = loadBrandThumbnailStyle(channel);

  const outDir = process.env.THUMBNAIL_OUTPUT_DIR || "/home/paperclip/faceless-media/thumbnails";
  const channelDir = resolve(outDir, channel);
  if (!existsSync(channelDir)) mkdirSync(channelDir, { recursive: true });
  const issueId = video_issue_url.split("/").pop() || `vid-${Date.now()}`;

  const strategies = STRATEGIES.slice(0, variant_count);
  const variants = [];

  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    const prompt = buildImagePrompt(channel, video_title, hook_phrase, brandStyle, strategy);
    const baseImage = await callImageGenAdapter(prompt);
    const overlayText = buildOverlayText(video_title, hook_phrase, strategy);
    const finalPng = renderTextOverlay(baseImage.png_bytes, overlayText, brandStyle);

    const imagePath = resolve(channelDir, `${issueId}_thumb_v${i + 1}_${strategy.id}.png`);
    writeFileSync(imagePath, finalPng);

    variants.push({
      image_path: imagePath,
      strategy: strategy.id,
      overlay_text: overlayText,
      prompt_used: prompt.substring(0, 200),
    });
  }

  // Update videos table
  const db = openDb();
  db.prepare(`
    UPDATE videos SET thumbnail_variants_json = ? WHERE video_issue_url = ? AND channel = ? AND format = 'long'
  `).run(JSON.stringify(variants), video_issue_url, channel);
  db.close();

  console.log(JSON.stringify({
    channel,
    video_issue_url,
    variants,
    stub_mode: true,
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
