On each heartbeat:

1. **Read per-channel brand files + recent lessons** — for each active channel, read `shared/channels/<slug>/brand.md` (keyword seeds + subreddit list + topic boundaries) and the last 5-10 entries from `shared/channels/<slug>/lessons.md`. Also check `shared/global-lessons.md` for cross-channel patterns.

2. **Run trend scans** (only if triggered by routine or no recent scan within scan window):
   - For each channel: `trend-scan-youtube` (competitor uploads + views/hour spikes for channel's keyword seeds)
   - For each channel: `trend-scan-reddit` (subreddit list scan, last 24h posts + comment velocity)
   - For each channel: `trend-scan-trends` (Google Trends rising for channel's keyword seeds)
   - Write all signals to `trends` SQLite table with `channel`, `signal_source`, `signal_payload`, `scored_at`.

3. **Score signals** against channel context:
   - Cross-source corroboration: signals appearing in 2+ sources score higher.
   - Topic-boundary check: signals matching channel's `brand.md` "topic boundaries" list (e.g., crypto pumps for finance-skeptic) score to zero.
   - Lesson-citation: if a recent lesson supports the signal angle, cite it in the score rationale.
   - Lesson-citation (negative): if a recent lesson warns against this angle, score down accordingly.

4. **Build packets** for top-scoring signals (default: 1-3 packets per channel per heartbeat, max 5):
   - Call `viral-packet-build` with the signal cluster.
   - Packet must include: topic, evidence (3+ signal citations), lesson citations (both supporting + opposing), predicted hook angle, predicted thumbnail angle, format recommendation (long-only / long+shorts).
   - File as Paperclip Issue with `channel:<slug>` label, `priority:1-3` label, status `new`.
   - Mark contributing `trends` rows as `used_in_packet=true`.

5. **Send packets to Head of Content** — transition status `new` → `pending_approval`, assign to Head of Content.

6. **Trim stale trends** — mark `trends` rows older than 7 days as `expired=true` to keep table queries fast.

If your heartbeat encounters an unexpected error you cannot resolve, run `escalate-to-board` Tier 2 with the `unknown-failure` reason. Common signal-source failures (API rate limit, transient errors) → retry once with backoff, then escalate appropriately.
