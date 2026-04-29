#!/usr/bin/env python3
"""
Prometheus result slicing for benchmark iterations.

ANL-02: split Prometheus range-query samples by benchmark region and compute
per-region mean/max values.

Lock #4: region boundaries are derived only from iter_meta.json
``iter_start_epoch`` plus Plan.json ``regions[].duration_ms``. Do not hardcode
time windows in this module or in manifests.
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import sys
from pathlib import Path
from typing import Any


def load_iter_meta(iter_dir: str | os.PathLike[str]) -> dict[str, Any]:
    """Load iter_meta.json, returning an empty dict when it is absent."""
    meta_path = Path(iter_dir) / "iter_meta.json"
    if not meta_path.is_file():
        return {}

    try:
        with meta_path.open("r", encoding="utf-8-sig") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}

    return data if isinstance(data, dict) else {}


def load_plan_json(plan_path: str | os.PathLike[str] | None) -> dict[str, Any]:
    """Load Plan.json, returning an empty dict when unavailable or malformed."""
    if not plan_path:
        return {}

    path = Path(plan_path)
    if not path.is_file():
        return {}

    try:
        with path.open("r", encoding="utf-8-sig") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}

    return data if isinstance(data, dict) else {}


def compute_region_timestamps(iter_start_epoch: int | float, plan: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Compute region start/end epochs from Plan.json regions[].duration_ms.

    Returns a single open-ended "default" region when Plan.json has no regions.
    """
    try:
        cursor_epoch = float(iter_start_epoch)
    except (TypeError, ValueError):
        cursor_epoch = 0.0

    regions = plan.get("regions", [])
    if not isinstance(regions, list) or not regions:
        return [{"name": "default", "start_epoch": cursor_epoch, "end_epoch": None}]

    result: list[dict[str, Any]] = []
    for idx, region in enumerate(regions):
        if not isinstance(region, dict):
            region = {}

        name = str(region.get("name") or f"region_{idx + 1}")
        duration_ms = _to_float(region.get("duration_ms"), 0.0)
        duration_s = max(duration_ms, 0.0) / 1000.0
        end_epoch = cursor_epoch + duration_s

        result.append(
            {
                "name": name,
                "start_epoch": cursor_epoch,
                "end_epoch": end_epoch,
            }
        )
        cursor_epoch = end_epoch

    return result


def load_prom_data(iter_dir: str | os.PathLike[str]) -> dict[str, Any]:
    """
    Load the newest prom_<timestamp>.json file from an iteration directory.

    Missing files are represented as an empty dict so callers can skip
    gracefully.
    """
    pattern = str(Path(iter_dir) / "prom_*.json")
    matches = sorted(glob.glob(pattern), reverse=True)
    if not matches:
        return {}

    try:
        with open(matches[0], "r", encoding="utf-8-sig") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}

    return data if isinstance(data, dict) else {}


def _to_float(value: Any, default: float | None = None) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if math.isfinite(parsed) else default


def _extract_values_in_range(
    matrix_result: list[Any],
    start_epoch: float,
    end_epoch: float | None,
) -> list[float]:
    """Flatten Prometheus matrix samples within [start_epoch, end_epoch)."""
    values: list[float] = []

    for series in matrix_result:
        if not isinstance(series, dict):
            continue

        for sample in series.get("values", []):
            if not isinstance(sample, (list, tuple)) or len(sample) < 2:
                continue

            timestamp = _to_float(sample[0])
            value = _to_float(sample[1])
            if timestamp is None or value is None:
                continue

            if timestamp >= start_epoch and (end_epoch is None or timestamp < end_epoch):
                values.append(value)

    return values


def slice_region_metrics(
    prom_data: dict[str, Any],
    region_timestamps: list[dict[str, Any]],
    query_units: dict[str, str],
) -> dict[str, dict[str, dict[str, Any]]]:
    """
    Slice Prometheus query results by region and compute mean/max per query.
    """
    result: dict[str, dict[str, dict[str, Any]]] = {}

    for region in region_timestamps:
        region_name = str(region.get("name") or "unnamed")
        start_epoch = _to_float(region.get("start_epoch"), 0.0) or 0.0
        end_epoch = _to_float(region.get("end_epoch"))
        result[region_name] = {}

        for query_name, prom_response in prom_data.items():
            unit = query_units.get(query_name, "")

            if prom_response == "-":
                result[region_name][query_name] = {"mean": None, "max": None, "unit": unit}
                continue

            if not isinstance(prom_response, dict) or prom_response.get("status") != "success":
                result[region_name][query_name] = {"mean": None, "max": None, "unit": unit}
                continue

            matrix_result = prom_response.get("data", {}).get("result", [])
            if not isinstance(matrix_result, list):
                matrix_result = []

            values = _extract_values_in_range(matrix_result, start_epoch, end_epoch)
            if not values:
                result[region_name][query_name] = {"mean": None, "max": None, "unit": unit}
                continue

            result[region_name][query_name] = {
                "mean": sum(values) / len(values),
                "max": max(values),
                "unit": unit,
            }

    return result


def load_manifest_queries(manifest_path: str | os.PathLike[str] | None) -> dict[str, str]:
    """
    Load manifest queries as {name: unit}.

    PyYAML is used when present. A small fallback parser handles the manifest
    query blocks used by bench/manifests/schema.yaml without adding a dependency.
    """
    if not manifest_path:
        return {}

    path = Path(manifest_path)
    if not path.is_file():
        return {}

    text = path.read_text(encoding="utf-8-sig")

    try:
        import yaml  # type: ignore
    except ImportError:
        return _load_manifest_queries_without_yaml(text)

    try:
        docs = list(yaml.safe_load_all(text))
    except Exception:
        return _load_manifest_queries_without_yaml(text)

    for doc in docs:
        if not isinstance(doc, dict):
            continue
        queries = doc.get("queries", [])
        if isinstance(queries, list):
            parsed = {
                str(q["name"]): str(q.get("unit", ""))
                for q in queries
                if isinstance(q, dict) and q.get("name") is not None
            }
            if parsed:
                return parsed

    return {}


def _load_manifest_queries_without_yaml(text: str) -> dict[str, str]:
    query_units: dict[str, str] = {}
    in_queries = False
    current_name: str | None = None
    current_unit = ""

    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].rstrip()
        stripped = line.strip()
        if not stripped:
            continue

        if re.match(r"^[A-Za-z0-9_-]+:", stripped) and not line.startswith((" ", "-")):
            in_queries = stripped == "queries:"
            if not in_queries and current_name is not None:
                query_units[current_name] = current_unit
                current_name = None
                current_unit = ""
            continue

        if not in_queries:
            continue

        name_match = re.match(r"^-\s+name:\s*(.+)$", stripped)
        if name_match:
            if current_name is not None:
                query_units[current_name] = current_unit
            current_name = _strip_yaml_scalar(name_match.group(1))
            current_unit = ""
            continue

        unit_match = re.match(r"^unit:\s*(.+)$", stripped)
        if unit_match and current_name is not None:
            current_unit = _strip_yaml_scalar(unit_match.group(1))

    if current_name is not None:
        query_units[current_name] = current_unit

    return query_units


def _strip_yaml_scalar(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _fallback_iter_identity(iter_dir: str | os.PathLike[str]) -> tuple[int | None, str | None]:
    match = re.match(r"iter-(\d+)-slot-(.+)$", Path(iter_dir).name)
    if not match:
        return None, None
    return int(match.group(1)), match.group(2)


def query_iter_metrics(iter_dir: str | os.PathLike[str], manifest_path: str | os.PathLike[str]) -> dict[str, Any]:
    """
    Return region-sliced Prometheus metrics for one iteration directory.
    """
    iter_path = Path(iter_dir)
    fallback_iter_num, fallback_slot = _fallback_iter_identity(iter_path)
    meta = load_iter_meta(iter_path)

    result: dict[str, Any] = {
        "iter_dir": str(iter_path.resolve()),
        "slot": meta.get("slot") or fallback_slot,
        "iter_num": meta.get("iter_num") or fallback_iter_num,
        "regions": {},
        "error": None,
    }

    iter_start_epoch = _to_float(meta.get("iter_start_epoch"))
    if iter_start_epoch is None:
        result["error"] = "iter_meta.json missing iter_start_epoch"
        return result

    plan = load_plan_json(meta.get("plan_path"))
    region_timestamps = compute_region_timestamps(iter_start_epoch, plan)

    prom_data = load_prom_data(iter_path)
    if not prom_data:
        result["error"] = f"prom_*.json not found in {iter_path}"
        return result

    query_units = load_manifest_queries(manifest_path)
    result["regions"] = slice_region_metrics(prom_data, region_timestamps, query_units)
    return result


def _print_human(result: dict[str, Any]) -> None:
    if result.get("error"):
        print(f"[WARN] {result['error']}", file=sys.stderr)

    print(f"iter_dir : {result.get('iter_dir')}")
    print(f"slot     : {result.get('slot')}")
    print(f"iter_num : {result.get('iter_num')}")
    print()

    for region, queries in result.get("regions", {}).items():
        print(f"[region: {region}]")
        for query_name, metrics in queries.items():
            mean = metrics.get("mean")
            max_value = metrics.get("max")
            unit = metrics.get("unit", "")
            if mean is None or max_value is None:
                print(f"  {query_name}: -")
            else:
                print(f"  {query_name}: mean={mean:.2f}{unit}  max={max_value:.2f}{unit}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Slice Prometheus range-query data by benchmark region and compute mean/max.",
    )
    parser.add_argument("--manifest", required=True, help="Benchmark manifest YAML path")
    parser.add_argument("--iter-dir", required=True, dest="iter_dir", help="iter-N-slot-X directory")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of human-readable output")
    args = parser.parse_args(argv)

    result = query_iter_metrics(args.iter_dir, args.manifest)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        _print_human(result)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
