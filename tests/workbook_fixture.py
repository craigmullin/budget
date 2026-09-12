"""Original approved Pass 1 fixture identity, not whichever workbook is in Downloads."""
import hashlib
import os
from pathlib import Path
SOURCE=Path(os.environ.get('BUDGET_BASELINE_XLSX',r'C:\Users\cmullin\Downloads\Budget 2026.xlsx'))
APPROVED_SHA256='f25f13ce4d579cf0408bcaa18b6669657040d9676ca40b3b3c0f2c061990c043'
AVAILABLE=SOURCE.exists() and hashlib.sha256(SOURCE.read_bytes()).hexdigest()==APPROVED_SHA256
REASON='Original approved Pass 1 workbook fixture unavailable (newer upload is not the baseline); set BUDGET_BASELINE_XLSX.'
