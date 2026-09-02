from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .calculations import calculate_envelopes

def generate_parity_report(database: str | Path, markdown_path: str | Path, json_path: str | Path | None = None) -> dict:
    connection = sqlite3.connect(database)
    calculated = {(r.period_id, r.category_id): r for r in calculate_envelopes(connection)}
    rows = connection.execute(
        """SELECT p.sequence,p.label_date,c.canonical_name,s.actual_cents,s.ending_envelope_cents,
                  s.actual_source_cell,s.ending_source_cell,p.id,c.id
           FROM source_parity_values s
           JOIN allocation_periods p ON p.id=s.allocation_period_id
           JOIN categories c ON c.id=s.category_id
           ORDER BY p.sequence,c.display_order"""
    ).fetchall()
    details = []
    for sequence, label_date, category, source_actual, source_envelope, actual_cell, envelope_cell, period_id, category_id in rows:
        calc = calculated[(period_id, category_id)]
        details.append({
            "period": sequence, "label_date": label_date, "category": category,
            "source_actual_cents": source_actual, "calculated_actual_cents": calc.actual_cents,
            "actual_delta_cents": calc.actual_cents - source_actual,
            "source_envelope_cents": source_envelope, "calculated_envelope_cents": calc.ending_envelope_cents,
            "envelope_delta_cents": calc.ending_envelope_cents - source_envelope,
            "actual_source_cell": actual_cell, "envelope_source_cell": envelope_cell,
        })
    mismatches = [d for d in details if d["actual_delta_cents"] or d["envelope_delta_cents"]]
    adjustment_periods = connection.execute(
        "SELECT COUNT(DISTINCT allocation_period_id), COALESCE(SUM(amount_cents),0) FROM envelope_movements"
    ).fetchone()
    nonzero_adjustment_periods = connection.execute(
        """SELECT p.sequence,p.label_date,SUM(m.amount_cents)
           FROM envelope_movements m JOIN allocation_periods p ON p.id=m.allocation_period_id
           GROUP BY p.id HAVING SUM(m.amount_cents) <> 0 ORDER BY p.sequence"""
    ).fetchall()
    review_items = connection.execute(
        "SELECT item_type,raw_value,reason,source_sheet,source_row FROM migration_review_items WHERE status='open' ORDER BY id"
    ).fetchall()
    stats = {
        "comparison_count": len(details),
        "actual_match_count": sum(d["actual_delta_cents"] == 0 for d in details),
        "envelope_match_count": sum(d["envelope_delta_cents"] == 0 for d in details),
        "mismatch_count": len(mismatches),
        "max_abs_actual_delta_cents": max((abs(d["actual_delta_cents"]) for d in details), default=0),
        "max_abs_envelope_delta_cents": max((abs(d["envelope_delta_cents"]) for d in details), default=0),
        "adjustment_period_count": adjustment_periods[0],
        "adjustment_net_cents": adjustment_periods[1],
        "review_item_count": connection.execute("SELECT COUNT(*) FROM migration_review_items WHERE status='open'").fetchone()[0],
        "transaction_count": connection.execute("SELECT COUNT(*) FROM transactions").fetchone()[0],
    }
    markdown_path = Path(markdown_path)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Budget 2026 Pass 1 parity report", "",
        "Temporary migration report. The source workbook remains authoritative; discrepancies are reported, not corrected.", "",
        "## Summary", "",
        f"- Transactions imported: {stats['transaction_count']:,}",
        f"- Category-period comparisons: {stats['comparison_count']:,}",
        f"- Actual matches: {stats['actual_match_count']:,} / {stats['comparison_count']:,}",
        f"- Ending-envelope matches: {stats['envelope_match_count']:,} / {stats['comparison_count']:,}",
        f"- Rows with any discrepancy: {stats['mismatch_count']:,}",
        f"- Maximum absolute Actual delta: ${stats['max_abs_actual_delta_cents']/100:,.2f}",
        f"- Maximum absolute Ending Envelope delta: ${stats['max_abs_envelope_delta_cents']/100:,.2f}",
        f"- Adjustment periods: {stats['adjustment_period_count']}; net adjustment: ${stats['adjustment_net_cents']/100:,.2f}",
        f"- Open migration review items: {stats['review_item_count']}", "",
        "## Preserved workbook behavior", "",
        "- Allocation-period labels are imported from row 1 and remain distinct from calculation boundaries.",
        "- The first period has no lower date bound, matching the workbook's first-period SUMIFS behavior.",
        "- Negative transactions and negative envelope balances are retained.",
        "- The 2026 $104.88 manual carryover adjustment is stored as a migration exception; it is not silently normalized.",
        "- Raw category, account, description, workbook, sheet, row, and batch provenance are retained.", "",
        "## Discrepancies", "",
    ]
    if not mismatches:
        lines.append("None. Imported/calculated Actual and Ending Envelope values match the workbook penny-for-penny for all category-period comparisons.")
    else:
        lines.extend(["| Period | Category | Metric | Source | Calculated | Delta | Source cell |", "|---:|---|---|---:|---:|---:|---|"])
        for d in mismatches:
            if d["actual_delta_cents"]:
                lines.append(f"| {d['period']} ({d['label_date']}) | {d['category']} | Actual | ${d['source_actual_cents']/100:,.2f} | ${d['calculated_actual_cents']/100:,.2f} | ${d['actual_delta_cents']/100:,.2f} | Budget 2026!{d['actual_source_cell']} |")
            if d["envelope_delta_cents"]:
                lines.append(f"| {d['period']} ({d['label_date']}) | {d['category']} | Ending Envelope | ${d['source_envelope_cents']/100:,.2f} | ${d['calculated_envelope_cents']/100:,.2f} | ${d['envelope_delta_cents']/100:,.2f} | Budget 2026!{d['envelope_source_cell']} |")
    lines.extend(["", "## Release-gate and migration review items", ""])
    if stats["adjustment_net_cents"] == 0:
        lines.append("- PASS — Envelope adjustments net to $0.00.")
    else:
        lines.append(f"- FAIL — Envelope adjustments net to ${stats['adjustment_net_cents']/100:,.2f}, not $0.00. Preserved without correction.")
        for sequence, label_date, amount in nonzero_adjustment_periods:
            lines.append(f"  - Period {sequence} ({label_date}) nets to ${amount/100:,.2f}.")
    if review_items:
        for item_type, raw_value, reason, sheet, row in review_items:
            lines.append(f"- REVIEW — `{sheet}` row {row}, {item_type}: raw value `{raw_value}`. {reason}.")
    else:
        lines.append("- PASS — No open migration review items.")
    markdown_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    if json_path:
        Path(json_path).write_text(json.dumps({"summary": stats, "comparisons": details}, indent=2), encoding="utf-8")
    connection.close()
    return stats
