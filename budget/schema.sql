PRAGMA foreign_keys = ON;

CREATE TABLE import_batches (
    id TEXT PRIMARY KEY,
    source_year INTEGER NOT NULL,
    source_workbook TEXT NOT NULL,
    source_sha256 TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    importer_version TEXT NOT NULL
);

CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    canonical_name TEXT NOT NULL UNIQUE,
    category_type TEXT NOT NULL CHECK (category_type IN ('income','expense','transfer','carryover','currency')),
    reporting_group TEXT,
    active_from TEXT,
    active_to TEXT,
    display_order INTEGER NOT NULL,
    source_year INTEGER NOT NULL,
    source_workbook TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    raw_category TEXT NOT NULL,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id)
);

CREATE TABLE category_aliases (
    id INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    raw_category TEXT NOT NULL,
    source_year INTEGER NOT NULL,
    mapping_confidence TEXT NOT NULL CHECK (mapping_confidence IN ('exact','auto','review')),
    source_workbook TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
    UNIQUE(raw_category, source_year)
);

CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    canonical_name TEXT NOT NULL UNIQUE,
    active_from TEXT,
    active_to TEXT,
    source_year INTEGER NOT NULL,
    source_workbook TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    raw_account TEXT NOT NULL,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id)
);

CREATE TABLE account_aliases (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    raw_account TEXT NOT NULL,
    source_year INTEGER NOT NULL,
    mapping_confidence TEXT NOT NULL CHECK (mapping_confidence IN ('exact','auto','review')),
    source_workbook TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
    UNIQUE(raw_account, source_year)
);

CREATE TABLE transactions (
    id INTEGER PRIMARY KEY,
    transaction_date TEXT NOT NULL,
    description TEXT,
    category_id INTEGER REFERENCES categories(id),
    account_id INTEGER REFERENCES accounts(id),
    amount_cents INTEGER,
    raw_amount TEXT,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('expense','income','transfer','carryover','refund_credit','reimbursement')),
    check_number TEXT,
    reconciled_date TEXT,
    cleared_marker TEXT,
    notes TEXT,
    source_year INTEGER NOT NULL,
    source_workbook TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    raw_category TEXT,
    raw_account TEXT,
    raw_description TEXT,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
    UNIQUE(import_batch_id, source_sheet, source_row)
);

CREATE TABLE allocation_periods (
    id INTEGER PRIMARY KEY,
    label_date TEXT NOT NULL,
    calculation_start_date TEXT,
    calculation_end_date_exclusive TEXT NOT NULL,
    sequence INTEGER NOT NULL UNIQUE,
    source_year INTEGER NOT NULL,
    source_workbook TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    source_cell TEXT NOT NULL,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id)
);

CREATE TABLE budget_allocations (
    id INTEGER PRIMARY KEY,
    allocation_period_id INTEGER NOT NULL REFERENCES allocation_periods(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    amount_cents INTEGER NOT NULL,
    source_year INTEGER NOT NULL,
    source_workbook TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    source_cell TEXT NOT NULL,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
    UNIQUE(allocation_period_id, category_id)
);

CREATE TABLE envelope_movements (
    id INTEGER PRIMARY KEY,
    allocation_period_id INTEGER NOT NULL REFERENCES allocation_periods(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    amount_cents INTEGER NOT NULL,
    source_year INTEGER NOT NULL,
    source_workbook TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    source_cell TEXT NOT NULL,
    raw_description TEXT,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id)
);

CREATE TABLE historical_envelope_snapshots (
    id INTEGER PRIMARY KEY,
    allocation_period_id INTEGER NOT NULL REFERENCES allocation_periods(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    ending_balance_cents INTEGER NOT NULL,
    source_year INTEGER NOT NULL,
    source_workbook TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    source_cell TEXT NOT NULL,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
    UNIQUE(allocation_period_id, category_id)
);

CREATE TABLE migration_review_items (
    id INTEGER PRIMARY KEY,
    item_type TEXT NOT NULL,
    raw_value TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
    source_year INTEGER NOT NULL,
    source_workbook TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER,
    raw_category TEXT,
    raw_account TEXT,
    raw_description TEXT,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id)
);

CREATE TABLE migration_exceptions (
    id INTEGER PRIMARY KEY,
    exception_code TEXT NOT NULL,
    amount_cents INTEGER,
    raw_value TEXT,
    description TEXT NOT NULL,
    resolution TEXT NOT NULL,
    source_year INTEGER NOT NULL,
    source_workbook TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER,
    source_cell TEXT,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id)
);

CREATE TABLE source_parity_values (
    allocation_period_id INTEGER NOT NULL REFERENCES allocation_periods(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    actual_cents INTEGER NOT NULL,
    ending_envelope_cents INTEGER NOT NULL,
    actual_source_cell TEXT NOT NULL,
    ending_source_cell TEXT NOT NULL,
    PRIMARY KEY (allocation_period_id, category_id)
);

CREATE INDEX idx_transactions_category_date ON transactions(category_id, transaction_date);
CREATE INDEX idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
