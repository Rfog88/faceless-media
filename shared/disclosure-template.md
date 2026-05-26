# AI disclosure template (US/global baseline)

Boilerplate language appended to every video description by `youtube-upload` skill. Per-channel brand.md can specify a customized phrasing, but the disclosure MUST appear and the YT `altered_synthetic_content` flag MUST be TRUE on every upload — non-negotiable per 2026 YT enforcement.

## Baseline description boilerplate

```
This video uses AI-assisted production. The voiceover is synthetic
(text-to-speech) and some visual elements (B-roll, thumbnails) were
generated or selected with AI tools. The script, editorial perspective,
and topic selection are reviewed by humans. We disclose this on every
upload.
```

## Studio flag (set programmatically)

```
altered_synthetic_content: true
```

## Per-channel overrides

Each channel's `brand.md` section 10 ("Disclosure language") may customize the prose, but:
- Length MUST be at least the baseline length
- MUST mention synthetic voiceover
- MUST mention AI-assisted visuals
- MUST be in the FIRST PARAGRAPH of the description (not buried)

## Why this exists

YouTube terminated 16 channels with 4.7B cumulative lifetime views in Feb 2026 for "AI slop" — undisclosed synthetic content was a key violation pattern. Compliant disclosure is the cheapest insurance against channel termination.
