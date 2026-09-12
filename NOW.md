# Current state

Last reviewed: 2026-09-12

- Pass 1 historical migration core is implemented for the authoritative 2026 workbook only.
- SQLite schema, XLSX importer, integer-cent calculation engine, provenance metadata, tests, and a temporary parity report are available.
- Pass 1 is approved and PASS. `Expenses!D1501` is imported as `-$13.43` with raw `-13..43` retained as a corrected migration exception.
- The `-$0.01` adjustment net is an approved legacy rounding/display workaround; source values remain unchanged and the exception is documented.
- Pass 3 provides persistent Add/Edit/Delete Transaction and Move Money workflows over the proven SQLite/calculation layer.
- Changes recalculate summaries and envelopes immediately and survive reloads.
- The authoritative visual handoff is implemented: B. mark, warm editorial shell, Home/Envelopes/Transactions/More navigation, and explanatory read-only envelope detail.
- Budget Session, reconciliation, and pre-2026 imports have not been implemented. Expected income is not displayed because no expected-income model exists.
- Firebase Spark migration is deployed to `https://budget-24acc.web.app`. Google sign-in is confirmed enabled, and both Firebase production domains are authorized. First real household sign-in remains to be checked by the user.
- The cloud integer-cent engine matches all 1,638 SQLite results and all 26 period models. The uploaded immutable private seed was verified record-for-record.
- Firestore emulator tests pass for two-account access, immutable provenance, input validation, revision conflicts, and zero-sum linked moves. Hosted mobile signed-out smoke test passes.
- Local SQLite remains a separate reference copy; its edits do not sync to Firebase. Use the hosted site after cutover and download household backups from More.
