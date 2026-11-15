"""Acquire small provider files needed to investigate Mandan plot identities."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/raw/mandan_linkage_v1"
FILES = {
    "cover_biomass.csv": 49752705,
    "cover_biomass_metadata.csv": 49752702,
    "response_crop_yield_metadata.csv": 49752711,
    "soil_study_biomass.csv": 46309573,
    "soil_study_biomass_metadata.csv": 46309576,
    "soil_study_dictionary.xlsx": 46309552,
}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, file_id in FILES.items():
        target = OUTPUT / name
        metadata = target.with_suffix(target.suffix + ".source.json")
        url = f"https://ndownloader.figshare.com/files/{file_id}"
        if target.exists():
            prior = json.loads(metadata.read_text(encoding="utf-8"))
            if prior["url"] != url or prior["sha256"] != hashlib.sha256(target.read_bytes()).hexdigest():
                raise ValueError(f"Cached source differs: {target}")
            print(f"Verified {name}", flush=True)
            continue
        with urlopen(Request(url, headers={"User-Agent": "FieldShift-Mandan-linkage-audit/1"}), timeout=40) as response:
            data = response.read(10_000_001)
        if not data or len(data) > 10_000_000 or (name.endswith(".csv") and data.lstrip().startswith(b"<")):
            raise ValueError(f"Unexpected provider payload: {name}")
        if name.endswith(".xlsx") and not data.startswith(b"PK"):
            raise ValueError("Provider payload is not XLSX")
        target.write_bytes(data)
        metadata.write_text(json.dumps({"url": url, "file_id": file_id, "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data), "retrieved_utc": datetime.now(timezone.utc).isoformat()}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"Downloaded {name}: {len(data)} bytes", flush=True)


if __name__ == "__main__":
    main()
