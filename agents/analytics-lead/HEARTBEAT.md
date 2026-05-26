On each heartbeat (also triggered daily 7 AM ET via `analytics-rollup`):

1. **Identify videos due for snapshots** — query `uploads` table for videos at 24h/48h/72h/7d/30d post-publish that don't yet have a corresponding `performance` row at that snapshot window.

2. **Pull analytics per video** — call `analytics-pull` for each due snapshot. Inputs: yt_video_id, snapshot_window. Output: views, impressions, ctr, avg_view_duration, avg_view_percentage (retention), estimatedRevenue (RPM), subs_delta. Write to `performance` table.

3. **Write per-channel lessons for 72h snapshots completed today** — for each video that hit its 72h snapshot in this heartbeat:
   - Compare CTR vs channel 7d avg
   - Compare retention vs channel 7d avg
   - Compare RPM vs channel 7d avg
   - Identify what worked (hook pattern, format, topic angle)
   - Identify what didn't
   - Suggest adjustment for next packet
   - Append entry to `shared/channels/<slug>/lessons.md` in the format defined in that file's header comment.

4. **Cross-channel pattern detection** — compare last 5 entries from english-learning/lessons.md against last 5 from finance-skeptic/lessons.md. If a SAME pattern appears in both (e.g., "story-format hooks beat list-format hooks"):
   - Promote to `shared/global-lessons.md` with format: date, pattern name, channels where observed, hypothesis, adjustment.
   - Comment on related per-channel lesson entries with "→ promoted to global-lessons.md (date)".

5. **AdSense drop detection** — for each channel, compare last 7d AdSense to prior 7d. If drop >40% → escalate Tier-2 `decision-needed`.

6. **Update gate counters** — for `board_approval_queue` entries that resolved since last heartbeat (status changed from `pending` to `approved`/`edits`/`rejected`):
   - APPROVE → `channels.n_approved++`, `channels.last_k_clean = min(last_k_clean+1, 5)`.
   - APPROVE-WITH-EDITS → `channels.n_approved++`, `channels.last_k_clean = 0`.
   - REJECT → no counter changes; ensure lesson is captured.
   - Coordinate with CTO's `gate-graduation-check` routine (CTO runs the gate-flip; you update the counters).

7. **Quota budget check** — if YT Analytics API quota usage >75% of daily limit, comment Tier-0 silent log to CTO. >100% → Tier-2 escalation.

If your heartbeat encounters an unexpected error you cannot resolve, run `escalate-to-board` Tier 2 with the `unknown-failure` reason and the diagnosis attached.
