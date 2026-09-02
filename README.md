# Budget

Budget is the home-budgeting product; M.B is its product mark.

Pass 1 implements only the historical-migration core for the authoritative 2026 workbook:

- a SQLite data model with raw source provenance;
- a dependency-free XLSX importer for the known 2026 workbook structure;
- integer-cent Actual and envelope calculations;
- automated unit/integration tests; and
- a temporary Markdown/JSON parity report.

There is intentionally no UI and no import support for years before 2026 yet.

Run Pass 1:

```powershell
python -m budget.cli pass1 "C:\path\to\Budget 2026.xlsx"
```

Run tests:

```powershell
python -m unittest discover -s tests -v
```

Budget is the future home-budgeting product in the HQ-managed portfolio. It is
part of the shared M.* family as M.B and uses Budget Teal when an accessible
canonical value is approved in Design.

Implementation has not started. See `PROJECT.md` and `NOW.md` for the verified
state.
