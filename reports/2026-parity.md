# Budget 2026 Pass 1 parity report

Temporary migration report. The source workbook remains authoritative; discrepancies are reported, not corrected.

## Summary

- Transactions imported: 1,520
- Category-period comparisons: 1,638
- Actual matches: 1,638 / 1,638
- Ending-envelope matches: 1,638 / 1,638
- Rows with any discrepancy: 0
- Maximum absolute Actual delta: $0.00
- Maximum absolute Ending Envelope delta: $0.00
- Adjustment periods: 14; net adjustment: $-0.01
- Open migration review items: 1

## Preserved workbook behavior

- Allocation-period labels are imported from row 1 and remain distinct from calculation boundaries.
- The first period has no lower date bound, matching the workbook's first-period SUMIFS behavior.
- Negative transactions and negative envelope balances are retained.
- The 2026 $104.88 manual carryover adjustment is stored as a migration exception; it is not silently normalized.
- Raw category, account, description, workbook, sheet, row, and batch provenance are retained.

## Discrepancies

None. Imported/calculated Actual and Ending Envelope values match the workbook penny-for-penny for all category-period comparisons.

## Release-gate and migration review items

- FAIL — Envelope adjustments net to $-0.01, not $0.00. Preserved without correction.
  - Period 12 (2026-06-05) nets to $-0.01.
- REVIEW — `Expenses` row 1501, transaction_amount: raw value `-13..43`. Amount is non-numeric; preserved raw and excluded from numeric calculations.
