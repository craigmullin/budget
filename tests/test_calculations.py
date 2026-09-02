import sqlite3
import unittest

from budget.calculations import calculate_envelopes

class CalculationTests(unittest.TestCase):
    def test_rolls_budget_actual_and_adjustment_in_cents(self):
        db = sqlite3.connect(":memory:")
        db.executescript("""
        CREATE TABLE allocation_periods(id INTEGER, sequence INTEGER, calculation_start_date TEXT, calculation_end_date_exclusive TEXT);
        CREATE TABLE categories(id INTEGER, category_type TEXT, display_order INTEGER);
        CREATE TABLE transactions(category_id INTEGER, transaction_date TEXT, amount_cents INTEGER);
        CREATE TABLE budget_allocations(allocation_period_id INTEGER, category_id INTEGER, amount_cents INTEGER);
        CREATE TABLE envelope_movements(allocation_period_id INTEGER, category_id INTEGER, amount_cents INTEGER);
        INSERT INTO categories VALUES (1,'expense',1);
        INSERT INTO allocation_periods VALUES (1,1,NULL,'2026-01-16'),(2,2,'2026-01-16','2026-01-30');
        INSERT INTO transactions VALUES (1,'2026-01-01',2500),(1,'2026-01-20',1200),(1,'2026-01-21',-200);
        INSERT INTO budget_allocations VALUES (1,1,10000),(2,1,5000);
        INSERT INTO envelope_movements VALUES (2,1,-300);
        """)
        results = calculate_envelopes(db)
        self.assertEqual((results[0].actual_cents, results[0].ending_envelope_cents), (2500, 7500))
        self.assertEqual((results[1].actual_cents, results[1].ending_envelope_cents), (1000, 11200))

if __name__ == "__main__":
    unittest.main()

