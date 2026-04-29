#!/usr/bin/env python3
"""Parse Gatling stats.json for benchmark iteration summaries.

ANL-01: extract p50/p75/p95/p99 and request failure counts, split by
Gatling region groups when present.

ANL-05: raw_requests.jsonl generation from binary simulation.log is deferred
to Phase 6. Gatling's binary log format is not a stable documented API, so
the first analyzer version records the deferral explicitly and focuses on the
stable stats.json report contract.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from pathlib import Path
from typing import Any


StatsDict = dict[str, Any]


def _as_number(value: Any, default: float = 0.0) -> float:
    """Return a numeric value from Gatling JSON, tolerating null/missing fields."""
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value: Any, default: int = 0) -> int:
    """Return an int value from Gatling JSON, tolerating null/missing fields."""
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _extract_stats(stats_block: StatsDict) -> StatsDict:
    """Extract percentiles and failure counts from a Gatling stats{} block."""
    pct1 = stats_block.get("percentiles1", {})
    pct2 = stats_block.get("percentiles2", {})
    pct3 = stats_block.get("percentiles3", {})
    pct4 = stats_block.get("percentiles4", {})
    requests = stats_block.get("numberOfRequests", {})

    ok = _as_int(requests.get("ok"))
    ko = _as_int(requests.get("ko"))
    total = _as_int(requests.get("total"), ok + ko)
    if total <= 0:
        total = ok + ko

    return {
        "p50": _as_number(pct1.get("total")),
        "p75": _as_number(pct2.get("total")),
        "p95": _as_number(pct3.get("total")),
        "p99": _as_number(pct4.get("total")),
        "ok": ok,
        "ko": ko,
        "failure_rate": ko / total if total > 0 else 0.0,
    }


def _is_region_group(contents: StatsDict) -> bool:
    """Return True when top-level contents include Gatling GROUP entries."""
    for item in contents.values():
        if isinstance(item, dict) and item.get("type") == "GROUP":
            return True
    return False


def _parse_regions(root: StatsDict) -> dict[str, StatsDict]:
    """Parse region stats from Gatling stats.json root data.

    Region-aware reports store each region as a top-level GROUP in contents.
    Older/non-region reports only contain request entries, so the root stats are
    returned as a single "default" region.
    """
    contents = root.get("contents", {})
    if isinstance(contents, dict) and contents and _is_region_group(contents):
        regions: dict[str, StatsDict] = {}
        for name, item in contents.items():
            if isinstance(item, dict) and item.get("type") == "GROUP":
                regions[str(name)] = _extract_stats(item.get("stats", {}))
        return regions

    return {"default": _extract_stats(root.get("stats", {}))}


def find_stats_json(iter_dir: str | os.PathLike[str]) -> str | None:
    """Find the newest stats.json below an iteration directory.

    Expected layout:
        iter-N-slot-X/results_<ts>/<scenario>/js/stats.json
    """
    pattern = os.path.join(str(iter_dir), "results_*", "*", "js", "stats.json")
    matches = sorted(glob.glob(pattern), reverse=True)
    return matches[0] if matches else None


def find_iter_meta(iter_dir: str | os.PathLike[str]) -> StatsDict:
    """Load iter_meta.json if Phase 5 run.sh metadata exists."""
    meta_path = Path(iter_dir) / "iter_meta.json"
    if not meta_path.is_file():
        return {}

    with meta_path.open("r", encoding="utf-8") as meta_file:
        return json.load(meta_file)


def _fallback_iter_identity(iter_dir: str | os.PathLike[str]) -> tuple[int | None, str | None]:
    """Infer iter number and slot from iter-N-slot-name directory names."""
    match = re.match(r"iter-(\d+)-slot-(.+)", Path(iter_dir).name)
    if not match:
        return None, None
    return int(match.group(1)), match.group(2)


def parse_iter_stats(iter_dir: str | os.PathLike[str]) -> StatsDict:
    """Parse one benchmark iteration directory.

    Returns:
        {
          "iter_dir": "/abs/path/to/iter-1-slot-baseline",
          "slot": "baseline",
          "iter_num": 1,
          "scenario": "BookingSimulation",
          "regions": {
            "booking": {
              "p50": 85.0,
              "p75": 120.0,
              "p95": 320.0,
              "p99": 500.0,
              "ok": 1234,
              "ko": 5,
              "failure_rate": 0.004
            }
          },
          "error": None
        }
    """
    iter_path = Path(iter_dir)
    result: StatsDict = {
        "iter_dir": str(iter_path.resolve()),
        "slot": None,
        "iter_num": None,
        "scenario": None,
        "regions": {},
        "error": None,
    }

    try:
        meta = find_iter_meta(iter_path)
    except (OSError, json.JSONDecodeError) as exc:
        result["error"] = f"iter_meta.json parse error: {exc}"
        return result

    result["slot"] = meta.get("slot")
    result["iter_num"] = meta.get("iter_num")

    fallback_iter_num, fallback_slot = _fallback_iter_identity(iter_path)
    if result["iter_num"] is None:
        result["iter_num"] = fallback_iter_num
    if result["slot"] is None:
        result["slot"] = fallback_slot

    stats_path = find_stats_json(iter_path)
    if stats_path is None:
        result["error"] = f"stats.json not found in {iter_path}"
        return result

    stats_parts = Path(stats_path).parts
    if len(stats_parts) >= 4:
        result["scenario"] = stats_parts[-3]

    try:
        with open(stats_path, "r", encoding="utf-8") as stats_file:
            root = json.load(stats_file)
        result["regions"] = _parse_regions(root)
    except (OSError, json.JSONDecodeError) as exc:
        result["error"] = f"stats.json parse error: {exc}"

    return result


def _print_human_readable(result: StatsDict) -> None:
    print(f"iter_dir : {result['iter_dir']}")
    print(f"slot     : {result['slot']}")
    print(f"iter_num : {result['iter_num']}")
    print(f"scenario : {result['scenario']}")
    print()

    for region, stats in result["regions"].items():
        print(f"[region: {region}]")
        print(
            f"  p50={stats['p50']:.1f}ms  "
            f"p75={stats['p75']:.1f}ms  "
            f"p95={stats['p95']:.1f}ms  "
            f"p99={stats['p99']:.1f}ms"
        )
        print(
            f"  ok={stats['ok']}  "
            f"ko={stats['ko']}  "
            f"failure_rate={stats['failure_rate']:.2%}"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Parse Gatling stats.json and extract region-level "
            "p50/p75/p95/p99 plus failure rates."
        )
    )
    parser.add_argument("iter_dir", help="Path to iter-N-slot-X directory")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON instead of human-readable text",
    )
    args = parser.parse_args(argv)

    result = parse_iter_stats(args.iter_dir)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if result["error"] else 0

    if result["error"]:
        print(f"[ERROR] {result['error']}", file=sys.stderr)
        return 1

    _print_human_readable(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
