"""Summarise CodeQL SARIF files by severity and fail on high/critical findings.

Usage: sarif_gate.py <dir-or-file> [--fail-on 7.0] [--summary-file summary.txt]
Severity buckets use the rule's security-severity score: critical >= 9.0, high >= 7.0,
medium >= 4.0, low > 0. Results without a score are counted by SARIF level.
No finding messages are printed beyond rule id, file and line.
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path


def rule_scores(run):
    rules = list(run.get("tool", {}).get("driver", {}).get("rules", []))
    for ext in run.get("tool", {}).get("extensions", []):
        rules += ext.get("rules", [])
    scores = {}
    for rule in rules:
        score = rule.get("properties", {}).get("security-severity")
        if score is not None:
            scores[rule["id"]] = float(score)
    return scores


def bucket(score):
    if score >= 9.0:
        return "critical"
    if score >= 7.0:
        return "high"
    if score >= 4.0:
        return "medium"
    return "low"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--fail-on", type=float, default=7.0)
    parser.add_argument("--summary-file")
    args = parser.parse_args()

    root = Path(args.path)
    files = sorted(root.glob("*.sarif")) if root.is_dir() else [root]
    if not files:
        print("no SARIF files found")
        return 2

    counts, failing, lines = Counter(), [], []
    for file in files:
        data = json.loads(file.read_text(encoding="utf-8"))
        for run in data.get("runs", []):
            scores = rule_scores(run)
            for res in run.get("results", []):
                rid = res.get("ruleId", "unknown")
                score = scores.get(rid)
                sev = bucket(score) if score is not None else "unscored-" + res.get("level", "warning")
                counts[sev] += 1
                loc = res.get("locations", [{}])[0].get("physicalLocation", {})
                where = "%s:%s" % (
                    loc.get("artifactLocation", {}).get("uri", "?"),
                    loc.get("region", {}).get("startLine", "?"),
                )
                lines.append("%s %s %s (%s)" % (sev, rid, where, file.name))
                if score is not None and score >= args.fail_on:
                    failing.append(lines[-1])

    out = ["files: " + ", ".join(f.name for f in files)]
    out += ["%s: %d" % (k, counts[k]) for k in sorted(counts)] or ["findings: 0"]
    out += lines
    text = "\n".join(out)
    print(text)
    if args.summary_file:
        Path(args.summary_file).write_text(text + "\n", encoding="utf-8")
    if failing:
        print("\nFAIL: %d finding(s) at or above security-severity %.1f" % (len(failing), args.fail_on))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
