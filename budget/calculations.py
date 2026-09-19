from __future__ import annotations

import sqlite3
from .payday import additions
from dataclasses import dataclass

@dataclass(frozen=True)
class EnvelopeResult:
    period_id: int
    category_id: int
    actual_cents: int
    ending_envelope_cents: int

def calculate_envelopes(connection: sqlite3.Connection) -> list[EnvelopeResult]:
    has_splits = connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='transaction_splits'").fetchone() is not None
    periods = connection.execute(
        "SELECT id, calculation_start_date, calculation_end_date_exclusive FROM allocation_periods ORDER BY sequence"
    ).fetchall()
    categories = connection.execute(
        """SELECT DISTINCT c.id
           FROM categories c JOIN budget_allocations b ON b.category_id=c.id
           ORDER BY c.display_order"""
    ).fetchall()
    balances = {row[0]: 0 for row in categories}
    results = []
    supplemental = additions(connection)
    for period_id, start, end in periods:
        for (category_id,) in categories:
            if start is None:
                actual = connection.execute(
                    """SELECT COALESCE(SUM(amount_cents),0) FROM (
                       SELECT t.amount_cents FROM transactions t WHERE t.category_id=? AND t.transaction_date < ?
                         AND NOT EXISTS (SELECT 1 FROM transaction_splits s WHERE s.transaction_id=t.id)
                       UNION ALL SELECT s.amount_cents FROM transaction_splits s JOIN transactions t ON t.id=s.transaction_id
                         WHERE s.category_id=? AND t.transaction_date < ?)""",
                    (category_id, end, category_id, end),
                ).fetchone()[0] if has_splits else connection.execute(
                    "SELECT COALESCE(SUM(amount_cents),0) FROM transactions WHERE category_id=? AND transaction_date < ?",
                    (category_id, end),
                ).fetchone()[0]
            else:
                actual = connection.execute(
                    """SELECT COALESCE(SUM(amount_cents),0) FROM (
                       SELECT t.amount_cents FROM transactions t WHERE t.category_id=? AND t.transaction_date >= ? AND t.transaction_date < ?
                         AND NOT EXISTS (SELECT 1 FROM transaction_splits s WHERE s.transaction_id=t.id)
                       UNION ALL SELECT s.amount_cents FROM transaction_splits s JOIN transactions t ON t.id=s.transaction_id
                         WHERE s.category_id=? AND t.transaction_date >= ? AND t.transaction_date < ?)""",
                    (category_id, start, end, category_id, start, end),
                ).fetchone()[0] if has_splits else connection.execute(
                    "SELECT COALESCE(SUM(amount_cents),0) FROM transactions WHERE category_id=? AND transaction_date >= ? AND transaction_date < ?",
                    (category_id, start, end),
                ).fetchone()[0]
            allocation = connection.execute(
                "SELECT amount_cents FROM budget_allocations WHERE allocation_period_id=? AND category_id=?",
                (period_id, category_id),
            ).fetchone()[0]
            adjustment = connection.execute(
                "SELECT COALESCE(SUM(amount_cents),0) FROM envelope_movements WHERE allocation_period_id=? AND category_id=?",
                (period_id, category_id),
            ).fetchone()[0]
            balances[category_id] += allocation + supplemental.get((period_id, category_id), 0) - actual + adjustment
            results.append(EnvelopeResult(period_id, category_id, actual, balances[category_id]))
    return results
