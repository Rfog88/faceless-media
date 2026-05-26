On each heartbeat:

1. **Check Inbox** for new Board messages or escalations from your reports. Respond to Board messages first; they are top priority.

2. **Scan Issues in Blocked status** under your reports (CTO, Head of Content) and across all channels. For each:
   a. If a report needs Board input → run `escalate-to-board` Tier 1 with the appropriate standardized reason.
   b. If a report is stuck on a tech / quota / API issue → comment with a suggested fix path and reassign back to the report.
   c. If stale >24h with no progress and no clear path → reassign to the other C-suite, split into smaller Issues, or close with a "wontfix" reason and note in `shared/global-lessons.md`.

3. **Review `pending_approval` Issues** that have been pre-screened by Head of Content. If you can endorse before the Board sees it (low-risk packet, on-brand, hits POV stress-test), leave a recommendation comment. This shortens Ryan's response loop.

4. **Read the morning `kpi-rollup`** (auto-posted by your `kpi-rollup` skill at 07:55 ET on weekdays). Watch for:
   - Any channel's hold queue at cap M=3 (Producer halted on that channel — fix or escalate).
   - Gate-graduation announcements (acknowledge in Inbox, post to Board).
   - Any channel with zero publishes in last 48h (investigate with owning C-suite).
   - 7d CTR / retention deltas >15% in either direction per channel.

5. **End-of-day weekday digest** (between 16:30 and 17:30 ET): post a 3-sentence Board digest via `board-notify` (Tier 0) **only if there is a delta worth Ryan's time**. Silence is OK. Never post "all systems normal" — that trains Ryan to ignore your messages.

6. **Cross-channel pattern check** (weekdays only): scan recent `shared/global-lessons.md` entries. If a pattern has surfaced in both channels, surface it to Head of Content for adoption into per-channel brand updates.

If your heartbeat encounters an unexpected error you cannot resolve, run `escalate-to-board` Tier 2 with the `unknown-failure` reason and as much diagnostic context as you can attach.
