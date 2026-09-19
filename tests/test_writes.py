import sqlite3
import tempfile
import unittest
from pathlib import Path

from budget.ui import ValidationError, delete_transaction, move_money, read_model, save_transaction


class PersistentModelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = Path(self.temp.name) / 'budget.sqlite3'
        db = sqlite3.connect(self.database)
        db.executescript(Path('budget/schema.sql').read_text())
        db.execute("INSERT INTO import_batches VALUES ('fixture',2026,'fixture.xlsx','hash','2026-01-01','test')")
        provenance = {'source_year': 2026, 'source_workbook': 'fixture.xlsx', 'source_sheet': 'Budget 2026',
                      'source_row': 1, 'import_batch_id': 'fixture'}

        def insert(table, **fields):
            values = {**provenance, **fields}
            db.execute(f"INSERT INTO {table} ({','.join(values)}) VALUES ({','.join('?' for _ in values)})", tuple(values.values()))

        for category_id, name in [(1, 'Food'), (2, 'Gas')]:
            insert('categories', id=category_id, canonical_name=name, category_type='expense', display_order=category_id, raw_category=name)
        insert('accounts', id=1, canonical_name='Checking', raw_account='Checking')
        for period_id, start, end in [(1, None, '2026-01-16'), (2, '2026-01-16', '2026-01-30')]:
            insert('allocation_periods', id=period_id, sequence=period_id, label_date=start or '2026-01-02',
                   calculation_start_date=start, calculation_end_date_exclusive=end, source_cell='F1')
            for category_id in (1, 2):
                insert('budget_allocations', allocation_period_id=period_id, category_id=category_id, amount_cents=10000, source_cell='E17')
                db.execute('INSERT INTO source_parity_values VALUES (?,?,?,?,?,?)', (period_id, category_id, 0, period_id * 10000, 'F17', 'G17'))
        db.commit()
        db.close()

    def tearDown(self):
        self.temp.cleanup()

    def payload(self, **changes):
        return {'transaction_date': '2026-01-16', 'description': 'Groceries', 'amount': '12.34',
                'category_id': 1, 'account_id': 1, **changes}

    def test_crud_survives_new_connections_and_preserves_roll_forward(self):
        item = save_transaction(self.database, self.payload())
        first = read_model(self.database, 1)
        second = read_model(self.database, 2)
        self.assertEqual(first['envelopes'][0]['actual_cents'], 0)
        self.assertEqual(second['envelopes'][0]['actual_cents'], 1234)
        self.assertEqual(second['envelopes'][0]['ending_cents'], 18766)
        save_transaction(self.database, self.payload(amount='-2.34', category_id=2), item)
        edited = read_model(self.database, 2)
        self.assertEqual(edited['envelopes'][0]['ending_cents'], 20000)
        self.assertEqual(edited['envelopes'][1]['ending_cents'], 20234)
        self.assertEqual(edited['transactions'][0]['transaction_type'], 'refund_credit')
        delete_transaction(self.database, item)
        self.assertEqual(read_model(self.database, 2)['summary']['transaction_count'], 0)

    def test_detail_explains_balance_and_uses_exclusive_period_boundary(self):
        save_transaction(self.database, self.payload(transaction_date='2026-01-15'))
        save_transaction(self.database, self.payload(transaction_date='2026-01-16', amount='3.00'))
        model = read_model(self.database, 2)
        envelope = model['envelopes'][0]
        self.assertEqual(envelope['starting_cents'], 8766)
        self.assertEqual(envelope['starting_cents'] + envelope['budget_cents'] - envelope['actual_cents'] + envelope['moved_cents'], envelope['ending_cents'])
        self.assertEqual([t['transaction_date'] for t in model['period_transactions']], ['2026-01-16'])
        self.assertEqual(model['period_summary']['spending_cents'], 300)
        self.assertEqual(model['product'], 'B.')

    def test_move_is_zero_sum_and_rolls_forward_without_affecting_actual(self):
        move_money(self.database, {'period_id': 1, 'from_category_id': 1, 'to_category_id': 2, 'amount': '10.00'})
        model = read_model(self.database, 2)
        self.assertEqual([e['ending_cents'] for e in model['envelopes']], [19000, 21000])
        self.assertEqual(model['summary']['ending_envelope_cents'], 40000)
        self.assertEqual(model['summary']['transaction_count'], 0)
        self.assertEqual([e['actual_cents'] for e in model['envelopes']], [0, 0])

    def test_invalid_writes_leave_database_unchanged(self):
        for changes in [{'amount': '1.001'}, {'amount': '0'}, {'transaction_date': '2027-01-01'}, {'category_id': 99}]:
            with self.assertRaises(ValidationError):
                save_transaction(self.database, self.payload(**changes))
        with self.assertRaises(ValidationError):
            move_money(self.database, {'period_id': 1, 'from_category_id': 1, 'to_category_id': 1, 'amount': '10.00'})
        self.assertEqual(read_model(self.database, 1)['summary']['transaction_count'], 0)

    def test_split_create_edit_collapse_and_delete_are_atomic(self):
        item = save_transaction(self.database, self.payload(amount='32.83', allocations=[
            {'category_id': 1, 'amount_cents': 2354}, {'category_id': 2, 'amount_cents': 929},
        ]))
        model = read_model(self.database, 2)
        self.assertEqual(model['transactions'][0]['amount_cents'], 3283)
        self.assertEqual([a['amount_cents'] for a in model['transactions'][0]['allocations']], [2354, 929])
        self.assertEqual([e['actual_cents'] for e in model['envelopes']], [2354, 929])
        with self.assertRaises(ValidationError):
            save_transaction(self.database, self.payload(amount='32.83', allocations=[
                {'category_id': 1, 'amount_cents': 2354}, {'category_id': 2, 'amount_cents': 928},
            ]), item)
        self.assertEqual([e['actual_cents'] for e in read_model(self.database, 2)['envelopes']], [2354, 929])
        save_transaction(self.database, self.payload(amount='32.83', category_id=2), item)
        collapsed = read_model(self.database, 2)
        self.assertEqual(collapsed['transactions'][0]['allocations'], [])
        self.assertEqual([e['actual_cents'] for e in collapsed['envelopes']], [0, 3283])
        delete_transaction(self.database, item)
        self.assertEqual([e['actual_cents'] for e in read_model(self.database, 2)['envelopes']], [0, 0])

    def test_split_rejects_duplicates_negative_zero_and_more_than_six(self):
        invalid = [
            [{'category_id': 1, 'amount_cents': 500}, {'category_id': 1, 'amount_cents': 500}],
            [{'category_id': 1, 'amount_cents': 1001}, {'category_id': 2, 'amount_cents': -1}],
            [{'category_id': 1, 'amount_cents': 1000}, {'category_id': 2, 'amount_cents': 0}],
            [{'category_id': 1 if i % 2 == 0 else 2, 'amount_cents': 100} for i in range(7)],
        ]
        for allocations in invalid:
            with self.assertRaises(ValidationError):
                save_transaction(self.database, self.payload(amount='10.00', allocations=allocations))
        self.assertEqual(read_model(self.database, 2)['summary']['transaction_count'], 0)
