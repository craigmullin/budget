# Pass 5 implementation

Status: deployed and verified on Firebase Hosting and Firestore rules.

## Model

- A purchase remains one parent transaction with one bank-matching total.
- Single-envelope records retain the proven representation.
- Split parents carry two to six ordered allocations. The local reference uses `transaction_splits`; cloud changes use six certified slots plus `allocation_count`, exposing only active allocations to application code.
- Imported records remain immutable. Editing one creates or replaces the existing Firestore override.
- Calculations allocate split amounts to their envelopes while summaries and transaction counts use the parent once.

## Interaction

- Standard assignment remains the default.
- Split mode preserves parent fields, defaults the first row to the selected envelope, supports one live remainder row, prevents duplicate envelope choices and displays factual remaining/over states.
- Split detail shows the parent charge and allocation breakdown. A split can return to one envelope only after confirmation when populated rows would be discarded.
- The six-row form stacks on narrow screens and keeps Remaining visible.

## Integrity

- Local writes replace the parent and allocations in one SQLite transaction.
- Cloud writes store the complete split in one revisioned Firestore change document. A stable client-generated ID makes repeated create submissions idempotent with respect to the parent charge.
- Security rules validate two-to-six active expense envelopes, unique categories, positive integer cents and an exact parent-total sum. Unused fixed certification slots must be zero/inactive.
- Backup format v3 includes the full change documents and therefore the certified split state.

## Verification

- Python persistence tests cover create, failed edit rollback, collapse and delete.
- JavaScript model tests cover the $86.43 / $52.17 remainder, one-cent under/over, negative remainder and duplicate categories.
- Cloud parity remains exact for all 1,638 envelope results and 26 period models.
- Firestore emulator tests cover valid split access by both household accounts and rejection of under-allocation, duplicates and zero rows.
- A disposable phone-sized browser test covers entry, remainder, save, list/detail, collapse, reload and delete without horizontal overflow.
- The existing disposable Payday Budget mobile suite continues to pass.

After deployment, stop for the handoff's real-phone household test before receipt scanning or reconciliation work.

Deployment verification confirmed all nine hosted files match the tested release, production source/configuration remained unchanged, and the phone-sized signed-out sign-in gate loads without errors or horizontal overflow. Signed-in real-household testing remains intentionally manual.
