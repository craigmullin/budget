"""Replay equivalent spreadsheet decisions against a disposable imported workbook state.

Independent expected balances use the uploaded worksheet's cached prior envelope,
current Actual and Adj cells, not values computed by Budget's engine. No source edit.
"""
import hashlib
import json
import sqlite3
import sys
import tempfile
from pathlib import Path
from budget.importer import import_2026
from budget.xlsx import XlsxReader, cents
from budget.payday import initialize, save
from budget.ui import read_model, save_transaction

source=Path(sys.argv[1])
source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
config=json.loads(Path('.local/firebase/payday-config.json').read_text())
with XlsxReader(source) as w, tempfile.TemporaryDirectory() as temp:
    rows=w.rows('Budget 2026'); defaults=w.rows('2026 Final')
    assert [cents(defaults[i]['B'].value) for i in range(2,65)]==config['defaults']
    assert cents(defaults[67]['B'].value)==sum(config['defaults'])==358360
    database=Path(temp)/'parallel.sqlite3'
    import_2026(source,database)
    initialize(database)
    history=read_model(database,18)['envelopes']
    for e in history:
        assert e['ending_cents']==cents(rows[e['source']['row']]['CN'].value)
    posted=dict(transaction_date='2026-09-11',amount='3199.00',description='Parallel test Drees income',category_id=1,account_id=1)
    save_transaction(database,posted)
    # New actual expenses entered identically in the parallel spreadsheet equation.
    actuals={25:8421,44:2000}
    for category,amount in actuals.items():
        save_transaction(database,dict(posted,amount=f'{amount/100:.2f}',description='Parallel expense',category_id=category))
    amounts=[*config['defaults']];amounts[0]=9000;amounts[10]=50000;amounts[55]=20000
    draft=dict(period_id=19,session_date='2026-09-11',status='draft',allocations=amounts,available_cents=319900,expected_cents=62000,expected_summary='Wife paycheck: $620.00, expected 2026-09-18',expected_revision=0)
    save(database,'expected',dict(source='Wife paycheck',amount_cents=62000,expected_date='2026-09-18',note='Not posted',status='pending',expected_revision=0))
    save(database,'session',draft)
    assert all(e['budget_cents']==0 for e in read_model(database,19)['envelopes'])
    save(database,'session',dict(draft,status='completed',expected_revision=1))
    after=read_model(database,19)
    for i,category in enumerate(config['envelope_ids']):
        e=next(e for e in after['envelopes'] if e['id']==category)
        row=rows[e['source']['row']]
        assert cents(row['CQ'].value)==0
        expected=cents(row['CN'].value)+amounts[i]-cents(row['CR'].value)-actuals.get(category,0)+cents(row['CT'].value)
        assert e['budget_cents']==amounts[i]
        assert e['ending_cents']==expected,(e['category'],e['ending_cents'],expected)
    assert any(e['ending_cents']<0 for e in after['envelopes'])
    assert after['payday']['remaining_cents']==319900-sum(amounts)<0
    assert read_model(database,18)['envelopes']==history
assert hashlib.sha256(source.read_bytes()).hexdigest()==source_hash
print('PASS: all 63 completed allocations and ending envelopes match the independent spreadsheet cell roll-forward penny-for-penny. Workbook and existing budgets unchanged.')
