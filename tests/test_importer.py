import sqlite3
import tempfile
import unittest
from pathlib import Path

from budget.importer import import_2026
from budget.calculations import calculate_envelopes

SOURCE = Path(r"C:\Users\cmullin\Downloads\Budget 2026.xlsx")

@unittest.skipUnless(SOURCE.exists(), "Budget 2026 workbook fixture is not available")
class ImporterIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "budget.sqlite3"
        self.stats = import_2026(SOURCE, self.db_path)
        self.db = sqlite3.connect(self.db_path)

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def test_imports_expected_source_shape(self):
        self.assertEqual(self.stats["transactions"], 1520)
        self.assertEqual(self.stats["categories"], 77)
        self.assertEqual(self.stats["allocation_periods"], 26)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM historical_envelope_snapshots").fetchone()[0], 1638)

    def test_preserves_blank_description_header_by_position(self):
        row = self.db.execute("SELECT raw_description,raw_category,source_row FROM transactions WHERE source_row=2").fetchone()
        self.assertEqual(row, ("2025 Carryover", "Envelope Carryover 2026", 2))

    def test_preserves_manual_carryover_exception(self):
        row = self.db.execute("SELECT amount_cents,source_sheet,source_row,source_cell FROM migration_exceptions WHERE exception_code='2026_MANUAL_CARRYOVER_ADJUSTMENT'").fetchone()
        self.assertEqual(row, (10488, "Expenses", 2, "I2"))

    def test_preserves_transaction_provenance_and_raw_values(self):
        row = self.db.execute("SELECT source_workbook,source_sheet,source_row,raw_category,raw_account,raw_description FROM transactions WHERE source_row=4").fetchone()
        self.assertEqual(row, ("Budget 2026.xlsx", "Expenses", 4, "Food Groceries", "Checking", "Tx to Liam"))

    def test_applies_approved_amount_correction_and_preserves_raw_value(self):
        row = self.db.execute("SELECT amount_cents,raw_amount FROM transactions WHERE source_row=1501").fetchone()
        self.assertEqual(row, (-1343, "-13..43"))
        exception = self.db.execute("SELECT raw_value,amount_cents FROM migration_exceptions WHERE exception_code='2026_CORRECTED_MALFORMED_AMOUNT'").fetchone()
        self.assertEqual(exception, ("-13..43", -1343))

    def test_preserves_source_adjustment_rounding_discrepancy(self):
        self.assertEqual(self.db.execute("SELECT COALESCE(SUM(amount_cents),0) FROM envelope_movements").fetchone()[0], -1)

    def test_calculation_diff_is_limited_to_approved_corrected_source_row(self):
        calculated = {(r.period_id, r.category_id): r for r in calculate_envelopes(self.db)}
        source = self.db.execute("SELECT allocation_period_id,category_id,actual_cents,ending_envelope_cents FROM source_parity_values").fetchall()
        self.assertEqual(len(source), 1638)
        for period_id, category_id, actual, envelope in source:
            result = calculated[(period_id, category_id)]
            if (result.actual_cents, result.ending_envelope_cents) != (actual, envelope):
                category = self.db.execute("SELECT canonical_name FROM categories WHERE id=?", (category_id,)).fetchone()[0]
                self.assertEqual(category, "UK Room & Board")

if __name__ == "__main__":
    unittest.main()
