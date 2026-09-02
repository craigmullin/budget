from __future__ import annotations

import hashlib
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .xlsx import XlsxReader, cents, col_name, excel_date

WORKBOOK_NAME = "Budget 2026.xlsx"
BUDGET_SHEET = "Budget 2026"
EXPENSES_SHEET = "Expenses"
YEAR = 2026

def _value(row, col):
    cell = row.get(col)
    return None if cell is None else cell.value

def _category_type(row_number: int, name: str) -> str:
    if name == "Envelope Carryover 2026":
        return "carryover"
    if name == "Currency":
        return "currency"
    if row_number <= 11:
        return "income"
    if 12 <= row_number <= 14 or name.startswith("Transfer to "):
        return "transfer"
    return "expense"

def _transaction_type(category_type: str, amount_cents: int | None) -> str:
    if category_type == "income" or category_type == "currency":
        return "income"
    if category_type == "carryover":
        return "carryover"
    if category_type == "transfer":
        return "transfer"
    return "refund_credit" if amount_cents is not None and amount_cents < 0 else "expense"

def import_2026(source: str | Path, database: str | Path) -> dict[str, int | str]:
    source = Path(source)
    database = Path(database)
    database.parent.mkdir(parents=True, exist_ok=True)
    if database.exists():
        database.unlink()
    batch_id = str(uuid.uuid4())
    source_sha = hashlib.sha256(source.read_bytes()).hexdigest()
    connection = sqlite3.connect(database)
    connection.execute("PRAGMA foreign_keys=ON")
    connection.executescript(Path(__file__).with_name("schema.sql").read_text(encoding="utf-8"))
    connection.execute(
        "INSERT INTO import_batches VALUES (?,?,?,?,?,?)",
        (batch_id, YEAR, source.name, source_sha, datetime.now(timezone.utc).isoformat(), "pass1-2026-v1"),
    )
    with XlsxReader(source) as book:
        if book.sheet_names != ["Budget 2026", "Expenses", "Vacation", "2026 Final"]:
            raise ValueError(f"Unexpected 2026 sheet set/order: {book.sheet_names}")
        budget = book.rows(BUDGET_SHEET)
        expenses = book.rows(EXPENSES_SHEET)
        if _value(expenses[1], "A") != "Date" or _value(expenses[1], "B") is not None or _value(expenses[1], "C") != "Category":
            raise ValueError("Expenses positional schema changed; expected A=Date, blank B, C=Category")

        category_ids = {}
        for row_number in range(3, 80):
            raw = _value(budget[row_number], "A")
            kind = _category_type(row_number, raw)
            cur = connection.execute(
                """INSERT INTO categories
                (canonical_name,category_type,reporting_group,active_from,active_to,display_order,
                 source_year,source_workbook,source_sheet,source_row,raw_category,import_batch_id)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (raw, kind, None, "2026-01-01", None, row_number, YEAR, source.name, BUDGET_SHEET, row_number, raw, batch_id),
            )
            category_ids[raw] = cur.lastrowid
            connection.execute(
                "INSERT INTO category_aliases (category_id,raw_category,source_year,mapping_confidence,source_workbook,source_sheet,source_row,import_batch_id) VALUES (?,?,?,?,?,?,?,?)",
                (cur.lastrowid, raw, YEAR, "exact", source.name, BUDGET_SHEET, row_number, batch_id),
            )

        raw_accounts = []
        for row_number in sorted(expenses):
            if row_number == 1:
                continue
            raw = _value(expenses[row_number], "E")
            if raw and raw not in raw_accounts:
                raw_accounts.append(raw)
        account_ids = {}
        for raw in raw_accounts:
            first_row = next(r for r in sorted(expenses) if _value(expenses[r], "E") == raw)
            cur = connection.execute(
                "INSERT INTO accounts (canonical_name,active_from,active_to,source_year,source_workbook,source_sheet,source_row,raw_account,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?)",
                (raw, "2026-01-01", None, YEAR, source.name, EXPENSES_SHEET, first_row, raw, batch_id),
            )
            account_ids[raw] = cur.lastrowid
            connection.execute(
                "INSERT INTO account_aliases (account_id,raw_account,source_year,mapping_confidence,source_workbook,source_sheet,source_row,import_batch_id) VALUES (?,?,?,?,?,?,?,?)",
                (cur.lastrowid, raw, YEAR, "exact", source.name, EXPENSES_SHEET, first_row, batch_id),
            )

        review_count = 0
        transaction_count = 0
        for row_number in sorted(expenses):
            if row_number == 1:
                continue
            row = expenses[row_number]
            raw_date = _value(row, "A")
            raw_amount = _value(row, "D")
            if raw_date is None and raw_amount is None:
                continue
            if raw_date is None or raw_amount is None:
                connection.execute(
                    "INSERT INTO migration_review_items (item_type,raw_value,reason,source_year,source_workbook,source_sheet,source_row,raw_category,raw_account,raw_description,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    ("transaction_row", None, "Transaction row lacks date or amount", YEAR, source.name, EXPENSES_SHEET, row_number, _value(row,"C"), _value(row,"E"), _value(row,"B"), batch_id),
                )
                review_count += 1
                continue
            raw_category = _value(row, "C")
            category_id = category_ids.get(raw_category)
            category_type = None
            if category_id is not None:
                category_type = connection.execute("SELECT category_type FROM categories WHERE id=?", (category_id,)).fetchone()[0]
            else:
                connection.execute(
                    "INSERT INTO migration_review_items (item_type,raw_value,reason,source_year,source_workbook,source_sheet,source_row,raw_category,raw_account,raw_description,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    ("category", raw_category, "No exact 2026 category match; not guessed", YEAR, source.name, EXPENSES_SHEET, row_number, raw_category, _value(row,"E"), _value(row,"B"), batch_id),
                )
                review_count += 1
                category_type = "expense"
            try:
                amount = cents(raw_amount)
            except Exception:
                amount = None
                connection.execute(
                    "INSERT INTO migration_review_items (item_type,raw_value,reason,source_year,source_workbook,source_sheet,source_row,raw_category,raw_account,raw_description,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    ("transaction_amount", raw_amount, "Amount is non-numeric; preserved raw and excluded from numeric calculations", YEAR, source.name, EXPENSES_SHEET, row_number, raw_category, _value(row,"E"), _value(row,"B"), batch_id),
                )
                review_count += 1
            connection.execute(
                """INSERT INTO transactions
                (transaction_date,description,category_id,account_id,amount_cents,raw_amount,transaction_type,check_number,
                 reconciled_date,cleared_marker,notes,source_year,source_workbook,source_sheet,source_row,
                 raw_category,raw_account,raw_description,import_batch_id)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (excel_date(raw_date).isoformat(), _value(row,"B"), category_id, account_ids.get(_value(row,"E")), amount, raw_amount,
                 _transaction_type(category_type, amount), _value(row,"F"),
                 excel_date(_value(row,"G")).isoformat() if _value(row,"G") else None,
                 _value(row,"H"), _value(row,"I"), YEAR, source.name, EXPENSES_SHEET, row_number,
                 raw_category, _value(row,"E"), _value(row,"B"), batch_id),
            )
            transaction_count += 1
            if row_number == 2 and _value(row,"I") and "$104.88" in _value(row,"I"):
                connection.execute(
                    "INSERT INTO migration_exceptions (exception_code,amount_cents,description,source_year,source_workbook,source_sheet,source_row,source_cell,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?)",
                    ("2026_MANUAL_CARRYOVER_ADJUSTMENT", 10488, _value(row,"I"), YEAR, source.name, EXPENSES_SHEET, row_number, "I2", batch_id),
                )

        # Each 5-column budget block is Budget, Actual, Envelope, Adjustment; the date anchor is Actual's column.
        period_ids = []
        # 27 source anchors delimit 26 biweekly calculation periods. EF1 is the exclusive 2027 boundary.
        anchor_columns = [6 + 5 * i for i in range(27)]
        anchor_dates = [excel_date(_value(budget[1], col_name(c))) for c in anchor_columns]
        for index, (anchor_col, anchor_date) in enumerate(zip(anchor_columns[:-1], anchor_dates[:-1]), start=1):
            start = None if index == 1 else anchor_dates[index - 1].isoformat()
            end = anchor_dates[index].isoformat()
            anchor_cell = f"{col_name(anchor_col)}1"
            cur = connection.execute(
                "INSERT INTO allocation_periods (label_date,calculation_start_date,calculation_end_date_exclusive,sequence,source_year,source_workbook,source_sheet,source_row,source_cell,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (anchor_date.isoformat(), start, end, index, YEAR, source.name, BUDGET_SHEET, 1, anchor_cell, batch_id),
            )
            period_ids.append(cur.lastrowid)
            for row_number in range(17, 80):
                category_id = category_ids[_value(budget[row_number], "A")]
                budget_col, actual_col, envelope_col, adjustment_col = anchor_col - 1, anchor_col, anchor_col + 1, anchor_col + 2
                for table, amount_col, extra in (
                    ("budget_allocations", budget_col, ""),
                    ("historical_envelope_snapshots", envelope_col, ""),
                ):
                    cell = budget[row_number].get(col_name(amount_col))
                    amount = cents(None if cell is None else cell.value)
                    amount_field = "amount_cents" if table == "budget_allocations" else "ending_balance_cents"
                    connection.execute(
                        f"INSERT INTO {table} (allocation_period_id,category_id,{amount_field},source_year,source_workbook,source_sheet,source_row,source_cell,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?)",
                        (cur.lastrowid, category_id, amount, YEAR, source.name, BUDGET_SHEET, row_number, f"{col_name(amount_col)}{row_number}", batch_id),
                    )
                adjustment_cell = budget[row_number].get(col_name(adjustment_col))
                adjustment = cents(None if adjustment_cell is None else adjustment_cell.value)
                if adjustment:
                    connection.execute(
                        "INSERT INTO envelope_movements (allocation_period_id,category_id,amount_cents,source_year,source_workbook,source_sheet,source_row,source_cell,raw_description,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (cur.lastrowid, category_id, adjustment, YEAR, source.name, BUDGET_SHEET, row_number, f"{col_name(adjustment_col)}{row_number}", "Workbook Adj +/-", batch_id),
                    )
                actual_cell = budget[row_number].get(col_name(actual_col))
                envelope_cell = budget[row_number].get(col_name(envelope_col))
                connection.execute(
                    "INSERT INTO source_parity_values VALUES (?,?,?,?,?,?)",
                    (cur.lastrowid, category_id, cents(None if actual_cell is None else actual_cell.value),
                     cents(None if envelope_cell is None else envelope_cell.value), f"{col_name(actual_col)}{row_number}", f"{col_name(envelope_col)}{row_number}"),
                )
    connection.commit()
    stats = {
        "batch_id": batch_id,
        "transactions": transaction_count,
        "categories": len(category_ids),
        "accounts": len(account_ids),
        "allocation_periods": len(period_ids),
        "review_items": review_count,
    }
    connection.close()
    return stats
