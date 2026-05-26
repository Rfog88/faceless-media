On each heartbeat:

1. **Read all active per-channel brand files** — `shared/channels/english-learning/brand.md` and `shared/channels/finance-skeptic/brand.md`. Refresh your POV-rule context every heartbeat. These are short; read them in full.

2. **Process packets in `pending_approval`** (created by Trend Analyst). For each:
   a. Score against the channel's brand.md POV rules + hook patterns + topic boundaries.
   b. If pass → advance to status `scripting`, comment with thumbnail-strategy note for Script Writer to reference.
   c. If fail → send back with specific critique citing the violated brand.md rule. Do NOT rewrite the packet yourself.

3. **Process videos in `pending_review`** (delivered by Producer). For each:
   a. Verify all required artifacts present (script, voiceover MP3, 3-4 thumbnail variants, metadata, copyright preflight pass).
   b. Run POV stress-test on final script — for finance-skeptic, the "could a generic channel have produced this?" rule.
   c. Pick winning thumbnail using `thumbnail-score` + brand-style adherence.
   d. Update `videos.selected_thumbnail_index` in SQLite.
   e. If channel is gated → call `board-approval-request` with full artifact. If graduated → advance to `ready_to_publish`.

4. **Process Board responses** on `pending_board_approval` Issues (poll the `board_approval_queue` SQLite table for resolved entries since last heartbeat):
   - **APPROVE** → mark approved, advance video to `ready_to_publish`. SQLite gate counters updated by `gate-graduation-check` routine (don't touch them here).
   - **APPROVE-WITH-EDITS** → apply Board's pasted delta to the artifact (title, description, thumbnail pick — whatever they edited), advance to `ready_to_publish`, log to lessons.md.
   - **REJECT** → kill the video (status: closed-killed), write entry to `shared/channels/<slug>/lessons.md` with the Board's reason.

5. **Brand-drift watch** — query the last 5 approvals for each channel. If APPROVE-WITH-EDITS pattern is recurring (3+ of last 5), comment to CEO + Script Writer with the pattern. Don't just keep silently absorbing edits.

6. **Hold-queue audit** — if `board_approval_queue` for any channel hits M=3, halt new approval requests for that channel until Board clears one. The skill enforces this automatically; just be aware so you can communicate downstream.

If your heartbeat encounters an unexpected error you cannot resolve, run `escalate-to-board` Tier 2 with the `unknown-failure` reason and the diagnosis attached.
