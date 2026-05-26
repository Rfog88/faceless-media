#!/usr/bin/env node
// youtube-upload — Upload to YT with HARD-CODED AI disclosure flag. Refuses on copyright_preflight fail.
// STATUS: OAuth + YT API calls stubbed. Hard validations + disclosure composition + SQLite writes LIVE.
//
// THE DISCLOSURE-FLAG VERIFICATION STEP IS THE MOST IMPORTANT CODE PATH IN THIS COMPANY.
// When real API is wired, do not "fix" the strict verification check — refuse + escalate is the correct behavior.
//
// Storage: node:sqlite (requires NODE_OPTIONS=--experimental-sqlite on Node 22.x).
//
// Invocation: echo '{...}' | node skills/youtube-upload/run.mjs

import { readFileSync, existsSync } from "node:fs";
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
  CREATE TABLE IF NOT EXISTS uploads (
    yt_video_id TEXT PRIMARY KEY,
    video_issue_url TEXT,
    channel TEXT,
    format TEXT,
    published_at TEXT,
    disclosure_set INTEGER,
    copyright_preflight_pass INTEGER,
    yt_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`;

function openDb() {
  const path = process.env.FACELESS_MEDIA_DB_PATH || "/home/paperclip/faceless-media.sqlite";
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

function loadBaselineDisclosure() {
  const path = resolve(repoRoot, "shared", "disclosure-template.md");
  const md = readFileSync(path, "utf8");
  // Extract the boilerplate block — first triple-backtick fenced block.
  const m = md.match(/```\s*\n([\s\S]+?)\n```/);
  return m ? m[1].trim() : "(disclosure baseline missing)";
}

function loadChannelDisclosure(channel) {
  const path = resolve(repoRoot, "shared", "channels", channel, "brand.md");
  const md = readFileSync(path, "utf8");
  // Channel disclosure appendix lives in section 10 or 12.
  const m = md.match(/##\s*\d+\.\s*Disclosure language[\s\S]*?>\s*([\s\S]+?)(?=\n##\s|$)/i);
  return m ? m[1].trim() : "";
}

function composeFinalDescription(descriptionBase, channel) {
  const baseline = loadBaselineDisclosure();
  const channelAddendum = loadChannelDisclosure(channel);
  return [
    descriptionBase || "",
    "",
    "---",
    "",
    baseline,
    channelAddendum ? `\n${channelAddendum}` : "",
  ].join("\n");
}

async function refreshYouTubeOAuthToken(channel) {
  const envKey = `YOUTUBE_OAUTH_REFRESH_TOKEN__${channel.replace(/-/g, "_")}`;
  const refreshToken = process.env[envKey] || process.env[`YOUTUBE_OAUTH_REFRESH_TOKEN__${channel}`];
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;

  if (!refreshToken) return { _err: "api-key-missing", detail: `${envKey} not set` };
  if (!clientId || !clientSecret) return { _err: "api-key-missing", detail: "YOUTUBE_OAUTH_CLIENT_ID/SECRET not set" };

  // TODO Phase 1 deploy: actual token refresh.
  //   const res = await fetch("https://oauth2.googleapis.com/token", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/x-www-form-urlencoded" },
  //     body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
  //   });
  //   const j = await res.json();
  //   return { access_token: j.access_token, expires_in: j.expires_in };
  return { _stub: true, access_token: "stub-access-token", expires_in: 3600 };
}

async function youtubeVideosInsert({ accessToken, mp4Path, snippet, status }) {
  // TODO Phase 1 deploy: resumable upload via /upload/youtube/v3/videos.
  // The MOST IMPORTANT field in `status`: altered_synthetic_content MUST be true.
  //   const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
  //     method: "POST",
  //     headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  //     body: JSON.stringify({ snippet, status }),
  //   });
  //   // ... resumable upload protocol ...
  //   const j = await res.json();
  //   return j;  // { id, snippet, status: { altered_synthetic_content: true, ... } }
  if (!accessToken || accessToken === "stub-access-token") {
    // Stub response — INCLUDES altered_synthetic_content=true so downstream pipeline can test.
    return {
      _stub: true,
      id: `stub-yt-${Date.now()}`,
      snippet,
      status: { ...status, altered_synthetic_content: true },
    };
  }
  return { _stub: true, id: "stub-yt-real-path-pending" };
}

async function youtubeThumbnailsSet({ accessToken, videoId, thumbnailPath }) {
  // TODO Phase 1 deploy: POST /thumbnails/set?videoId=...
  return { _stub: true, status: "set" };
}

async function main() {
  const raw = readFileSync(0, "utf8") || "{}";
  let input;
  try { input = JSON.parse(raw); }
  catch { console.error(JSON.stringify({ error: "decision-needed", reason: "invalid_json_input" })); process.exit(2); }

  const {
    channel, video_issue_url, mp4_path, thumbnail_path,
    title, description_base, tags = [], category_id = 27,
    scheduled_publish_at = null,
  } = input;

  if (!channel || !video_issue_url || !mp4_path || !thumbnail_path || !title) {
    console.error(JSON.stringify({ error: "decision-needed", reason: "missing_required_field", required: ["channel", "video_issue_url", "mp4_path", "thumbnail_path", "title"] }));
    process.exit(2);
  }

  const db = openDb();

  // Hard validation 1: copyright_preflight_pass
  const video = db.prepare(`
    SELECT copyright_preflight_pass FROM videos WHERE video_issue_url = ? AND channel = ? AND format = 'long'
  `).get(video_issue_url, channel);
  if (!video || video.copyright_preflight_pass !== 1) {
    db.close();
    console.error(JSON.stringify({
      error: "human-review-required",
      reason: "copyright_preflight_not_passed",
      video_issue_url,
      channel,
      detail: "Refusing upload. Investigate asset-licenses.json + asset_uses table.",
    }));
    process.exit(4);
  }

  // Hard validation 2 + 3: files exist
  if (!existsSync(mp4_path)) {
    db.close();
    console.error(JSON.stringify({ error: "decision-needed", reason: "mp4_not_found", mp4_path }));
    process.exit(2);
  }
  if (!existsSync(thumbnail_path)) {
    db.close();
    console.error(JSON.stringify({ error: "decision-needed", reason: "thumbnail_not_found", thumbnail_path }));
    process.exit(2);
  }

  // Hard validation 4: OAuth refresh
  const oauth = await refreshYouTubeOAuthToken(channel);
  if (oauth._err) {
    db.close();
    console.error(JSON.stringify({ error: oauth._err, channel, detail: oauth.detail }));
    process.exit(3);
  }

  // Compose final description with mandatory disclosure
  const finalDescription = composeFinalDescription(description_base, channel);

  const snippet = { title, description: finalDescription, tags, categoryId: String(category_id) };
  const status = {
    privacyStatus: scheduled_publish_at ? "private" : "public",
    publishAt: scheduled_publish_at,
    selfDeclaredMadeForKids: false,
    altered_synthetic_content: true,   // HARD-CODED. Do not change.
  };

  const uploadResp = await youtubeVideosInsert({ accessToken: oauth.access_token, mp4Path: mp4_path, snippet, status });

  // Hard validation 5: confirm disclosure flag in response
  if (!uploadResp.status || uploadResp.status.altered_synthetic_content !== true) {
    db.close();
    console.error(JSON.stringify({
      error: "human-review-required",
      reason: "altered_synthetic_content flag not confirmed in upload response",
      channel,
      video_issue_url,
      yt_video_id_pending: uploadResp.id || null,
      detail: "STOP. Do not retry. This is the channel-killer scenario.",
    }));
    process.exit(4);
  }

  // Thumbnail
  await youtubeThumbnailsSet({ accessToken: oauth.access_token, videoId: uploadResp.id, thumbnailPath: thumbnail_path });

  // Log upload
  const ytUrl = `https://www.youtube.com/watch?v=${uploadResp.id}`;
  db.prepare(`
    INSERT INTO uploads (yt_video_id, video_issue_url, channel, format, published_at, disclosure_set, copyright_preflight_pass, yt_url)
    VALUES (?, ?, ?, 'long', ?, 1, 1, ?)
  `).run(uploadResp.id, video_issue_url, channel, scheduled_publish_at || new Date().toISOString(), ytUrl);
  db.close();

  console.log(JSON.stringify({
    channel,
    video_issue_url,
    yt_video_id: uploadResp.id,
    yt_url: ytUrl,
    published_at: scheduled_publish_at || new Date().toISOString(),
    disclosure_set: true,
    copyright_preflight_pass: true,
    stub_mode: !!uploadResp._stub,
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: "unknown-failure", message: e.message }));
  process.exit(1);
});
