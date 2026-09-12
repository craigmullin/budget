from __future__ import annotations

import argparse
import json

from .importer import import_2026
from .parity import generate_parity_report
from .ui import serve

def main(argv=None):
    parser = argparse.ArgumentParser(prog="budget")
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("pass1", help="Import the 2026 workbook and generate parity results")
    run.add_argument("source")
    run.add_argument("--database", default=".local/pass1/budget-2026.sqlite3")
    run.add_argument("--report", default="reports/2026-parity.md")
    run.add_argument("--json", default=".local/pass1/2026-parity.json")
    ui = sub.add_parser("serve", help="Serve the writable 2026 UI")
    ui.add_argument("--database", default=".local/pass1/budget-2026.sqlite3")
    ui.add_argument("--host", default="127.0.0.1")
    ui.add_argument("--port", default=8765, type=int)
    args = parser.parse_args(argv)
    if args.command == "pass1":
        stats = import_2026(args.source, args.database)
        stats["parity"] = generate_parity_report(args.database, args.report, args.json)
        print(json.dumps(stats, indent=2))
    else:
        serve(args.database, args.host, args.port)

if __name__ == "__main__":
    main()
