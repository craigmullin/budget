import tempfile
import unittest
from pathlib import Path

from budget.importer import import_2026
from budget.ui import ValidationError, delete_transaction, move_money, read_model, save_transaction

from workbook_fixture import SOURCE, AVAILABLE, REASON

@unittest.skipUnless(AVAILABLE, REASON)
class WritableUiTests(unittest.TestCase):
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

    def test_transaction_crud_persists_and_recalculates(self):
        before = read_model(self.database, 18)
        envelope = before["envelopes"][0]
        account = before["accounts"][0]
        item_id = save_transaction(self.database, {
            "transaction_date": "2026-09-01", "description": "Test purchase", "amount": "12.34",
            "category_id": envelope["id"], "account_id": account["id"],
        })
        added = read_model(self.database, 18)
        self.assertEqual(added["summary"]["transaction_count"], before["summary"]["transaction_count"] + 1)
        self.assertEqual(next(e for e in added["envelopes"] if e["id"] == envelope["id"])["ending_cents"], envelope["ending_cents"] - 1234)
        save_transaction(self.database, {
            "transaction_date": "2026-09-01", "description": "Edited purchase", "amount": "2.34",
            "category_id": envelope["id"], "account_id": account["id"],
        }, item_id)
        edited = read_model(self.database, 18)
        self.assertEqual(next(e for e in edited["envelopes"] if e["id"] == envelope["id"])["ending_cents"], envelope["ending_cents"] - 234)
        delete_transaction(self.database, item_id)
        self.assertEqual(read_model(self.database, 18)["summary"]["transaction_count"], before["summary"]["transaction_count"])

    def test_move_money_is_balanced_and_persistent(self):
        before = read_model(self.database, 18)
        source, destination = before["envelopes"][:2]
        move_money(self.database, {"period_id": before["selected_period"]["id"], "from_category_id": source["id"],
                                  "to_category_id": destination["id"], "amount": "10.00"})
        after = read_model(self.database, 18)
        self.assertEqual(next(e for e in after["envelopes"] if e["id"] == source["id"])["ending_cents"], source["ending_cents"] - 1000)
        self.assertEqual(next(e for e in after["envelopes"] if e["id"] == destination["id"])["ending_cents"], destination["ending_cents"] + 1000)
        self.assertEqual(after["summary"]["ending_envelope_cents"], before["summary"]["ending_envelope_cents"])

    def test_rejects_out_of_scope_transaction_year(self):
        model = read_model(self.database)
        with self.assertRaises(ValidationError):
            save_transaction(self.database, {"transaction_date": "2027-01-01", "amount": "1.00",
                                             "category_id": model["categories"][0]["id"], "account_id": model["accounts"][0]["id"]})
