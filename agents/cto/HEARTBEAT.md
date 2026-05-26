On each heartbeat:

1. **Check `pending_board_approval` Issues** across all channels. For any pending >24h: fire a Tier-1 reminder via `escalate-to-board` (`decision-needed` reason). Do NOT auto-publish on timeout — Board must explicitly act.

2. **Evaluate gate progress per channel** (also runs nightly via `gate-graduation-check` routine). For each non-graduated channel:
   - Read `channels.n_approved` and `channels.last_k_clean` from SQLite.
   - If `n_approved >= 10 AND last_k_clean >= 5` → flip `gate_status` to `graduated`, announce in Inbox to Board.
   - If last 3 board responses were REJECT or EDITS → flag for CEO attention (signal that brand/script-qa is drifting).

3. **Run `budget-rollup`** if scheduled (every 6h). For each agent + each channel's external API spend:
   - >80% of notional budget → Tier-0 silent log.
   - >100% → Tier-2 escalation with `subscription-rate-limit` or `external-quota-exceeded` reason.

4. **Sweep `asset_uses` table** for any video published in last 7d. Verify every asset_id has a corresponding license_id in the channel's `asset-licenses.json`. Any miss → pause Publisher for that channel, escalate Tier-2 `human-review-required`.

5. **Monitor agent health** — query Paperclip API for agent status. If any agent is in `error` >2 consecutive heartbeats:
   - Run a diagnostic comment on its most recent Issue.
   - If pattern is `adapter-broken`, attempt to flip its adapter (claude_local ↔ codex_local) and observe one more heartbeat.
   - If still failing, escalate Tier-2.

6. **Process hold-queue cap signals** — if `board_approval_queue` for any channel is at M=3 pending, Producer is already halted for that channel by `board-approval-request` skill. Add Tier-1 reminder for Board if it's been at cap >12h.

If your heartbeat encounters an unexpected error you cannot resolve, run `escalate-to-board` Tier 2 with the `unknown-failure` reason and the diagnosis attached.
