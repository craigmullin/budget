from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from xml.etree import ElementTree as ET

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN, "r": OFFICE_REL, "p": PACKAGE_REL}

@dataclass(frozen=True)
class Cell:
    ref: str
    value: str | None
    formula: str | None

def excel_date(value: str) -> date:
    return date(1899, 12, 30) + timedelta(days=int(Decimal(value)))

def cents(value: str | None) -> int:
    if value in (None, ""):
        return 0
    return int((Decimal(value) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

def _si_text(node: ET.Element) -> str:
    return "".join(t.text or "" for t in node.findall(".//m:t", NS))

def col_name(number: int) -> str:
    name = ""
    while number:
        number, rem = divmod(number - 1, 26)
        name = chr(65 + rem) + name
    return name

class XlsxReader:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._zip = zipfile.ZipFile(self.path)
        self._shared = self._load_shared()
        self._sheets = self._load_sheets()

    def close(self):
        self._zip.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def _load_shared(self) -> list[str]:
        if "xl/sharedStrings.xml" not in self._zip.namelist():
            return []
        root = ET.fromstring(self._zip.read("xl/sharedStrings.xml"))
        return [_si_text(si) for si in root.findall("m:si", NS)]

    def _load_sheets(self) -> dict[str, str]:
        wb = ET.fromstring(self._zip.read("xl/workbook.xml"))
        rels = ET.fromstring(self._zip.read("xl/_rels/workbook.xml.rels"))
        targets = {r.attrib["Id"]: r.attrib["Target"] for r in rels.findall("p:Relationship", NS)}
        result = {}
        for sheet in wb.find("m:sheets", NS):
            target = targets[sheet.attrib[f"{{{OFFICE_REL}}}id"]].lstrip("/")
            result[sheet.attrib["name"]] = target if target.startswith("xl/") else "xl/" + target
        return result

    @property
    def sheet_names(self) -> list[str]:
        return list(self._sheets)

    def rows(self, sheet_name: str) -> dict[int, dict[str, Cell]]:
        root = ET.fromstring(self._zip.read(self._sheets[sheet_name]))
        result: dict[int, dict[str, Cell]] = {}
        for row in root.findall(".//m:sheetData/m:row", NS):
            row_number = int(row.attrib["r"])
            cells = {}
            for node in row.findall("m:c", NS):
                ref = node.attrib["r"]
                typ = node.attrib.get("t")
                raw_node = node.find("m:v", NS)
                raw = None if raw_node is None else raw_node.text
                inline = node.find("m:is", NS)
                if typ == "s" and raw is not None:
                    value = self._shared[int(raw)]
                elif typ == "inlineStr" and inline is not None:
                    value = _si_text(inline)
                elif typ == "b" and raw is not None:
                    value = "true" if raw == "1" else "false"
                else:
                    value = raw
                formula_node = node.find("m:f", NS)
                cells[re.match(r"[A-Z]+", ref).group()] = Cell(
                    ref, value, None if formula_node is None else formula_node.text
                )
            if cells:
                result[row_number] = cells
        return result

