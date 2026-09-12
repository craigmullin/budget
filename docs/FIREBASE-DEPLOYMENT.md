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

The rules emulator uses `demo-budget`, not production. Java and Firebase CLI are required. Python workbook integration tests are skipped if the source XLSX is unavailable.

## Deployment

```powershell
firebase deploy --only firestore:rules,hosting --project budget-24acc
```

`scripts/firebase-seed.cjs` uses the existing Firebase CLI login in memory, commits the entire seed atomically, and refuses to overwrite any existing seed. Do not rerun imports to reset production. `scripts/firebase-verify.cjs` verifies every uploaded record against `.local/firebase/seed.json` without printing financial data.

## Use and backups

Use the hosted site after cutover. `localhost` deliberately remains the separate Python/SQLite reference app; local edits do not synchronize with Firebase. Never use both as the writable source of truth after cutover.

Cloud records refresh after committed writes, via realtime change/move listeners, and on returning to the browser. Saving requires an internet connection; cloud caching is memory-only rather than persistent shared-computer storage. Sign out on shared devices.

Use More → Download household backup regularly and store the JSON privately. It includes the seed and current cloud edits/moves. Spark does not provide the paid automated-backup workflow. Monitor Hosting/Firestore quotas in the console; free-tier limits can interrupt service, not trigger a billing upgrade by this app.
