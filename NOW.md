# Current state

Last reviewed: 2026-09-02

- Pass 1 historical migration core is implemented for the authoritative 2026 workbook only.
- SQLite schema, XLSX importer, integer-cent calculation engine, provenance metadata, tests, and a temporary parity report are available.
- Pass 1 is approved and PASS. `Expenses!D1501` is imported as `-$13.43` with raw `-13..43` retained as a corrected migration exception.
- The `-$0.01` adjustment net is an approved legacy rounding/display workaround; source values remain unchanged and the exception is documented.
- Pass 2 provides a local, read-only 2026 browser UI backed by the proven SQLite/calculation layer.
- No write functionality or pre-2026 imports have been implemented.
- Next: review the read-only 2026 UI before authorizing further UI capabilities or historical imports.
