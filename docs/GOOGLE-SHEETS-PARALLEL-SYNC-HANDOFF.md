# Budget — Google Sheets Parallel Sync Handoff

## Goal

Temporarily keep the live native Google Sheet current while Craig and his wife begin entering new transactions in Budget.

This is a **one-way parallel-run safety feature**:

```text
Budget transaction → Firestore → Google Sheet Expenses row
```

Budget is the entry point and Firestore is the source of truth for new application activity. The Google Sheet remains a familiar comparison tool for several weeks while the household builds confidence in Budget.

The workbook is a native Google Sheet. Downloaded `.xlsx` files are snapshots used for analysis and migration; this sync must update the native Google Sheet directly and must not download, rewrite or replace an Excel file.

---

## 1. Scope and operating rules

Sync application-created transaction changes only:

- create transaction;
- edit transaction;
- delete transaction;
- eventual split-transaction rows once Pass 5 is implemented.

Do not sync or rewrite:

- immutable imported source transactions;
- historical workbook rows;
- Move Money records;
- Payday Budget sessions;
- defaults;
- expected income;
- extra-income allocations unless they are represented as actual transaction records under the existing model;
- reconciliation state entered manually in the Sheet;
- historical envelope snapshots.

This feature must not turn into general bidirectional synchronization.

During the parallel run:

- new transactions are entered in Budget;
- synced rows may be inspected in Google Sheets;
- synced transaction fields should not be manually edited in the Sheet;
- if a correction is needed, make it in Budget and let the sync update the row.

Add a visible note or protected-range warning to the Sheet explaining that app-owned rows are maintained by Budget.

---

## 2. Existing Expenses worksheet contract

The importer proves the current positional schema:

| Column | Field |
|---|---|
| A | Date |
| B | Description |
| C | Category |
| D | Amount |
| E | Account |
| F | Check number |
| G | Reconciled date |
| H | Cleared marker |
| I | Notes |

The sync must verify these headers/positions before its first write. If the contract does not match, stop and report a schema error. Do not guess new columns or write into a shifted worksheet.

Use canonical category and account labels that exactly match the workbook values already imported by Budget.

Preserve the Sheet's native date and currency types. Do not write formatted dollar strings where numeric values are expected.

---

## 3. Add app-owned metadata columns

Add reserved metadata columns to the right of the existing worksheet data, preferably hidden and clearly labeled. Do not reuse an existing populated column.

Recommended fields:

| Field | Purpose |
|---|---|
| Budget Transaction ID | Stable identity for create/edit/delete and duplicate prevention |
| Budget Split ID | Stable identity for one allocation row when a transaction is split |
| Budget Revision | Detect stale updates |
| Budget Sync Status | Active or Deleted |
| Budget Updated At | Last application update timestamp |
| Budget Source | Constant such as `Budget app` |

Exact column letters must be discovered from the live Sheet rather than assumed in code.

The stable transaction ID is mandatory. Never locate an app-owned row using only date, description and amount.

---

## 4. Recommended architecture

Use a durable sync queue rather than making the Google Sheet update part of the user's transaction save.

```text
1. User saves in Budget
2. Firestore transaction data and sync job are committed
3. Budget confirms the financial save
4. A Google-authorized worker processes pending jobs
5. Worker updates the native Google Sheet
6. Worker records success or a retryable failure in Firestore
```

### Preferred temporary implementation

Use a Google Apps Script bound to the native Sheet as the worker.

The script should:

- run under Craig's authorized Google account;
- use a time-driven trigger during the parallel period;
- read pending sync jobs from Firestore through an authenticated, least-privilege connection;
- write only to the designated workbook and `Expenses` worksheet;
- mark jobs complete only after verifying the written values;
- retry temporary failures safely;
- never expose a reusable credential in browser JavaScript.

A one-to-five-minute delay is acceptable for this parallel-run feature. Immediate synchronization is not required.

If Apps Script cannot authenticate securely to Firestore under the existing project configuration, use a small authenticated backend worker instead. Do **not** deploy an anonymous `doPost` endpoint that trusts transaction JSON from the public internet, and do not embed an Apps Script secret, service-account key or Google Sheets credential in the static web app.

Budget currently operates on Firebase Spark. Before choosing a backend that requires billing, document that requirement and obtain Craig's approval. Prefer the Apps Script worker if it can remain secure and reliable without a billing change.

---

## 5. Firestore sync queue

Create a dedicated collection such as:

```text
households/main/sheet_sync/{job-id}
```

Each job should contain enough information to process and audit the operation without reinterpreting UI state:

```text
job_id
transaction_id
operation                 create | update | delete
transaction_revision
requested_at
requested_by_uid
status                    pending | processing | synced | failed
attempt_count
last_attempt_at
last_error_code
last_error_message
synced_at
sheet_row                  when known
payload/version            validated transaction snapshot or reference
```

Rules:

- creating/editing/deleting a transaction and creating its queue job must be one atomic Firestore operation;
- do not mark a job `synced` until the Sheet write is verified;
- job processing must be idempotent;
- retries must not create duplicate rows;
- only authorized household users may read sync status;
- browser clients must not be able to mark their own jobs successfully synced;
- only the trusted worker may set `processing`, `synced`, worker error details or the final Sheet row;
- retain completed jobs for the duration of the parallel test as an audit trail.

If the existing transaction mutation model stores changes rather than replacing imported records, the queue must refer to the application transaction identity/revision used by that model. Do not alter immutable seed records.

---

## 6. Create behavior

For a new application-created transaction:

1. Validate the transaction was saved successfully in Firestore.
2. Search the metadata column for its Budget Transaction ID.
3. If an active matching row already exists at the same or newer revision, treat the job as already applied.
4. Otherwise append a new row after the current Expenses table.
5. Write A–I using the existing workbook contract.
6. Write the app metadata fields.
7. Copy only the required formatting/data validation behavior from the appropriate neighboring row; do not copy old transaction values.
8. Flush/re-read the row and verify the ID, revision and financial fields.
9. Mark the job synced.

Do not assume that the next row number remains stable between queue creation and processing.

---

## 7. Edit behavior

For an edited app-created transaction:

1. Locate all active rows by stable Budget Transaction ID.
2. Reject or flag unexpected duplicate active rows.
3. Compare revisions.
4. Ignore an older already-superseded job.
5. Update only the transaction-controlled fields.
6. Preserve Sheet-only reconciliation fields unless the corresponding Budget fields were intentionally changed.

The initial transaction-controlled fields are normally:

- A Date;
- B Description;
- C Category;
- D Amount;
- E Account;
- F Check number, when supported;
- I Notes;
- app metadata columns.

Columns G and H may be changed manually during spreadsheet reconciliation. Do not blank or overwrite them during an unrelated Budget edit.

After writing, verify values and record the new revision.

---

## 8. Delete behavior

Prefer a reversible soft-delete during the temporary parallel test.

On deletion in Budget:

- find the row by Budget Transaction ID;
- change Budget Sync Status to `Deleted`;
- visually distinguish or filter the row from active calculations;
- ensure the deleted amount no longer contributes to workbook totals;
- retain transaction identity and audit information.

Implementation may move the row to a protected `Budget Deleted` worksheet instead if that is safer for the workbook formulas. Do not permanently erase it until restore/retry behavior has been tested.

The workbook calculation impact of a soft-deleted row must be explicit. Merely adding a text status while leaving the amount included is not acceptable.

---

## 9. Split transactions

Pass 5 defines one parent purchase with two or more envelope allocations. The Sheet's Expenses structure permits only one category and amount per row, so a split transaction should sync as one Expenses row per allocation.

Example:

```text
Budget parent transaction: Walmart, $32.83

Expenses row 1: Walmart | Food Groceries  | $23.54
Expenses row 2: Walmart | Other Groceries |  $9.29
```

All rows share:

- Budget Transaction ID;
- date;
- description;
- account;
- parent note/context.

Each row has its own:

- Budget Split ID;
- category;
- split amount.

Requirements:

- split rows must total the parent transaction exactly in integer cents before enqueueing;
- create/update/delete the entire split group atomically from Budget's perspective;
- retries must reconcile the complete desired split set by IDs;
- removing a split must retire its former Sheet row;
- adding a split must not duplicate existing rows;
- changing from split to single-envelope must leave exactly one active row;
- the worker must verify the active Sheet rows sum to the parent total before marking the job synced.

Until Pass 5 exists, implement and test single-envelope synchronization without inventing a temporary split model.

---

## 10. Sync status in Budget

Show quiet, factual status in transaction detail and/or edit UI:

- **Spreadsheet synced**
- **Spreadsheet sync pending**
- **Spreadsheet sync failed**
- **Retry spreadsheet sync**

Do not block the normal transaction save while waiting for Google Sheets.

A failed sync means:

- the Budget transaction is still safely saved;
- envelope calculations continue using Firestore;
- the user can retry;
- the failure remains visible until resolved or the sync is intentionally disabled.

Do not show success merely because a request was queued. Success requires verified Sheet state.

A small More/Settings section should show:

- sync enabled/disabled;
- most recent successful sync;
- count of pending jobs;
- count of failed jobs;
- manual **Retry pending syncs** action if useful.

---

## 11. Spreadsheet safety

Before enabling production sync:

1. Create a timestamped backup copy of the native Google Sheet.
2. Record the target spreadsheet ID and exact worksheet name.
3. Verify the A–I schema.
4. Identify the last immutable imported/source row.
5. Confirm where new app-owned rows may begin.
6. Confirm formulas and named ranges expand to include appended rows.
7. Confirm category and account validations accept canonical Budget values.
8. Protect metadata columns from casual edits.
9. Test with a disposable copy of the Google Sheet first.

Hard-code or configure the specific spreadsheet ID; never select a Sheet by title alone.

Restrict the Google authorization to the smallest practical scope and target. Do not log cell contents, OAuth tokens or household financial details unnecessarily.

---

## 12. Recalculation and workbook parity

After each sync batch:

- allow Google Sheets formulas to recalculate;
- verify the inserted transaction is included in the correct allocation-period calculations;
- compare at least the affected envelope balance between Budget and the Sheet;
- surface discrepancies rather than silently normalizing them.

The sync is not complete merely because a row exists. The parallel-run purpose is to confirm equivalent financial outcomes.

Provide an optional audit result per batch:

```text
3 jobs processed
3 rows verified
0 failures
Affected envelope totals agree
```

Do not rewrite the workbook's formulas during normal transaction sync.

---

## 13. Conflict policy

This is deliberately one-way.

If an app-owned Sheet row was manually changed:

- detect the mismatch using ID/revision and expected controlled values;
- do not ingest the manual edit into Budget;
- flag the row as a conflict;
- let Craig choose to restore the Budget value or manually make the equivalent correction in Budget.

The worker must never import arbitrary spreadsheet rows into Firestore.

Manual transactions added directly to the Sheet after sync begins will remain Sheet-only and create divergence. The onboarding note should clearly instruct both household users to enter new transactions in Budget during the test.

---

## 14. Failure and recovery requirements

Handle at minimum:

- unavailable Google service;
- authorization revoked;
- Sheet renamed;
- worksheet renamed/deleted;
- header/schema changed;
- row manually deleted;
- duplicate transaction IDs;
- stale edit job after a newer revision;
- partially applied split group;
- worker timeout;
- Apps Script quota/temporary rate limit;
- Firestore read failure.

Use bounded retry with backoff for temporary errors. Schema, authorization and duplicate-ID failures require human review rather than endless retries.

Provide a reconciliation command/report that compares all active app-created Firestore transactions with all active Budget-owned Sheet rows by transaction/split ID and reports:

- missing rows;
- duplicate rows;
- incorrect controlled values;
- stale revisions;
- orphaned Sheet rows;
- parent/split total mismatches.

The report should be non-destructive by default.

---

## 15. Parallel-run rollout

### Phase 1 — disposable copy

- Clone the live Google Sheet.
- Connect only the cloned spreadsheet.
- Create, edit and delete representative transactions.
- Confirm formulas, formatting and envelope totals.

### Phase 2 — controlled live pilot

- Back up the live Sheet.
- Enable sync for Craig only.
- Enter several known transactions in Budget.
- Compare the Sheet and Budget penny-for-penny.
- Exercise one edit and one delete.
- Confirm retry behavior by simulating a temporary failure.

### Phase 3 — household use

- Enable normal use for both authorized household accounts.
- Keep Budget as the only entry point for new transactions.
- Review pending/failed syncs regularly.
- Compare the two systems through at least two complete allocation periods.

### Phase 4 — retirement

Once Budget is trusted:

- disable creation of new sync jobs;
- allow pending jobs to finish;
- run the final reconciliation report;
- record the cutoff timestamp and last synced transaction ID;
- retain or archive the Apps Script and audit records;
- remove unnecessary Google permissions/credentials;
- keep the final Sheet as a historical safety copy.

Do not leave an abandoned background integration running indefinitely.

---

## 16. Explicitly out of scope

Do not include:

- two-way Google Sheet ↔ Budget synchronization;
- importing arbitrary new Sheet rows;
- treating downloaded `.xlsx` files as the sync target;
- AI receipt scanning;
- UPC lookup;
- bank feeds or Plaid;
- account reconciliation redesign;
- syncing Payday Budget sessions into workbook Budget columns;
- rewriting historical imported rows;
- Google Drive file replacement;
- support for multiple unrelated spreadsheets;
- permanent multi-tenant synchronization.

---

## 17. Required tests

At minimum verify:

1. A new expense produces exactly one correctly mapped Expenses row.
2. Date and amount are native Sheet values, not display strings.
3. Category and account names match the workbook exactly.
4. Retrying the same create job does not add a duplicate.
5. Editing date, description, category, amount, account or notes updates the same row.
6. An older revision cannot overwrite a newer one.
7. Editing does not erase Sheet reconciliation columns G/H.
8. Deleting excludes the transaction from workbook calculations while retaining an audit trail.
9. A failed Sheet write leaves the Firestore transaction intact and the job retryable.
10. A schema/header change blocks writes safely.
11. Duplicate transaction IDs are detected and reported.
12. Both authorized Budget users can create transactions that ultimately sync.
13. Browser users cannot mark queue jobs synced.
14. Existing imported/seed transactions are never queued or modified.
15. Workbook formulas include the newly appended rows.
16. A representative affected envelope agrees penny-for-penny between Budget and the Sheet.
17. Once Pass 5 exists, split rows total the parent amount and retries do not duplicate them.
18. The reconciliation report identifies missing, duplicate, stale and orphaned rows.

---

## Acceptance criteria

The parallel sync is ready when:

- the native Google Sheet is updated without downloading or replacing an `.xlsx` file;
- Budget remains the authoritative entry point for new transactions;
- Firestore saves succeed independently of Google availability;
- new, edited and deleted application transactions are reflected safely in `Expenses`;
- every app-owned row has a stable Budget identity and revision;
- retries are idempotent and do not create duplicates;
- workbook formulas and affected envelope totals remain correct;
- failures are visible and recoverable;
- no browser-exposed secret grants write access to the Sheet;
- immutable imported data remains unchanged;
- the feature can be cleanly disabled after the parallel period.

## Stop condition

After the disposable-copy tests and before enabling the live native Google Sheet, stop for Craig's approval of:

- the target spreadsheet;
- the protected metadata columns;
- the handling of deletions;
- the exact beginning of app-owned rows;
- any Firebase billing or Google authorization change.

After two complete allocation periods, review whether the sync can be retired.
