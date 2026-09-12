# Budget

Budget is the home-budgeting product; B. is its product mark, with a Signature Orange period.

Pass 1 implements only the historical-migration core for the authoritative 2026 workbook:

- a SQLite data model with raw source provenance;
- a dependency-free XLSX importer for the known 2026 workbook structure;
- integer-cent Actual and envelope calculations;
- automated unit/integration tests; and
- a temporary Markdown/JSON parity report.

Pass 3 adds persistent transaction entry/edit/delete and envelope-to-envelope money moves to the 2026 browser UI. Changes are stored in SQLite and immediately flow through the proven calculation layer. Budget sessions, reconciliation, and imports before 2026 remain out of scope.

Run Pass 1:

```powershell
python -m budget.cli pass1 "C:\path\to\Budget 2026.xlsx"
```

Run tests:

```powershell
python -m unittest discover -s tests -v
```

Start the writable UI after running Pass 1:

```powershell
python -m budget.cli serve
```

The authoritative visual direction is in `docs/UI-VISUAL-DESIGN-HANDOFF.md`: a warm, editorial household ledger with cream paper, oxblood accents, and the B. mark. Existing source metadata retains its original identifiers.

See `PROJECT.md` and `NOW.md` for the verified state.
