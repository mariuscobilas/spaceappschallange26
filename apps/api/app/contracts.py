"""Compatibility exports; canonical API contracts live in shared.python.schemas."""

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from shared.python.clovis_schemas import __all__
from shared.python.schemas import *  # noqa: F403