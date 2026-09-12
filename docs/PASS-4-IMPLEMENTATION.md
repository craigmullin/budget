# Payday Budget implementation and review

The household's clarifications supersede the weekly wording of the handoff: one Payday Budget per existing two-week allocation period, weekly reconciliation deferred. Defaults never apply twice to the same period. September 11, 2026 is the first untouched allocation period. The forward unallocated pool starts at zero and never derives an opening deficit from imported records.

## Data boundaries

The immutable `seed/payday` configuration contains the approved forward periods, stable envelope order, XLSX default provenance and zero opening pool. No imported source table is rewritten. Four College configuration labels map to existing LSU envelopes, as approved.

`settings/defaults` holds independent active defaults. `sessions/{period-id}` holds the single household draft or immutable completed snapshot (date, allocations, reviewed available money, expected amount and description). The allocated total and remaining-at-completion are derived from the exact stored integer amounts, not redundant stored totals. Draft changes save automatically after valid edits and can also be saved explicitly. Revision conflicts require reloading the shared draft.

Each defaults/session write atomically writes seven small `checks/{0..6}` records alongside the parent. Each check validates nine of the 63 allocations and certifies the full list/revision. Parent rules require all seven matching certifications using `getAfter`. This respects Firestore's 1,000-expression rule limit while validating every integer amount and preventing partial completion. Certificates are derived validation data, not additional funding, and need not be included in household backups.

`expected` records source/amount/date/note/status independently. Received/removed expectations are excluded from projections and never create transactions. Posted real income is the only income added to the forward pool; future-dated income is excluded until its date arrives. Transfer/carryover records retain existing semantics and are not silently treated as new income.

`extras` stores immutable one-envelope allocations with date/note/amount. It reduces the same pool and increases Budget in that envelope. It does not create income, move existing envelope money, or load defaults. Its date must belong to the selected period and cannot be in the future. Negative remaining money is allowed, as with normal funding.

Completed session/extra allocations are supplemental Budget amounts in the proven roll-forward equation. Envelope detail identifies application funding separately from imported source references. Backup format v2 includes configuration, defaults, sessions, extras, expected income, transaction changes, and moves.

Local SQLite uses a separate `payday_records` table with the same supplemental semantics. The local server refuses to initialize the workflow against mismatched or already-funded source periods. Local activity never syncs to Firebase.

## Verification

```powershell
python -m unittest discover -s tests
node tests/cloud-parity.mjs
node tests/payday-model.mjs
npm run test:rules
node tests/payday-browser.cjs
python -m tests.payday-parallel "C:/Users/cmullin/Downloads/Budget 2026.xlsx"
```

The browser test copies the original SQLite reference to a disposable database and uses local port 8771. The parallel test imports the newer uploaded workbook only into a disposable database, checks its cached prior-period envelopes against the starting state, then independently evaluates worksheet cells plus equivalent new decisions. All 63 resulting allocations and ending balances agree to the penny. No workbook or production transaction changes are made. Native Excel interactive execution has not been performed.

Original Pass 1 fixture tests require the approved original XLSX hash. The newer uploaded copy has additional transactions and corrected raw text, so it is not substituted for that fixture. Set `BUDGET_BASELINE_XLSX` to an original copy to rerun those assertions. The immutable production seed/oracle remains the 1,638-result parity baseline.

## Release status

Implementation and automated validation are complete locally. Production remains on Pass 3 until deployment is approved. See the configuration/deployment steps in FIREBASE-DEPLOYMENT.md. After release, review a real two-week workflow with Craig and his wife. Do not begin reconciliation or historical migration before their review.
