"""Supplemental application records; migrated tables are never rewritten for sessions."""
from __future__ import annotations
import json
import sqlite3
import uuid
from contextlib import closing
from datetime import date
from pathlib import Path

def available(connection):
    return connection.execute("SELECT 1 FROM sqlite_master WHERE name='payday_records'").fetchone() is not None

def records(connection, collection):
    if not available(connection): return []
    return [dict(json.loads(r[1]), id=r[0]) for r in connection.execute('SELECT id,data FROM payday_records WHERE collection=?', (collection,))]

def config(connection):
    rows=records(connection,'config')
    return rows[0] if rows else None

def initialize(database):
    path=Path('.local/firebase/payday-config.json')
    if not path.exists(): return
    settings=json.loads(path.read_text())
    with closing(sqlite3.connect(database)) as c, c:
        for period_id,period in settings['periods'].items():
            existing=c.execute('SELECT label_date,calculation_end_date_exclusive FROM allocation_periods WHERE id=?',(int(period_id),)).fetchone()
            allocations=c.execute('SELECT category_id,amount_cents FROM budget_allocations WHERE allocation_period_id=? ORDER BY category_id',(int(period_id),)).fetchall()
            if existing!=(period['start'],period['end']) or {r[0] for r in allocations}!=set(settings['envelope_ids']) or any(r[1]!=0 for r in allocations):
                raise ValueError('Local database does not match the approved unfunded forward periods. No defaults were applied.')
        c.execute('CREATE TABLE IF NOT EXISTS payday_records (collection TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(collection,id))')
        c.execute('INSERT OR IGNORE INTO payday_records VALUES (?,?,?)',('config','payday',json.dumps(settings)))

def additions(connection):
    result={}
    cfg=config(connection)
    if not cfg: return result
    for s in records(connection,'sessions'):
        if s['status']=='completed':
            for category,amount in zip(cfg['envelope_ids'],s['allocations']):
                result[(s['period_id'],category)]=result.get((s['period_id'],category),0)+amount
    for e in records(connection,'extras'):
        key=(e['period_id'],e['category_id'])
        result[key]=result.get(key,0)+e['amount_cents']
    return result

def state(connection, period_id):
    cfg=config(connection)
    if not cfg: return None
    sessions=records(connection,'sessions'); extras=records(connection,'extras'); defaults=records(connection,'settings')
    period=cfg['periods'].get(str(period_id)); end=period['end'] if period else cfg['start_date']
    today=date.today().isoformat()
    posted=connection.execute("SELECT COALESCE(SUM(amount_cents),0) FROM transactions WHERE transaction_type='income' AND transaction_date>=? AND transaction_date<? AND transaction_date<=?",(cfg['start_date'],end,today)).fetchone()[0]
    committed=sum(sum(s['allocations']) for s in sessions if s['status']=='completed' and cfg['periods'][str(s['period_id'])]['start']<end)+sum(e['amount_cents'] for e in extras if cfg['periods'][str(e['period_id'])]['start']<end)
    return dict(eligible=bool(period),config=cfg,defaults=defaults[0]['allocations'] if defaults else cfg['defaults'],defaults_revision=defaults[0]['revision'] if defaults else 0,
                session=next((s for s in sessions if s['period_id']==period_id),None),posted_cents=posted,committed_cents=committed,remaining_cents=posted-committed,
                expected=[e for e in records(connection,'expected') if e['status']=='pending'],extras=[e for e in extras if e['period_id']==period_id],today=today)

def save(database, route, payload):
    with closing(sqlite3.connect(database)) as c, c:
        c.execute('BEGIN IMMEDIATE')
        cfg=config(c)
        if not cfg: raise ValueError('Payday Budget configuration is unavailable.')
        def cents(value, positive=False):
            if type(value) is not int or value<(1 if positive else 0) or value>100000000: raise ValueError('Enter a valid amount in integer cents.')
            return value
        def valid_date(value):
            if not isinstance(value,str) or date.fromisoformat(value).isoformat()!=value or not value.startswith('2026-'): raise ValueError('Choose a valid date in 2026.')
            return value
        def text(value, limit):
            if not isinstance(value,str) or len(value)>limit: raise ValueError('Text is too long or invalid.')
            return value
        if route=='extras':
            period=cfg['periods'].get(str(payload.get('period_id')))
            when=valid_date(payload.get('allocation_date'))
            if not period or not period['start']<=when<period['end'] or when>date.today().isoformat(): raise ValueError('Choose a date in this period, no later than today.')
            if payload.get('category_id') not in cfg['envelope_ids']: raise ValueError('Choose an envelope.')
            from decimal import Decimal
            raw=Decimal(str(payload.get('amount')))
            if not raw.is_finite() or raw.as_tuple().exponent < -2: raise ValueError('Amount must have at most two decimal places.')
            record=dict(period_id=payload['period_id'],category_id=payload['category_id'],amount_cents=cents(int(raw*100),True),allocation_date=when,description=text(payload.get('description',''),250))
            collection='extras'; item_id=str(uuid.uuid4())
        else:
            collection={'defaults':'settings','session':'sessions','expected':'expected'}.get(route)
            if not collection: raise ValueError('Unknown Payday Budget action.')
            item_id='defaults' if route=='defaults' else str(payload['period_id']) if route=='session' else payload.get('id') or str(uuid.uuid4())
            old=next((r for r in records(c,collection) if r['id']==item_id),None)
            revision=old['revision'] if old else 0
            if revision!=payload.get('expected_revision',0): raise ValueError('This household record changed. Reload before saving.')
            if old and old.get('status')=='completed': raise ValueError('This period already has a completed Payday Budget.')
            if route=='expected':
                source=text(payload.get('source'),100)
                if not source.strip(): raise ValueError('Expected income source is required.')
                status=payload.get('status','pending')
                if status not in ('pending','received','dismissed'): raise ValueError('Invalid expected income status.')
                record=dict(source=source,amount_cents=cents(payload.get('amount_cents'),True),expected_date=valid_date(payload.get('expected_date')),note=text(payload.get('note',''),250),status=status)
            else:
                allocations=payload.get('allocations')
                if not isinstance(allocations,list) or len(allocations)!=len(cfg['envelope_ids']): raise ValueError('Every envelope needs an allocation.')
                allocations=[cents(v) for v in allocations]
                record=dict(allocations=allocations)
                if route=='session':
                    period=cfg['periods'].get(item_id); when=valid_date(payload.get('session_date'))
                    if not period or not period['start']<=when<period['end']: raise ValueError('Imported budgets cannot receive new defaults. Choose a session date in the allocation period.')
                    status=payload.get('status')
                    if status not in ('draft','completed') or (not old and status!='draft'): raise ValueError('Start a draft before completing it.')
                    actual=payload.get('available_cents'); expected=payload.get('expected_cents')
                    if type(actual) is not int or abs(actual)>1000000000000 or type(expected) is not int or not 0<=expected<=1000000000000: raise ValueError('Invalid review totals.')
                    record.update(period_id=payload['period_id'],session_date=when,status=status,allocated_cents=sum(allocations),available_cents=actual,remaining_cents=actual-sum(allocations),expected_cents=expected,expected_summary=text(payload.get('expected_summary',''),10000))
            record.update(revision=revision+1)
        c.execute('INSERT OR REPLACE INTO payday_records VALUES (?,?,?)',(collection,item_id,json.dumps(record)))
    return {'saved':True}
