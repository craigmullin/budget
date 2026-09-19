# Google Sheets parallel sync — implementation record

Status: activated in production on 2026-09-19.

## Implemented boundary

- Only app-created transaction create, edit, and delete mutations can enqueue jobs.
- The transaction change and its deterministic `sheet_sync/{transaction_id}_{revision}` job are one Firestore transaction.
- Existing imports, moves, Payday Budget records, defaults, expected income, and historical source records never enqueue jobs.
- The browser may read job status and requeue a failed job. It cannot claim, complete, or mark a job synced.
- Splits use one Sheet row per active allocation. The stable allocation identity is transaction ID plus category ID.
- The worker reads the authoritative `changes` record rather than trusting a client-provided financial payload.
- The worker owns A:F and I:K plus hidden metadata L:Q. App transaction merchants populate column B, Notes populate I, and Vacation trip/type populate J:K. It preserves reconciliation columns G:H.
- Deletes copy app-owned rows to `Budget Deleted` and clear the active row in place. This removes the amount from totals without shrinking formula ranges.
- A read-only reconciliation function reports missing, duplicate, stale, orphaned, incorrect-amount, and total-mismatch rows.
- A transient worker error is retried up to three attempts. Permanent revision/verification failures require household retry after correction.

## Activation guard

Sync is off unless immutable admin seed document `households/main/seed/sheet_sync` contains `enabled: true`. Production now contains that activation document for the approved workbook, `Expenses` tab, and first app row 1606.

## Approval gate before live use

The next phase needs the household's approval of:

1. exact Google Sheet and `Expenses` tab;
2. exact A:I header row and the first app-owned row below immutable history;
3. hidden/protected metadata columns L:Q;
4. move-to-`Budget Deleted` deletion behavior;
5. authorization of the bound Apps Script under the chosen Google account;
6. a disposable-copy test before any live workbook installation.

The gate was approved and completed. The bound worker is authorized under `cmlmullin@gmail.com`; its five-minute trigger is active. The first production job synced the existing $32.83 Walmart split and the worker's read-only reconciliation returned an empty findings list.

The authoritative workbook's literal A:I headers are `Date`, `Merchant`, `Category`, `Amount`, `Account`, `Check #`, `Reconciled`, blank, and `Notes`. Columns G:H remain workbook-owned and are never written by the worker.
