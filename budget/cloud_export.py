"""Export an immutable, private Firebase seed and Python parity oracle."""
import argparse
import json
import sqlite3
from pathlib import Path

from .calculations import calculate_envelopes
from .ui import read_model


def export(database, output):
    connection = sqlite3.connect(f'file:{Path(database).resolve()}?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    tables = [r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    data = {table: [dict(r) for r in connection.execute(f'SELECT * FROM {table}')] for table in tables}
    oracle = [r.__dict__ for r in calculate_envelopes(connection)]
    connection.close()
    directory = Path(output)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'seed.json').write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
    (directory / 'oracle.json').write_text(json.dumps(oracle), encoding='utf-8')
    (directory / 'models.json').write_text(json.dumps([read_model(database, p) for p in range(1, 27)]), encoding='utf-8')
    print('Private seed and 26-period parity oracle exported outside Hosting.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', default='.local/pass1/budget-2026.sqlite3')
    parser.add_argument('--output', default='.local/firebase')
    args = parser.parse_args()
    export(args.database, args.output)
