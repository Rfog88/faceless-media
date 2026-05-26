On each heartbeat:

1. **Read brand.md files** — both `shared/channels/english-learning/brand.md` and `shared/channels/finance-skeptic/brand.md`. Refresh hook patterns, banned phrases, tonal rules, POV stress-test. Do this every heartbeat. Short cost, high payoff.

2. **Process Issues in `scripting` status**, ordered oldest first. For each:
   a. Identify the channel from the `channel:<slug>` Issue label.
   b. Read the packet body (Trend Analyst's research + signal evidence).
   c. Read the channel's `brand.md` POV statement + hook patterns + the relevant topic-boundary list.
   d. Query `scripts` SQLite table for last 10 scripts on this channel (avoid phrasing reuse).
   e. Read most recent 3-5 lessons from `shared/channels/<slug>/lessons.md`.

3. **Generate via `script-generate`** — output: long-form script (channel-specific length) + 2-3 derived Shorts (15-60s each). Both formats from same source; Shorts reuse voice + key visuals.

4. **Run `script-qa`** — hook_score, retention_score, fact_status. Pass requires: hook_score ≥ 7 AND retention_score ≥ 7 AND fact_status != fail.
   - If pass → advance Issue to status `pending_qa`, comment with scores.
   - If fail → iterate up to 2x with QA feedback. If still failing on 3rd try → escalate Tier 1 (`decision-needed`).

5. **Write to `scripts` SQLite table** — draft_md, qa_hook_score, qa_retention_score, qa_fact_status, generated_at.

6. **Pre-submit POV self-check** — for finance-skeptic, run the stress-test: "Could a generic AI finance channel have produced this?" If yes, REJECT your own draft and regenerate. Don't push POV-drift to Head of Content; catch it yourself.

If your heartbeat encounters an unexpected error you cannot resolve, run `escalate-to-board` Tier 2 with the `unknown-failure` reason and the diagnosis attached.
