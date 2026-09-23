"""Garante que os módulos do driver (collect, shopee_parser) importem nos testes."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))