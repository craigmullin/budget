from __future__ import annotations

import json
import mimetypes
import sqlite3
from datetime import date
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .calculations import calculate_envelopes
from .payday import additions, state as payday_state, save as save_payday, initialize as initialize_payday

STATIC = Path(__file__).with_name("static")
APP_SOURCE_SHEET = "M.B App"


class ValidationError(ValueError):
    pass


def _connect(database: str | Path, *, readonly: bool = False) -> sqlite3.Connection:
    path = Path(database).resolve()
    connection = sqlite3.connect(f"file:{path}?mode={'ro' if readonly else 'rw'}", uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    if not readonly:
        connection.executescript("""CREATE TABLE IF NOT EXISTS transaction_splits (
          transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
          position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 5),
          category_id INTEGER NOT NULL REFERENCES categories(id),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          PRIMARY KEY (transaction_id, position), UNIQUE (transaction_id, category_id));""")
    return connection


def _required_text(payload: dict, field: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{field.replace('_', ' ')} is required")
    return value.strip()


def _integer(payload: dict, field: str) -> int:
    value = payload.get(field)
    if isinstance(value, bool):
        raise ValidationError(f"{field.replace('_', ' ')} must be an integer")
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{field.replace('_', ' ')} must be an integer") from None


def _amount_cents(payload: dict) -> int:
    if "amount_cents" in payload:
        amount = _integer(payload, "amount_cents")
    else:
        raw = str(payload.get("amount", "")).replace("$", "").replace(",", "").strip()
        try:
            value = Decimal(raw)
        except InvalidOperation:
            raise ValidationError("amount must be a valid dollar amount") from None
        if not value.is_finite() or value.as_tuple().exponent < -2:
            raise ValidationError("amount must have at most two decimal places")
        amount = int(value * 100)
    if amount == 0:
        raise ValidationError("amount must not be zero")
    return amount


def _iso_date(payload: dict) -> str:
    raw = _required_text(payload, "transaction_date")
    try:
        parsed = date.fromisoformat(raw)
    except ValueError:
        raise ValidationError("transaction date must be a valid date") from None
    if parsed.year != 2026:
        raise ValidationError("transaction date must be in 2026")
    return parsed.isoformat()


def _lookup(connection: sqlite3.Connection, table: str, item_id: int) -> sqlite3.Row:
    row = connection.execute(f"SELECT * FROM {table} WHERE id=?", (item_id,)).fetchone()
    if row is None:
        raise ValidationError(f"unknown {table[:-1]}")
    return row


def _transaction_type(category_type: str, amount_cents: int) -> str:
    if category_type in ("income", "currency"):
        return "income"
    if category_type == "carryover":
        return "carryover"
    if category_type == "transfer":
        return "transfer"
    return "refund_credit" if amount_cents < 0 else "expense"


def _splits(connection: sqlite3.Connection, payload: dict, total: int) -> list[tuple[int, int]]:
    raw = payload.get("allocations")
    if raw is None:
        return []
    if not isinstance(raw, list) or not 2 <= len(raw) <= 6 or total <= 0:
        raise ValidationError("a split purchase needs two to six positive allocations")
    result = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValidationError("each split needs an envelope and amount")
        category = _lookup(connection, "categories", _integer(item, "category_id"))
        amount = _integer(item, "amount_cents")
        if category["category_type"] != "expense" or amount <= 0:
            raise ValidationError("split allocations must be positive expense envelopes")
        result.append((category["id"], amount))
    if len({category for category, _ in result}) != len(result):
        raise ValidationError("each split must use a different envelope")
    if sum(amount for _, amount in result) != total:
        raise ValidationError("split amounts must equal the transaction total")
    return result


def _next_source_row(connection: sqlite3.Connection, table: str) -> int:
    return connection.execute(
        f"SELECT COALESCE(MAX(source_row),0)+1 FROM {table} WHERE source_sheet=?", (APP_SOURCE_SHEET,)
    ).fetchone()[0]


def _batch_id(connection: sqlite3.Connection) -> str:
    row = connection.execute("SELECT id FROM import_batches ORDER BY imported_at DESC LIMIT 1").fetchone()
    if row is None:
        raise ValidationError("the 2026 workbook must be imported before making changes")
    return row[0]


def save_transaction(database: str | Path, payload: dict, transaction_id: int | None = None) -> int:
    connection = _connect(database)
    try:
        transaction_date = _iso_date(payload)
        description = str(payload.get("description") or "").strip() or None
        account = _lookup(connection, "accounts", _integer(payload, "account_id"))
        amount = _amount_cents(payload)
        splits = _splits(connection, payload, amount)
        category = _lookup(connection, "categories", splits[0][0] if splits else _integer(payload, "category_id"))
        kind = _transaction_type(category["category_type"], amount)
        if transaction_id is None:
            cursor = connection.execute(
                """INSERT INTO transactions
                   (transaction_date,description,category_id,account_id,amount_cents,raw_amount,transaction_type,
                    source_year,source_workbook,source_sheet,source_row,raw_category,raw_account,raw_description,import_batch_id)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (transaction_date, description, category["id"], account["id"], amount, str(Decimal(amount) / 100), kind,
                 2026, APP_SOURCE_SHEET, APP_SOURCE_SHEET, _next_source_row(connection, "transactions"),
                 category["canonical_name"], account["canonical_name"], description, _batch_id(connection)),
            )
            transaction_id = cursor.lastrowid
        else:
            if connection.execute("SELECT id FROM transactions WHERE id=?", (transaction_id,)).fetchone() is None:
                raise ValidationError("transaction not found")
            connection.execute(
                """UPDATE transactions SET transaction_date=?,description=?,category_id=?,account_id=?,amount_cents=?,
                   raw_amount=?,transaction_type=?,raw_category=?,raw_account=?,raw_description=? WHERE id=?""",
                (transaction_date, description, category["id"], account["id"], amount, str(Decimal(amount) / 100), kind,
                category["canonical_name"], account["canonical_name"], description, transaction_id),
            )
        connection.execute("DELETE FROM transaction_splits WHERE transaction_id=?", (transaction_id,))
        connection.executemany("INSERT INTO transaction_splits VALUES (?,?,?,?)",
                               [(transaction_id, position, category_id, split_amount)
                                for position, (category_id, split_amount) in enumerate(splits)])
        connection.commit()
        return transaction_id
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def delete_transaction(database: str | Path, transaction_id: int) -> None:
    connection = _connect(database)
    try:
        if connection.execute("DELETE FROM transactions WHERE id=?", (transaction_id,)).rowcount != 1:
            raise ValidationError("transaction not found")
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def move_money(database: str | Path, payload: dict) -> None:
    connection = _connect(database)
    try:
        period = _lookup(connection, "allocation_periods", _integer(payload, "period_id"))
        from_category = _lookup(connection, "categories", _integer(payload, "from_category_id"))
        to_category = _lookup(connection, "categories", _integer(payload, "to_category_id"))
        if from_category["id"] == to_category["id"]:
            raise ValidationError("source and destination envelopes must be different")
        amount = _amount_cents(payload)
        if amount < 0:
            raise ValidationError("move amount must be positive")
        eligible = {row[0] for row in connection.execute(
            "SELECT category_id FROM budget_allocations WHERE allocation_period_id=?", (period["id"],)
        )}
        if from_category["id"] not in eligible or to_category["id"] not in eligible:
            raise ValidationError("money can only be moved between envelopes in the selected period")
        description = str(payload.get("description") or "").strip() or "Moved in Budget"
        source_row = _next_source_row(connection, "envelope_movements")
        batch = _batch_id(connection)
        for category_id, signed_amount in ((from_category["id"], -amount), (to_category["id"], amount)):
            connection.execute(
                """INSERT INTO envelope_movements
                   (allocation_period_id,category_id,amount_cents,source_year,source_workbook,source_sheet,
                    source_row,source_cell,raw_description,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (period["id"], category_id, signed_amount, 2026, APP_SOURCE_SHEET, APP_SOURCE_SHEET,
                 source_row, "App move", description, batch),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def read_model(database: str | Path, period_sequence: int | None = None) -> dict:
    connection = _connect(database, readonly=True)
    periods = connection.execute("SELECT id,sequence,label_date,calculation_start_date,calculation_end_date_exclusive FROM allocation_periods ORDER BY sequence").fetchall()
    if not periods:
        connection.close()
        raise ValidationError("no allocation periods are available")
    latest_date = connection.execute("SELECT MAX(transaction_date) FROM transactions").fetchone()[0]
    if period_sequence is None:
        selected = next((p for p in periods if latest_date and latest_date < p["calculation_end_date_exclusive"]), periods[-1])
    else:
        selected = next((p for p in periods if p["sequence"] == period_sequence), periods[-1])
    calculations = {(r.period_id, r.category_id): r for r in calculate_envelopes(connection)}
    rows = connection.execute(
        """SELECT c.id,c.canonical_name,b.amount_cents,s.actual_source_cell,s.ending_source_cell,c.source_sheet,c.source_row
           FROM budget_allocations b JOIN categories c ON c.id=b.category_id
           JOIN source_parity_values s ON s.category_id=c.id AND s.allocation_period_id=b.allocation_period_id
           WHERE b.allocation_period_id=? ORDER BY c.display_order""", (selected["id"],)
    ).fetchall()
    envelopes = []
    supplemental = additions(connection)
    for row in rows:
        calc = calculations[(selected["id"], row["id"])]
        moved = connection.execute("SELECT COALESCE(SUM(amount_cents),0) FROM envelope_movements WHERE allocation_period_id=? AND category_id=?", (selected["id"], row["id"])).fetchone()[0]
        budget = row["amount_cents"] + supplemental.get((selected["id"], row["id"]), 0)
        envelopes.append({"id": row["id"], "category": row["canonical_name"], "budget_cents": budget,
                          "actual_cents": calc.actual_cents, "ending_cents": calc.ending_envelope_cents,
                          "moved_cents": moved, "starting_cents": calc.ending_envelope_cents - budget + calc.actual_cents - moved,
                          "source": {"sheet": row["source_sheet"], "row": row["source_row"],
                                     "actual_cell": row["actual_source_cell"], "ending_cell": row["ending_source_cell"]}})
        if supplemental.get((selected['id'],row['id']),0):
            envelopes[-1]['application_budget_cents'] = supplemental[(selected['id'],row['id'])]
    has_splits = connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='transaction_splits'").fetchone() is not None
    def transaction_rows(query, parameters=()):
        result = [dict(r) for r in connection.execute(query, parameters).fetchall()]
        for item in result:
            item["allocations"] = [dict(r) for r in connection.execute(
                """SELECT s.category_id,s.amount_cents,c.canonical_name AS category
                   FROM transaction_splits s JOIN categories c ON c.id=s.category_id
                   WHERE s.transaction_id=? ORDER BY s.position""", (item["id"],)).fetchall()] if has_splits else []
            if item["allocations"]:
                item["raw_category"] = f"Split · {len(item['allocations'])} envelopes"
        return result
    transactions = transaction_rows(
        """SELECT id,transaction_date,description,category_id,account_id,amount_cents,raw_amount,transaction_type,
                  raw_category,raw_account,source_sheet,source_row
           FROM transactions ORDER BY transaction_date DESC,id DESC LIMIT 100"""
    )
    period_transactions = transaction_rows(
        """SELECT id,transaction_date,description,category_id,account_id,amount_cents,transaction_type,
                  raw_category,raw_account,source_sheet,source_row
           FROM transactions WHERE transaction_date < ? AND (? IS NULL OR transaction_date >= ?)
           ORDER BY transaction_date DESC,id DESC""",
        (selected["calculation_end_date_exclusive"], selected["calculation_start_date"], selected["calculation_start_date"]),
    )
    exceptions = [dict(r) for r in connection.execute(
        "SELECT exception_code,amount_cents,raw_value,description,resolution,source_sheet,source_row,source_cell FROM migration_exceptions ORDER BY id"
    ).fetchall()]
    result = {
        "product": "B.", "year": 2026, "as_of": latest_date,
        "period_summary": {
            "income_cents": sum(t["amount_cents"] or 0 for t in period_transactions if t["transaction_type"] == "income"),
            "spending_cents": sum(t["amount_cents"] or 0 for t in period_transactions if t["transaction_type"] in ("expense", "refund_credit")),
        },
        "summary": {
            "income_cents": connection.execute("SELECT COALESCE(SUM(amount_cents),0) FROM transactions WHERE transaction_type='income'").fetchone()[0],
            "spending_cents": connection.execute("SELECT COALESCE(SUM(amount_cents),0) FROM transactions WHERE transaction_type IN ('expense','refund_credit')").fetchone()[0],
            "ending_envelope_cents": sum(e["ending_cents"] for e in envelopes),
            "transaction_count": connection.execute("SELECT COUNT(*) FROM transactions").fetchone()[0],
        },
        "periods": [{"id": p["id"], "sequence": p["sequence"], "label_date": p["label_date"]} for p in periods],
        "selected_period": {"id": selected["id"], "sequence": selected["sequence"], "label_date": selected["label_date"],
                            "end_date_exclusive": selected["calculation_end_date_exclusive"]},
        "categories": [dict(r) for r in connection.execute("SELECT id,canonical_name,category_type FROM categories ORDER BY display_order")],
        "accounts": [dict(r) for r in connection.execute("SELECT id,canonical_name FROM accounts ORDER BY canonical_name")],
        "envelopes": envelopes, "transactions": transactions, "period_transactions": period_transactions, "exceptions": exceptions,
    }
    result['payday'] = payday_state(connection, selected['id'])
    connection.close()
    return result


def make_handler(database: str | Path):
    initialize_payday(database)
    class Handler(BaseHTTPRequestHandler):
        def _json(self, status: int, payload: dict):
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _payload(self) -> dict:
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise ValidationError("invalid content length") from None
            if length <= 0 or length > 64_000:
                raise ValidationError("a JSON request body is required")
            try:
                payload = json.loads(self.rfile.read(length))
            except (json.JSONDecodeError, UnicodeDecodeError):
                raise ValidationError("request body must be valid JSON") from None
            if not isinstance(payload, dict):
                raise ValidationError("request body must be a JSON object")
            return payload

        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path == "/api/model":
                requested = parse_qs(parsed.query).get("period", [None])[0]
                try:
                    payload = read_model(database, int(requested) if requested else None)
                except ValueError as error:
                    self._json(400, {"error": str(error) or "period must be an integer"})
                    return
                self._json(200, payload)
                return
            relative = "index.html" if parsed.path == "/" else parsed.path.lstrip("/")
            target = (STATIC / relative).resolve()
            if (STATIC.resolve() not in target.parents and target != STATIC.resolve()) or not target.is_file():
                self.send_error(404)
                return
            body = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _write(self):
            parsed = urlparse(self.path)
            try:
                payload = self._payload() if self.command != "DELETE" else {}
                if self.command == 'POST' and parsed.path.startswith('/api/payday/'):
                    self._json(200, save_payday(database, parsed.path.rsplit('/', 1)[1], payload))
                elif self.command == "POST" and parsed.path == "/api/transactions":
                    self._json(201, {"id": save_transaction(database, payload)})
                elif self.command == "PUT" and parsed.path.startswith("/api/transactions/"):
                    item_id = int(parsed.path.rsplit("/", 1)[1])
                    save_transaction(database, payload, item_id)
                    self._json(200, {"id": item_id})
                elif self.command == "DELETE" and parsed.path.startswith("/api/transactions/"):
                    delete_transaction(database, int(parsed.path.rsplit("/", 1)[1]))
                    self._json(200, {"deleted": True})
                elif self.command == "POST" and parsed.path == "/api/moves":
                    move_money(database, payload)
                    self._json(201, {"moved": True})
                else:
                    self._json(404, {"error": "not found"})
            except (ValidationError, ValueError) as error:
                self._json(400, {"error": str(error)})
            except sqlite3.Error:
                self._json(500, {"error": "the change could not be saved"})

        do_POST = _write
        do_PUT = _write
        do_DELETE = _write

        def log_message(self, format, *args):
            pass
    return Handler


def serve(database: str | Path, host: str = "127.0.0.1", port: int = 8765):
    server = ThreadingHTTPServer((host, port), make_handler(database))
    print(f"Budget writable UI: http://{host}:{port}")
    server.serve_forever()
