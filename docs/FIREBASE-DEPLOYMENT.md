# Firebase Spark deployment

Project: `budget-24acc`. Hosting serves `budget/static`; no Cloud Run, Functions, Cloud SQL, or billing upgrade is used. Firestore is default Standard/free-tier in `us-east1`.

Google sign-in is confirmed enabled in Firebase Authentication, with both Firebase production domains authorized. Database rules independently restrict reads/writes to the verified emails `creaghan1@gmail.com` and `cmlmullin@gmail.com`. Other accounts may sign in but cannot read household data. Never replace these rules with test-mode access. The first real household sign-in needs user verification; credentials are never automated by the deployment tools.

## Data and calculations

`households/main/seed` contains 78 private immutable chunk documents: all SQLite tables, including provenance, parity values, snapshots, and migration exceptions, plus a validation catalog. These are never published as static assets.

`changes` stores transaction overrides or deletion tombstones. Imported records remain intact. App-created transaction IDs are UUIDs. Firestore transactions and revision checks prevent stale forms from overwriting newer edits.

`moves` stores each linked move in one immutable document. The engine derives equal negative and positive legs, making partial moves impossible. Legacy movements remain unchanged in the seed.

The pure JavaScript integer-cent engine matches Python's period windows (including the first unbounded window), null-amount exclusion, signed credits, source adjustments, and roll-forward behavior. All 1,638 results and all 26 period envelope/summary models were compared against the current SQLite data.

## Local verification

```powershell
python -m budget.cloud_export
node tests/cloud-parity.mjs
npm install
npm run test:rules
python -m unittest discover -s tests -v
```

The rules emulator uses `demo-budget`, not production. Java and Firebase CLI are required. Original Python workbook integration tests require the original approved fixture hash; a newer upload is not silently substituted. Set `BUDGET_BASELINE_XLSX` to the original XLSX if available.

## Deployment

Pass 4 is deployed, and its private configuration has been uploaded and verified. Do not rerun the one-time configuration upload for routine releases. The following preparation steps document the original setup without modifying the workbook:

```powershell
python -m scripts.prepare-payday "C:/Users/cmullin/Downloads/Budget 2026.xlsx"
```

The command prints configuration JSON for inspection. Save the reviewed output to `.local/firebase/payday-config.json` (this task has already prepared that file). Never put it in the public Hosting folder. Run `node scripts/firebase-payday.cjs` once to add `seed/payday` with an exists-false precondition. It refuses to overwrite existing configuration and never resets transactions, moves, or source tables. Then deploy rules and Hosting together below. Do not rerun `cloud_export` against a locally edited database to replace the immutable production baseline.

Pass 4's new `settings`, `sessions`, `extras`, and `expected` collections remain private. See PASS-4-IMPLEMENTATION.md for security/data boundaries and the parallel replay results.

```powershell
firebase deploy --only firestore:rules,hosting --project budget-24acc
```

`scripts/firebase-seed.cjs` uses the existing Firebase CLI login in memory, commits the entire seed atomically, and refuses to overwrite any existing seed. Do not rerun imports to reset production. `scripts/firebase-verify.cjs` verifies every uploaded record against `.local/firebase/seed.json` without printing financial data.

## Use and backups

### Current-workbook refreshes

The September 19 authoritative upload has SHA256 `d2e0097b7f5e660ba7b0b15b98f44c41a9e9aaba9fa55d72f82eed9376599d9`; it contains 1,604 transactions through September 12, 2026. All 1,638 Actual/Envelope pairs match the saved worksheet, and all browser calculations / 26 models match the independent Python export. It already contains the September 11 budget, so forward Payday Budget configuration begins September 25. The current 63 defaults total $3,563.99.

The original `seed` table chunks are still intact. The latest source is an immutable private archive at `households/main/source_versions/{sha256}/seed`. Administrator-only `seed/active_source` selects it on sign-in/reload; `seed/catalog` now permits the refreshed transaction IDs. Rules allow only the two verified household accounts to read source archives and deny client writes to archives, catalog and selector. Payday configuration remains unchanged.

`scripts/firebase-refresh-audit.cjs` saves a private production backup under `.local/refresh-2026`. `scripts/firebase-replace-current.cjs prepare|activate|verify` is deliberately restricted to the September 19 audited workbook, verifies the archive before switching, and commits the selector, catalog, Payday configuration and pre-launch mutable-state reset atomically with preconditions. It is not a general repeated-import tool; future refreshes require another audit and explicit conflict handling. Never rerun original seed/configuration uploads or put private exports in Hosting.

Use the hosted site after cutover. `localhost` deliberately remains the separate Python/SQLite reference app; local edits do not synchronize with Firebase. Never use both as the writable source of truth after cutover.

Cloud records refresh after committed writes, via realtime listeners for transactions, moves, defaults, sessions, extra allocations and expectations, and on returning to the browser. Saving requires an internet connection; cloud caching is memory-only rather than persistent shared-computer storage. Sign out on shared devices.

Pass 5 stores a split in its parent `changes` document. Firestore receives six validation slots so rules can certify the complete total within the free-tier expression limit; `allocation_count` identifies the two-to-six active rows and inactive slots must be zero. Application models expose only ordered active allocations.

Use More → Download household backup regularly and store the JSON privately. Format v3 includes seed/configuration, edits and complete split allocations, moves, defaults, sessions, extra allocations and expected income. Spark does not provide the paid automated-backup workflow. Monitor Hosting/Firestore quotas in the console; free-tier limits can interrupt service, not trigger a billing upgrade by this app.
