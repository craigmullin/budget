import tempfile
import unittest
from pathlib import Path

from budget.importer import import_2026
from budget.ui import read_model

SOURCE = Path(r"C:\Users\cmullin\Downloads\Budget 2026.xlsx")

@unittest.skipUnless(SOURCE.exists(), "Budget 2026 workbook fixture is not available")
class ReadOnlyUiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.database = Path(cls.temp.name) / "budget.sqlite3"
        import_2026(SOURCE, cls.database)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_model_uses_latest_ledger_period_by_default(self):
        model = read_model(self.database)
        self.assertEqual(model["year"], 2026)
        self.assertEqual(model["summary"]["transaction_count"], 1520)
        self.assertEqual(model["selected_period"]["sequence"], 18)
        self.assertEqual(len(model["envelopes"]), 63)

    def test_model_exposes_resolved_exceptions_and_provenance(self):
        model = read_model(self.database, 17)
        codes = {item["exception_code"] for item in model["exceptions"]}
        self.assertIn("2026_CORRECTED_MALFORMED_AMOUNT", codes)
        self.assertIn("2026_LEGACY_ADJUSTMENT_DISPLAY_ROUNDING", codes)
        self.assertEqual(model["envelopes"][0]["source"]["sheet"], "Budget 2026")
