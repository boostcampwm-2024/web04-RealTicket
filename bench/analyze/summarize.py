#!/usr/bin/env python3
"""Generate a benchmark run SUMMARY.md from collected iteration artifacts.

ANL-03: aggregate N iterations into a slot x region x query markdown table.
ANL-04: evaluate optional manifest hypotheses when present.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from bench.analyze.parse_simulation_log import parse_iter_stats
from bench.analyze.prom_query import query_iter_metrics


MetricDict = dict[str, Any]


def _median_or_none(values: list[Any]) -> float | None:
    """Return median after dropping None/non-numeric values."""
    clean: list[float] = []
    for value in values:
        if value is None:
            continue
        try:
            clean.append(float(value))
        except (TypeError, ValueError):
            continue
    return statistics.median(clean) if clean else None


def _discover_iter_dirs(run_dir: str | os.PathLike[str]) -> tuple[list[str], list[str]]:
    """Return valid and failed iter-N-slot-X directories sorted by iter number."""
    pattern = str(Path(run_dir) / "iter-*-slot-*")

    def sort_key(path: str) -> tuple[int, str]:
        match = re.search(r"iter-(\d+)-slot-", Path(path).name)
        return (int(match.group(1)) if match else 0, path)

    valid: list[str] = []
    failed: list[str] = []
    for iter_dir in sorted(glob.glob(pattern), key=sort_key):
        if Path(iter_dir, "FAILED").is_file():
            failed.append(iter_dir)
        else:
            valid.append(iter_dir)
    return valid, failed


def _load_manifest_yaml(manifest_path: str | os.PathLike[str] | None) -> dict[str, Any]:
    """Load the first manifest document, with a small fallback parser."""
    if not manifest_path:
        return {}

    path = Path(manifest_path)
    if not path.is_file():
        return {}

    text = path.read_text(encoding="utf-8-sig")
    try:
        import yaml  # type: ignore

        docs = list(yaml.safe_load_all(text))
        for doc in docs:
            if isinstance(doc, dict):
                return doc
    except Exception:
        pass

    return _load_manifest_fallback(text)


def _load_manifest_fallback(text: str) -> dict[str, Any]:
    """Parse the subset of the manifest schema needed by the summarizer."""
    manifest: dict[str, Any] = {"queries": [], "hypotheses": []}
    section: str | None = None
    current_query: dict[str, Any] | None = None
    current_hypothesis: dict[str, Any] | None = None
    in_check = False

    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].rstrip()
        stripped = line.strip()
        if not stripped:
            continue
        if stripped == "---":
            break

        top_match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", stripped)
        if top_match and not raw_line.startswith((" ", "-")):
            key, value = top_match.groups()
            if key in {"queries", "hypotheses"}:
                section = key
                in_check = False
                continue
            section = None
            in_check = False
            if value:
                manifest[key] = _strip_yaml_scalar(value)
            continue

        if section == "queries":
            query_match = re.match(r"^-\s+name:\s*(.+)$", stripped)
            if query_match:
                current_query = {"name": _strip_yaml_scalar(query_match.group(1))}
                manifest["queries"].append(current_query)
                continue
            field_match = re.match(r"^(promql|unit):\s*(.+)$", stripped)
            if field_match and current_query is not None:
                current_query[field_match.group(1)] = _strip_yaml_scalar(field_match.group(2))
                continue

        if section == "hypotheses":
            hyp_match = re.match(r"^-\s+id:\s*(.+)$", stripped)
            if hyp_match:
                current_hypothesis = {"id": _strip_yaml_scalar(hyp_match.group(1)), "check": {}}
                manifest["hypotheses"].append(current_hypothesis)
                in_check = False
                continue
            if stripped == "check:" and current_hypothesis is not None:
                in_check = True
                continue
            field_match = re.match(r"^(statement|region|query|op|threshold):\s*(.+)$", stripped)
            if field_match and current_hypothesis is not None:
                key, value = field_match.groups()
                parsed_value = _strip_yaml_scalar(value)
                if key == "threshold":
                    try:
                        parsed_value = float(parsed_value)
                    except ValueError:
                        pass
                if in_check and key != "statement":
                    current_hypothesis.setdefault("check", {})[key] = parsed_value
                else:
                    current_hypothesis[key] = parsed_value

    return manifest


def _strip_yaml_scalar(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _find_manifest_for_run(run_dir: str | os.PathLike[str]) -> str:
    """Best-effort manifest discovery from bench/manifests by run name prefix."""
    run_path = Path(run_dir)
    bench_dir = run_path.parent.parent if run_path.parent.name == "raw" else Path("bench")
    manifests_dir = bench_dir / "manifests"
    if not manifests_dir.is_dir():
        return ""

    run_name = run_path.name
    for manifest_path in sorted(manifests_dir.glob("*.yaml")):
        manifest = _load_manifest_yaml(manifest_path)
        manifest_id = str(manifest.get("manifest_id", ""))
        if manifest_id and run_name.startswith(manifest_id):
            return str(manifest_path)

    return ""


def _flatten_stats(result: dict[str, Any]) -> dict[str, Any]:
    regions: dict[str, Any] = {}
    for region, metrics in result.get("regions", {}).items():
        regions[region] = {
            "p50": metrics.get("p50"),
            "p75": metrics.get("p75"),
            "p95": metrics.get("p95"),
            "p99": metrics.get("p99"),
            "failure_rate": metrics.get("failure_rate"),
            "ok": metrics.get("ok"),
            "ko": metrics.get("ko"),
        }
    return {
        "slot": result.get("slot") or "unknown",
        "iter_num": result.get("iter_num"),
        "regions": regions,
    }


def _flatten_prom(result: dict[str, Any]) -> dict[str, Any]:
    regions: dict[str, Any] = {}
    for region, queries in result.get("regions", {}).items():
        regions[region] = {}
        for query, metrics in queries.items():
            if not isinstance(metrics, dict):
                continue
            regions[region][f"{query}_mean"] = metrics.get("mean")
            regions[region][f"{query}_max"] = metrics.get("max")
    return {
        "slot": result.get("slot") or "unknown",
        "iter_num": result.get("iter_num"),
        "regions": regions,
    }


def _aggregate_iters(iter_results: list[dict[str, Any]]) -> dict[str, dict[str, MetricDict]]:
    """Aggregate values as medians per slot and region."""
    accumulator: dict[str, dict[str, dict[str, list[Any]]]] = {}

    for item in iter_results:
        slot = str(item.get("slot") or "unknown")
        accumulator.setdefault(slot, {})
        for region, metrics in item.get("regions", {}).items():
            accumulator[slot].setdefault(region, {})
            for metric_name, value in metrics.items():
                accumulator[slot][region].setdefault(metric_name, []).append(value)

    aggregated: dict[str, dict[str, MetricDict]] = {}
    for slot, regions in accumulator.items():
        aggregated[slot] = {}
        for region, metrics in regions.items():
            aggregated[slot][region] = {}
            for metric_name, values in metrics.items():
                aggregated[slot][region][metric_name] = _median_or_none(values)

    return aggregated


def _merge_aggregates(*aggregates: dict[str, dict[str, MetricDict]]) -> dict[str, dict[str, MetricDict]]:
    merged: dict[str, dict[str, MetricDict]] = {}
    for aggregate in aggregates:
        for slot, regions in aggregate.items():
            merged.setdefault(slot, {})
            for region, metrics in regions.items():
                merged[slot].setdefault(region, {})
                merged[slot][region].update(metrics)
    return merged


def _format_value(value: Any, unit: str = "") -> str:
    if value is None:
        return "-"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)

    if unit == "bytes":
        return f"{number / 1024 / 1024:.1f} MB"
    if unit == "%":
        return f"{number:.1f}%"
    if unit == "ratio":
        return f"{number:.2%}"
    if unit:
        return f"{number:.1f} {unit}"
    return f"{number:.1f}"


def _metric_columns(aggregated: dict[str, dict[str, MetricDict]], query_units: dict[str, str]) -> list[tuple[str, str, str]]:
    columns: list[tuple[str, str, str]] = []
    stats_candidates = [
        ("p50", "p50_response_time", "ms"),
        ("p75", "p75_response_time", "ms"),
        ("p95", "p95_response_time", "ms"),
        ("p99", "p99_response_time", "ms"),
        ("failure_rate", "failure_rate", "ratio"),
    ]

    present = {
        metric
        for regions in aggregated.values()
        for metrics in regions.values()
        for metric in metrics.keys()
    }

    for metric, label, unit in stats_candidates:
        if metric in present:
            columns.append((metric, label, unit))

    for query in sorted(query_units.keys()):
        for suffix in ("mean", "max"):
            metric = f"{query}_{suffix}"
            if metric in present:
                unit = query_units.get(query, "")
                columns.append((metric, metric, unit))

    return columns


def _build_summary_table(
    aggregated: dict[str, dict[str, MetricDict]],
    query_units: dict[str, str],
    stats_metrics: list[str] | None = None,
    prom_metrics: list[str] | None = None,
) -> str:
    """Build the regions x queries cross product markdown table."""
    columns = _metric_columns(aggregated, query_units)
    if not columns:
        return "_No analyzable metrics found._\n"

    headers = ["slot", "region"] + [label for _, label, _ in columns]
    separators = [":---", ":---"] + ["---:" for _ in columns]
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(separators) + " |",
    ]

    for slot in sorted(aggregated.keys()):
        for region in sorted(aggregated[slot].keys()):
            metrics = aggregated[slot][region]
            cells = [slot, region]
            for metric, _, unit in columns:
                cells.append(_format_value(metrics.get(metric), unit))
            lines.append("| " + " | ".join(cells) + " |")

    return "\n".join(lines) + "\n"


def _resolve_metric_value(aggregated: dict[str, dict[str, MetricDict]], slot: str, region: str, query: str) -> float | None:
    metrics = aggregated.get(slot, {}).get(region, {})
    for key in (query, f"{query}_mean", f"{query}_max"):
        value = metrics.get(key)
        if value is not None:
            try:
                return float(value)
            except (TypeError, ValueError):
                return None
    return None


def _build_hypothesis_table(
    aggregated: dict[str, dict[str, MetricDict]],
    hypotheses: list[dict[str, Any]],
    query_units: dict[str, str],
) -> str:
    """Build optional hypothesis verdict table."""
    if not hypotheses:
        return ""

    slots = sorted(aggregated.keys())
    lines = [
        "## Hypothesis Results",
        "",
        "| hypothesis | statement | verdict |",
        "|:---|:---|:---|",
    ]

    for hypothesis in hypotheses:
        hid = str(hypothesis.get("id", "-"))
        statement = str(hypothesis.get("statement", ""))
        check = hypothesis.get("check", {})
        if not isinstance(check, dict):
            check = {}

        region = str(check.get("region", ""))
        query = str(check.get("query", ""))
        op = str(check.get("op", ""))
        threshold = check.get("threshold")
        verdict = "deferred - insufficient data"

        try:
            threshold_value = float(threshold)
        except (TypeError, ValueError):
            threshold_value = None

        if op in {"<", ">"} and threshold_value is not None and slots:
            value = _resolve_metric_value(aggregated, slots[0], region, query)
            if value is not None:
                passed = value < threshold_value if op == "<" else value > threshold_value
                unit = query_units.get(query, "")
                verdict = (
                    f"verified ({_format_value(value, unit)} {op} {_format_value(threshold_value, unit)})"
                    if passed
                    else f"rejected ({_format_value(value, unit)} not {op} {_format_value(threshold_value, unit)})"
                )
        elif op == "delta" and threshold_value is not None and len(slots) >= 2:
            first = _resolve_metric_value(aggregated, slots[0], region, query)
            second = _resolve_metric_value(aggregated, slots[1], region, query)
            if first is not None and second is not None:
                delta = first - second
                unit = query_units.get(query, "")
                verdict = (
                    f"verified (delta {_format_value(delta, unit)} < {_format_value(threshold_value, unit)})"
                    if delta < threshold_value
                    else f"rejected (delta {_format_value(delta, unit)} >= {_format_value(threshold_value, unit)})"
                )

        lines.append(f"| {hid} | {statement} | {verdict} |")

    return "\n".join(lines) + "\n"


def _query_units(manifest: dict[str, Any]) -> dict[str, str]:
    query_units: dict[str, str] = {}
    queries = manifest.get("queries", [])
    if not isinstance(queries, list):
        return query_units

    for query in queries:
        if isinstance(query, dict) and query.get("name") is not None:
            query_units[str(query["name"])] = str(query.get("unit", ""))
    return query_units


def summarize_run(
    run_dir: str | os.PathLike[str],
    output_path: str | os.PathLike[str] | None = None,
    manifest_path: str | os.PathLike[str] | None = None,
) -> str:
    """Analyze a run directory and write SUMMARY.md."""
    run_path = Path(run_dir)
    if output_path is None:
        output_path = run_path / "SUMMARY.md"
    output = Path(output_path)

    manifest_path = str(manifest_path or _find_manifest_for_run(run_path))
    manifest = _load_manifest_yaml(manifest_path)
    manifest_id = str(manifest.get("manifest_id") or run_path.name)
    query_units = _query_units(manifest)
    hypotheses = manifest.get("hypotheses", [])
    if not isinstance(hypotheses, list):
        hypotheses = []

    valid_iter_dirs, failed_iter_dirs = _discover_iter_dirs(run_path)
    stats_results: list[dict[str, Any]] = []
    prom_results: list[dict[str, Any]] = []
    warnings: list[str] = []

    for iter_dir in valid_iter_dirs:
        stats = parse_iter_stats(iter_dir)
        if stats.get("error"):
            warnings.append(f"{Path(iter_dir).name}: stats skipped - {stats['error']}")
        else:
            stats_results.append(_flatten_stats(stats))

        prom = query_iter_metrics(iter_dir, manifest_path)
        if prom.get("error"):
            warnings.append(f"{Path(iter_dir).name}: prometheus skipped - {prom['error']}")
        else:
            prom_results.append(_flatten_prom(prom))

    aggregated = _merge_aggregates(
        _aggregate_iters(stats_results),
        _aggregate_iters(prom_results),
    )
    analyzed_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    lines = [
        "# Benchmark Run Summary",
        "",
        f"**Run ID:** {run_path.name}  ",
        f"**Manifest:** {manifest_id}  ",
        f"**Analyzed:** {analyzed_at}  ",
        f"**Total Iterations:** {len(valid_iter_dirs) + len(failed_iter_dirs)} "
        f"(valid: {len(valid_iter_dirs)}, failed: {len(failed_iter_dirs)})  ",
        "",
        "## Region Performance Summary",
        "",
        _build_summary_table(aggregated, query_units),
    ]

    hypothesis_table = _build_hypothesis_table(aggregated, hypotheses, query_units)
    if hypothesis_table:
        lines.extend(["", hypothesis_table])

    if warnings:
        lines.extend(
            [
                "",
                "## Analyzer Warnings",
                "",
                *[f"- {warning}" for warning in warnings],
            ]
        )

    output.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return str(output)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate benchmark run SUMMARY.md.")
    parser.add_argument("run_dir", help="bench/raw/<run-id> directory")
    parser.add_argument("--output", help="Output markdown path. Defaults to run_dir/SUMMARY.md")
    parser.add_argument("--manifest", help="Manifest YAML path. Defaults to discovery by run name")
    args = parser.parse_args(argv)

    try:
        output = summarize_run(args.run_dir, args.output, args.manifest)
    except Exception as exc:  # noqa: BLE001 - CLI should report concise failures.
        print(f"[ERROR] summarize failed: {exc}", file=sys.stderr)
        return 1

    print(f"SUMMARY.md generated: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
