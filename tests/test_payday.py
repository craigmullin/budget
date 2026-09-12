import json
import sqlite3
import unittest
import test_writes
from contextlib import closing
from budget.payday import save, state
from budget.ui import read_model, save_transaction

class PaydayPersistenceTests(unittest.TestCase):
    def setUp(self):
        test_writes.PersistentModelTests.setUp(self)
        with closing(sqlite3.connect(self.database)) as c, c:
            c.execute('UPDATE budget_allocations SET amount_cents=0 WHERE allocation_period_id=2')
            c.execute("INSERT INTO categories (id,canonical_name,category_type,display_order,source_year,source_workbook,source_sheet,source_row,raw_category,import_batch_id) VALUES (3,'Income','income',3,2026,'fixture.xlsx','Budget 2026',3,'Income','fixture')")
            c.execute('CREATE TABLE payday_records (collection TEXT,id TEXT,data TEXT,PRIMARY KEY(collection,id))')
            cfg=dict(start_date='2026-01-16',opening_cents=0,envelope_ids=[1,2],defaults=[15000,5000],periods={'2':{'start':'2026-01-16','end':'2026-01-30'}})
            c.execute('INSERT INTO payday_records VALUES (?,?,?)',('config','payday',json.dumps(cfg)))
        self.draft=dict(period_id=2,session_date='2026-01-16',status='draft',allocations=[15000,5000],available_cents=0,expected_cents=0,expected_summary='',expected_revision=0)

    tearDown=test_writes.PersistentModelTests.tearDown

    def test_persistent_shared_draft_completion_and_unchanged_history(self):
        before=read_model(self.database,1)
        save(self.database,'session',self.draft)
        self.assertEqual(read_model(self.database,2)['envelopes'][0]['budget_cents'],0)
        self.assertEqual(read_model(self.database,2)['payday']['session']['allocations'],[15000,5000])
        save_transaction(self.database,dict(transaction_date='2026-01-16',amount='199.00',category_id=3,account_id=1,description='Paycheck'))
        save(self.database,'session',dict(self.draft,status='completed',expected_revision=1,available_cents=19900))
        after=read_model(self.database,2)
        self.assertEqual(after['payday']['remaining_cents'],-100)
        self.assertEqual(after['envelopes'][0]['budget_cents'],15000)
        self.assertEqual(after['envelopes'][0]['ending_cents'],25000)
        self.assertEqual(read_model(self.database,1)['envelopes'],before['envelopes'])
        with self.assertRaises(ValueError):save(self.database,'session',dict(self.draft,expected_revision=2))
        with closing(sqlite3.connect(self.database)) as c:self.assertEqual(c.execute('SELECT SUM(amount_cents) FROM budget_allocations WHERE allocation_period_id=2').fetchone()[0],0)

    def test_defaults_do_not_change_draft_and_expected_does_not_mint_income(self):
        save(self.database,'session',self.draft)
        save(self.database,'defaults',dict(allocations=[10000,10000],expected_revision=0))
        expectation=dict(source='Wife paycheck',amount_cents=62000,expected_date='2026-01-23',note='',status='pending',expected_revision=0)
        save(self.database,'expected',expectation)
        m=read_model(self.database,2)
        self.assertEqual(m['payday']['remaining_cents'],0)
        self.assertEqual(m['payday']['session']['allocations'],[15000,5000])
        self.assertEqual(m['payday']['defaults'],[10000,10000])
        item=m['payday']['expected'][0]
        save(self.database,'expected',dict(item,status='received',expected_revision=1))
        self.assertEqual(read_model(self.database,2)['summary']['transaction_count'],0)

    def test_extra_income_and_conflict_validation(self):
        save(self.database,'session',self.draft)
        with self.assertRaises(ValueError):save(self.database,'session',self.draft)
        with self.assertRaises(ValueError):save(self.database,'session',dict(self.draft,expected_revision=1,allocations=[1.1,2]))
        save(self.database,'extras',dict(period_id=2,category_id=1,amount='10.00',allocation_date='2026-01-20',description='Gift'))
        m=read_model(self.database,2)
        self.assertEqual(m['payday']['remaining_cents'],-1000)
        self.assertEqual(m['envelopes'][0]['budget_cents'],1000)
        self.assertEqual(m['payday']['session']['status'],'draft')
