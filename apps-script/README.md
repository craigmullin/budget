# Budget Google Sheet worker

This is a bound Apps Script worker for a disposable copy and, only after approval, the native workbook. It uses the trigger creator's Google identity to call the Firestore REST API; there is no public web endpoint or stored service-account key.

Before authorization, set Script Properties `FIRESTORE_PROJECT=budget-24acc`, `SHEET_NAME=Expenses`, `HEADER_ROW`, `FIRST_APP_ROW`, and `DELETE_SHEET=Budget Deleted`. The workbook must have the exact nine A:I headers expected by the handoff. `installBudgetSync()` creates a five-minute trigger only after `verifyBudgetSheet()` succeeds.

The worker uses Expenses J:K for Vacation trip/type and adds six hidden metadata columns in L:Q for idempotency. It never writes columns G or H. A new trip is added as a formula-backed column on the Vacation sheet. Deletes are copied to the separate `Budget Deleted` sheet and their active row is cleared in place so deleted amounts leave workbook totals without shifting formula ranges. That deletion strategy, the first app-owned row, the actual workbook target, metadata protection, and authorization must be approved before this is installed on the live workbook.

`reconcileBudgetSheet()` is read-only and returns findings for missing, duplicate, stale, orphaned, incorrect, and total-mismatch rows.
