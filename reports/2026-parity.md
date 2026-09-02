# Budget 2026 Pass 1 parity report

Temporary migration report. The source workbook remains authoritative; discrepancies are reported, not corrected.

## Summary

- Transactions imported: 1,520
- Category-period comparisons: 1,638
- Actual matches: 1,637 / 1,638
- Ending-envelope matches: 1,628 / 1,638
- Source rows affected by approved exceptions: 10
- Unresolved parity discrepancies: 0
- Maximum absolute Actual delta: $13.43
- Maximum absolute Ending Envelope delta: $13.43
- Adjustment periods: 14; net adjustment: $-0.01
- Open migration review items: 0

## Preserved workbook behavior

- Allocation-period labels are imported from row 1 and remain distinct from calculation boundaries.
- The first period has no lower date bound, matching the workbook's first-period SUMIFS behavior.
- Negative transactions and negative envelope balances are retained.
- The 2026 $104.88 manual carryover adjustment is stored as a migration exception; it is not silently normalized.
- Raw category, account, description, workbook, sheet, row, and batch provenance are retained.

- **Pass 1 status: PASS**

## Parity exceptions

The following differences are fully explained by the approved correction of `Expenses!D1501` from raw `-13..43` to `-13.43`. Source values remain stored for audit/parity; corrected values drive the data layer.

| Period | Category | Metric | Source | Corrected calculation | Delta | Source cell |
|---:|---|---|---:|---:|---:|---|
| 17 (2026-08-14) | UK Room & Board | Actual | $640.21 | $626.78 | $-13.43 | Budget 2026!CH68 |
| 17 (2026-08-14) | UK Room & Board | Ending Envelope | $3,217.15 | $3,230.58 | $13.43 | Budget 2026!CI68 |
| 18 (2026-08-28) | UK Room & Board | Ending Envelope | $3,617.15 | $3,630.58 | $13.43 | Budget 2026!CN68 |
| 19 (2026-09-11) | UK Room & Board | Ending Envelope | $3,617.15 | $3,630.58 | $13.43 | Budget 2026!CS68 |
| 20 (2026-09-25) | UK Room & Board | Ending Envelope | $3,617.15 | $3,630.58 | $13.43 | Budget 2026!CX68 |
| 21 (2026-10-09) | UK Room & Board | Ending Envelope | $3,617.15 | $3,630.58 | $13.43 | Budget 2026!DC68 |
| 22 (2026-10-23) | UK Room & Board | Ending Envelope | $3,617.15 | $3,630.58 | $13.43 | Budget 2026!DH68 |
| 23 (2026-11-06) | UK Room & Board | Ending Envelope | $3,617.15 | $3,630.58 | $13.43 | Budget 2026!DM68 |
| 24 (2026-11-20) | UK Room & Board | Ending Envelope | $3,617.15 | $3,630.58 | $13.43 | Budget 2026!DR68 |
| 25 (2026-12-04) | UK Room & Board | Ending Envelope | $3,617.15 | $3,630.58 | $13.43 | Budget 2026!DW68 |
| 26 (2026-12-18) | UK Room & Board | Ending Envelope | $3,617.15 | $3,630.58 | $13.43 | Budget 2026!EB68 |

## Release-gate and migration review items

- RESOLVED — Envelope adjustments net to $-0.01. This is an approved legacy rounding/display workaround; source values are preserved.
  - Period 12 (2026-06-05) nets to $-0.01.
- RESOLVED — `Expenses!D1501` raw `-13..43` is retained and imported as the approved corrected value `-13.43`.
- PASS — No open migration review items.
