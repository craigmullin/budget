from __future__ import annotations

import json
import mimetypes
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .calculations import calculate_envelopes

STATIC = Path(__file__).with_name("static")

def read_model(database: str | Path, period_sequence: int | None = None) -> dict:
    connection = sqlite3.connect(f"file:{Path(database).resolve()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    periods = connection.execute("SELECT id,sequence,label_date,calculation_end_date_exclusive FROM allocation_periods ORDER BY sequence").fetchall()
    latest_date = connection.execute("SELECT MAX(transaction_date) FROM transactions").fetchone()[0]
    if period_sequence is None:
        selected = next((p for p in periods if latest_date < p["calculation_end_date_exclusive"]), periods[-1])
    else:
        selected = next((p for p in periods if p["sequence"] == period_sequence), periods[-1])
    calculations = {(r.period_id, r.category_id): r for r in calculate_envelopes(connection)}
    envelope_rows = connection.execute(
        """SELECT c.id,c.canonical_name,b.amount_cents,s.actual_source_cell,s.ending_source_cell,
                  c.source_sheet,c.source_row
           FROM budget_allocations b JOIN categories c ON c.id=b.category_id
           JOIN source_parity_values s ON s.category_id=c.id AND s.allocation_period_id=b.allocation_period_id
           WHERE b.allocation_period_id=? ORDER BY c.display_order""",
        (selected["id"],),
    ).fetchall()
    envelopes = []
    for row in envelope_rows:
        calc = calculations[(selected["id"], row["id"])]
        envelopes.append({
            "category": row["canonical_name"], "budget_cents": row["amount_cents"],
            "actual_cents": calc.actual_cents, "ending_cents": calc.ending_envelope_cents,
            "source": {"sheet": row["source_sheet"], "row": row["source_row"],
                       "actual_cell": row["actual_source_cell"], "ending_cell": row["ending_source_cell"]},
        })
    transactions = [dict(r) for r in connection.execute(
        """SELECT transaction_date,description,raw_category,amount_cents,raw_amount,transaction_type,
                  raw_account,source_sheet,source_row
           FROM transactions ORDER BY transaction_date DESC,source_row DESC LIMIT 100"""
    ).fetchall()]
    exceptions = [dict(r) for r in connection.execute(
        "SELECT exception_code,amount_cents,raw_value,description,resolution,source_sheet,source_row,source_cell FROM migration_exceptions ORDER BY id"
    ).fetchall()]
    true_income = connection.execute("SELECT COALESCE(SUM(amount_cents),0) FROM transactions WHERE transaction_type='income'").fetchone()[0]
    spending = connection.execute("SELECT COALESCE(SUM(amount_cents),0) FROM transactions WHERE transaction_type IN ('expense','refund_credit')").fetchone()[0]
    result = {
        "product": "M.B", "year": 2026, "as_of": latest_date,
        "summary": {"income_cents": true_income, "spending_cents": spending,
                    "ending_envelope_cents": sum(e["ending_cents"] for e in envelopes),
                    "transaction_count": connection.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]},
        "periods": [{"sequence": p["sequence"], "label_date": p["label_date"]} for p in periods],
        "selected_period": {"sequence": selected["sequence"], "label_date": selected["label_date"]},
        "envelopes": envelopes, "transactions": transactions, "exceptions": exceptions,
    }
    connection.close()
    return result

def make_handler(database: str | Path):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path == "/api/model":
                requested = parse_qs(parsed.query).get("period", [None])[0]
                try:
                    payload = read_model(database, int(requested) if requested else None)
                except ValueError:
                    self.send_error(400, "period must be an integer")
                    return
                body = json.dumps(payload).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            relative = "index.html" if parsed.path == "/" else parsed.path.lstrip("/")
            target = (STATIC / relative).resolve()
            if STATIC.resolve() not in target.parents and target != STATIC.resolve():
                self.send_error(404)
                return
            if not target.is_file():
                self.send_error(404)
                return
            body = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            self.send_error(405, "Budget Pass 2 is read-only")

        def log_message(self, format, *args):
            pass
    return Handler

def serve(database: str | Path, host: str = "127.0.0.1", port: int = 8765):
    server = ThreadingHTTPServer((host, port), make_handler(database))
    print(f"M.B read-only UI: http://{host}:{port}")
    server.serve_forever()

