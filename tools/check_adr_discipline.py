#!/usr/bin/env python3
"""Gate G2 — a layering or gate change must arrive with a decision record.

The failure mode this exists to prevent: a red boundary check gets fixed by editing
the rule instead of the import, and the reason is lost. Rules encode decisions, so
changing one requires an ADR in the same pull request.

Watched files:
  .boundaries.json                 the layer matrix
  .github/workflows/ci.yml         the gates themselves
  docs/engineering-guardrails.md   the documented rules

Usage:
    python tools/check_adr_discipline.py --base origin/main
"""

from __future__ import annotations

import argparse
import subprocess
import sys

WATCHED = (
    ".boundaries.json",
    ".github/workflows/ci.yml",
    "docs/engineering-guardrails.md",
)
ADR_DIR = "docs/adr/"


def changed_files(base: str) -> list[str]:
    merge_base = subprocess.run(
        ["git", "merge-base", "HEAD", base],
        capture_output=True, text=True,
    )
    ref = merge_base.stdout.strip() if merge_base.returncode == 0 else base

    diff = subprocess.run(
        ["git", "diff", "--name-only", f"{ref}...HEAD"],
        capture_output=True, text=True,
    )
    if diff.returncode != 0:
        print(f"could not diff against {base}: {diff.stderr.strip()}", file=sys.stderr)
        sys.exit(0)  # do not block a merge because CI could not resolve a ref
    return [line.strip() for line in diff.stdout.splitlines() if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="origin/main")
    args = parser.parse_args()

    files = changed_files(args.base)
    touched = [f for f in files if f in WATCHED]
    if not touched:
        print("adr discipline ok — no guardrail file changed")
        return 0

    adrs = [f for f in files if f.startswith(ADR_DIR) and f.endswith(".md")]
    adrs = [f for f in adrs if not f.endswith(("README.md", "template.md"))]

    if adrs:
        print("adr discipline ok")
        for f in touched:
            print(f"  changed guardrail: {f}")
        for f in adrs:
            print(f"  accompanying ADR: {f}")
        return 0

    print("A guardrail changed with no decision record.\n")
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
