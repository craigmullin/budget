"""Read-only extraction of forward defaults. Never modifies the source workbook/seed."""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from budget.xlsx import XlsxReader, cents

seed = json.loads(Path('.local/firebase/seed.json').read_text())
with XlsxReader(sys.argv[1]) as workbook:
    rows = workbook.rows('2026 Final')
    by_name = {c['canonical_name'].strip(): c for c in seed['categories']}
    defaults = []
    for row in range(2, 65):
        name = rows[row]['A'].value.strip()
        # Explicit migration aliases, never fuzzy category matching.
        name = name.replace('College ', 'LSU ')  # Household-approved mapping; preserve existing names.
        category = by_name[name]
        defaults.append({'category_id': category['id'], 'amount_cents': cents(rows[row]['B'].value),
                         'source_cell': f'B{row}'})
    assert sum(d['amount_cents'] for d in defaults) == cents(rows[67]['B'].value) == 358360
    assert {d['category_id'] for d in defaults} == {b['category_id'] for b in seed['budget_allocations']}
periods = [p for p in seed['allocation_periods'] if p['label_date'] >= '2026-09-11']
assert all(a['amount_cents'] == 0 for a in seed['budget_allocations'] if a['allocation_period_id'] in {p['id'] for p in periods})
config = {'start_date': '2026-09-11', 'opening_cents': 0, 'envelope_ids': [d['category_id'] for d in defaults],
          'defaults': [d['amount_cents'] for d in defaults], 'provenance': defaults,
          'source_sheet': '2026 Final', 'periods': {str(p['id']): {'start': p['label_date'], 'end': p['calculation_end_date_exclusive']} for p in periods}}
config['date_millis'] = {(datetime(2026,1,1,tzinfo=timezone.utc)+timedelta(days=i)).date().isoformat(): int((datetime(2026,1,1,tzinfo=timezone.utc)+timedelta(days=i)).timestamp()*1000) for i in range(365)}
print(json.dumps(config))
