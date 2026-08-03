#!/usr/bin/env python3
"""Summarise or gate the extension's test coverage for CI.

Vitest (v8) writes ``coverage/coverage-summary.json``. This reads it and prints, per ``--format``:

  --format md         GitHub-flavored Markdown table for the Actions run summary
                      ($GITHUB_STEP_SUMMARY).
  --format reports    The JSON "reports" array consumed by the jmerhar/coverage site's
                      bin/make-meta.py: a leading combined "total" entry (no ``path``) followed by
                      one linkable entry per suite. This project has a single suite.

With ``--gate`` it checks LINE coverage against the threshold in ``GATES`` and exits non-zero if
below it.
"""
import argparse
import json

# Single-suite line-coverage gate (percent). Set at/just under the actual figure so a real
# regression fails CI while the odd defensive line is tolerated. Raise as coverage climbs; never
# lower to make a red build pass. ``None`` makes it informational.
GATES: dict[str, float | None] = {"extension": 99.0}

# key → (display label, summary file). The key doubles as the HTML subdirectory name in the
# published report (see collect-coverage.sh), so it is the ``path`` in the reports manifest.
SUITES: dict[str, dict[str, str]] = {
    "extension": {
        "label": "Extension (TypeScript)",
        "summary": "coverage/coverage-summary.json",
    },
}


def _counts(suite):
    """{"line": (covered, total), "branch": (covered, total)} for a suite, or None if unreadable."""
    try:
        with open(SUITES[suite]["summary"]) as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    total = data.get("total", {})
    lines, branches = total.get("lines", {}), total.get("branches", {})
    counts = {"line": (lines.get("covered", 0), lines.get("total", 0))}
    if branches.get("total"):
        counts["branch"] = (branches.get("covered", 0), branches["total"])
    return counts


def _pct(covered, total):
    return f"{covered / total * 100:.1f}%" if total else "n/a"


def percentages(suite):
    counts = _counts(suite)
    return None if counts is None else {k: _pct(*counts[k]) for k in counts}


def _rows():
    for suite in SUITES:
        stats = percentages(suite)
        if stats is not None:
            yield suite, stats


def total_metrics():
    """Combined coverage across reporting suites, line-count-weighted."""
    reporting = {s: _counts(s) for s in SUITES if _counts(s) is not None}
    metrics = {}
    for kind in ("line", "branch"):
        if not reporting or any(kind not in c for c in reporting.values()):
            continue
        covered = sum(c[kind][0] for c in reporting.values())
        total = sum(c[kind][1] for c in reporting.values())
        if total:
            metrics[kind] = _pct(covered, total)
    return metrics


def render_markdown():
    lines = ["## Coverage", "", "| Suite | Line | Branch |", "|---|---|---|"]
    for suite, s in _rows():
        lines.append(f"| {SUITES[suite]['label']} | {s.get('line', 'n/a')} | {s.get('branch', 'n/a')} |")
    total = total_metrics()
    if total:
        lines.append(f"| **Total** | **{total.get('line', 'n/a')}** | **{total.get('branch', 'n/a')}** |")
    return "\n".join(lines)


def render_reports():
    suites = [{"name": SUITES[s]["label"], "path": s, "metrics": m} for s, m in _rows()]
    total = total_metrics()
    reports = ([{"name": "total", "metrics": total}] if total else []) + suites
    return json.dumps(reports, indent=2)


def line_percent(suite):
    counts = _counts(suite)
    if counts is None or not counts["line"][1]:
        return None
    covered, total = counts["line"]
    return covered / total * 100


def run_gate():
    failures = []
    for suite, threshold in GATES.items():
        pct = line_percent(suite)
        if pct is None:
            print(f"✗ {suite}  no coverage report at {SUITES[suite]['summary']}")
            failures.append(suite)
            continue
        if threshold is None:
            print(f"• {suite}  line {pct:.1f}%  (informational)")
            continue
        ok = pct + 0.05 >= threshold
        print(f"{'✓' if ok else '✗'} {suite}  line {pct:.1f}%  (gate ≥ {threshold:.0f}%)")
        if not ok:
            failures.append(suite)
    if failures:
        print(f"\nCoverage gate FAILED for: {', '.join(failures)}")
        return 1
    print("\nCoverage gate passed.")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Summarise or gate coverage.")
    ap.add_argument("--format", choices=("md", "reports"), default="md")
    ap.add_argument("--gate", action="store_true")
    args = ap.parse_args()
    if args.gate:
        raise SystemExit(run_gate())
    print(render_reports() if args.format == "reports" else render_markdown())


if __name__ == "__main__":
    main()
