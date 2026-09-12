# Current state

Last reviewed: 2026-09-12

- Pass 1 historical migration core is implemented for the authoritative 2026 workbook only.
- SQLite schema, XLSX importer, integer-cent calculation engine, provenance metadata, tests, and a temporary parity report are available.
- Pass 1 is approved and PASS. `Expenses!D1501` is imported as `-$13.43` with raw `-13..43` retained as a corrected migration exception.
- The `-$0.01` adjustment net is an approved legacy rounding/display workaround; source values remain unchanged and the exception is documented.
- Pass 3 provides persistent Add/Edit/Delete Transaction and Move Money workflows over the proven SQLite/calculation layer.
- Changes recalculate summaries and envelopes immediately and survive reloads.
- The authoritative visual handoff is implemented: B. mark, warm editorial shell, Home/Envelopes/Transactions/More navigation, and explanatory read-only envelope detail.
- Pass 4 is implemented and verified locally; it has not yet been deployed to Firebase. Budget now supports a shared persistent Payday Budget draft, independent editable defaults, reset, review, immutable completion, expected income, and extra-income allocations.
- Household clarification: one Payday Budget per existing two-week allocation period. The unallocated pool starts at $0 on September 11, 2026; posted income adds to it and completed allocations subtract from it. Subsequent surplus/deficit carries forward. Existing imported budgets are unchanged and cannot receive defaults again.
- All 63 defaults were read from the uploaded `2026 Final` configuration, totaling $3,583.60. The four College defaults map to existing LSU envelopes with names/history preserved, as explicitly approved.
- Negative envelopes and negative unallocated remainder are allowed. Expected income never creates spendable money or automatically posts a transaction. Unexpected income may be allocated any day without reapplying defaults.
- Reconciliation and pre-2026 imports remain out of scope. Stop for household workflow review before Pass 5.
- Firebase Spark migration is deployed to `https://budget-24acc.web.app`. Google sign-in is confirmed enabled, and both Firebase production domains are authorized. First real household sign-in remains to be checked by the user.
- The cloud integer-cent engine matches all 1,638 SQLite results and all 26 period models. The uploaded immutable private seed was verified record-for-record.
- Pass 4 parallel replay imported the newly uploaded workbook into a disposable database and compared all 63 new allocations/ending envelopes to independent worksheet prior-envelope/Actual/Adj cells, penny-for-penny. Source XLSX hash and existing budgets stayed unchanged. This is an automated cell-based replay, not a manual Excel session with the household.
- Local mobile end-to-end checks pass for reset, shared persisted draft state, independent defaults, expected income, review, negative completion, reload, and extra-income allocation. Firestore emulator tests pass for atomic certification of all 63 amounts, cross-account access, revision conflicts, and immutable once-per-period completion.
- Python suite: 8 tests pass; 12 original-workbook fixture tests skip because Downloads now holds a newer workbook (1,570 vs 1,520 transactions). Original fixture assertions are retained and keyed to the approved source hash; use BUDGET_BASELINE_XLSX to rerun them. Golden production seed parity still passes all 1,638 results / 26 models.
- Firestore emulator tests pass for two-account access, immutable provenance, input validation, revision conflicts, and zero-sum linked moves. Hosted mobile signed-out smoke test passes.
- Local SQLite remains a separate reference copy; its edits do not sync to Firebase. Use the hosted site after cutover and download household backups from More.
