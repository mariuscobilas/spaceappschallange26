"""Bridge the frozen standalone ML scripts into the API without altering them."""

import importlib.util
import sys
from pathlib import Path
from threading import Lock

_LOCK = Lock()
_DIRECTORY = Path(__file__).resolve().parent
_MODULES = ("prepare_clovis", "prepare_clovis_weather", "clovis_baselines", "clovis_regression", "clovis_scenarios")


def scenario_module():
    # Their source hashes are bound to saved experiments. Resolve only these
    # trusted local modules, preserving the CLI imports without changing sys.path.
    with _LOCK:
        for name in _MODULES:
            path = _DIRECTORY / f"{name}.py"
            if name in sys.modules:
                if Path(sys.modules[name].__file__).resolve() != path:
                    raise RuntimeError(f"Unexpected module identity for {name}")
                continue
            spec = importlib.util.spec_from_file_location(name, path)
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            try:
                spec.loader.exec_module(module)
            except Exception:
                sys.modules.pop(name, None)
                raise
    return sys.modules["clovis_scenarios"]
