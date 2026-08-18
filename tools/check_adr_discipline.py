#!/usr/bin/env python3
"""Gate G2 — a change to a RULE must arrive with a decision record.

The failure mode this exists to prevent: a red boundary check gets fixed by editing
the rule instead of the import, and the reason is lost.

It deliberately distinguishes a rule change from an operational one. For
`.boundaries.json` only the semantic content counts — the layers, what each may
import, forbidden packages, and the composition roots. Editing the `ignore` list so
build output stops being scanned is a bug fix, not an architectural decision, and
demanding an ADR for it would train people to write meaningless ADRs, which is worse
than not having the gate.

For the other watched files any change counts, because they have no comparable
mechanical/semantic split.

Usage:
    python tools/check_adr_discipline.py --base origin/main
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys

BOUNDARIES = ".boundaries.json"
WATCHED = (
    BOUNDARIES,
    ".github/workflows/ci.yml",
    "docs/engineering-guardrails.md",
)
ADR_DIR = "docs/adr/"

# The parts of .boundaries.json that encode an architectural decision.
SEMANTIC_KEYS = ("aliasPrefix", "layers", "compositionRoots")


def run(args: list[str]) -> tuple[int, str]:
    result = subprocess.run(args, capture_output=True, text=True)
    return result.returncode, result.stdout


def merge_base(base: str) -> str:
    code, out = run(["git", "merge-base", "HEAD", base])
    return out.strip() if code == 0 and out.strip() else base


def changed_files(ref: str) -> list[str] | None:
    code, out = run(["git", "diff", "--name-only", f"{ref}...HEAD"])
    if code != 0:
        return None
    return [line.strip() for line in out.splitlines() if line.strip()]


def semantic_boundaries(ref: str | None) -> dict | None:
    """Semantic subset of .boundaries.json at `ref`, or from the working tree."""
    if ref is None:
        try:
            with open(BOUNDARIES, encoding="utf8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError):
            return None
    else:
        code, out = run(["git", "show", f"{ref}:{BOUNDARIES}"])
        if code != 0:
            return None
        try:
            data = json.loads(out)
        except json.JSONDecodeError:
            return None
    return {key: data.get(key) for key in SEMANTIC_KEYS}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="origin/main")
    args = parser.parse_args()

    ref = merge_base(args.base)
    files = changed_files(ref)
    if files is None:
        # Cannot resolve the base ref (shallow clone, first push). Do not block a merge
        # on an environment problem; CI on the pull request is the enforcement point.
        print(f"adr discipline skipped — could not diff against {args.base}")
        return 0

    touched = [f for f in files if f in WATCHED]

    if BOUNDARIES in touched:
        before = semantic_boundaries(ref)
        after = semantic_boundaries(None)
        if before is not None and after is not None and before == after:
            touched.remove(BOUNDARIES)
            print(f"{BOUNDARIES} changed, but no layer, import rule, or composition root moved")

    if not touched:
        print("adr discipline ok — no rule changed")
        return 0

    adrs = [
        f
        for f in files
        if f.startswith(ADR_DIR)
        and f.endswith(".md")
        and not f.endswith(("README.md", "template.md"))
    ]

    if adrs:
        print("adr discipline ok")
        for f in touched:
            print(f"  changed rule: {f}")
        for f in adrs:
            print(f"  accompanying ADR: {f}")
        return 0

    print("A rule changed with no decision record.\n")
    for f in touched:
        print(f"  changed: {f}")
    print(
        "\nAdd an ADR under docs/adr/ explaining why the rule changed, and reference it\n"
        "in the pull request body. Copy docs/adr/template.md to start.\n\n"
        "If you are fixing a red build, fix the import instead — that is what this gate\n"
        "is for. See docs/engineering-guardrails.md section 8."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
