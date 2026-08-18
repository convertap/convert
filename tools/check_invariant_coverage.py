#!/usr/bin/env python3
"""Gate G6 — every architectural invariant has a test, whether or not it is built yet.

Invariants I1-I12 in docs/architecture.md section 6 are the architecture in its most
falsifiable form. Prose rots quietly; a failing test does not. This gate asserts the
mapping between the two is complete:

  - Each invariant listed in architecture.md has a file in tests/invariants named for it.
  - Each invariant test file corresponds to an invariant that still exists.

An invariant whose feature has not been built yet is a `test.todo` carrying the invariant
text as its name. Visible, and impossible to forget.

Usage:
    python tools/check_invariant_coverage.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ARCHITECTURE = REPO / "docs" / "architecture.md"
TESTS = REPO / "tests" / "invariants"

# Table rows such as: | I3 | A `lead` may exist with no `deal`. ... |
INVARIANT_ROW = re.compile(r"^\|\s*(I\d{1,2})\s*\|\s*(.+?)\s*\|\s*$")
# File names such as I03-lead-deal-cardinality.spec.ts
TEST_FILE = re.compile(r"^(I\d{1,2})[-_].+\.(spec|test)\.[cm]?[jt]sx?$")


def declared_invariants() -> dict[str, str]:
    if not ARCHITECTURE.exists():
        sys.exit(f"missing {ARCHITECTURE.relative_to(REPO)}")
    found: dict[str, str] = {}
    for line in ARCHITECTURE.read_text(encoding="utf8").splitlines():
        match = INVARIANT_ROW.match(line)
        if match:
            key = normalize(match.group(1))
            found.setdefault(key, match.group(2))
    return found


def normalize(key: str) -> str:
    """I3 and I03 are the same invariant."""
    return "I%02d" % int(key[1:])


def covered_invariants() -> dict[str, str]:
    if not TESTS.exists():
        return {}
    found: dict[str, str] = {}
    for path in sorted(TESTS.iterdir()):
        if not path.is_file():
            continue
        match = TEST_FILE.match(path.name)
        if match:
            found[normalize(match.group(1))] = path.name
    return found


def main() -> int:
    declared = declared_invariants()
    covered = covered_invariants()

    if not declared:
        print("no invariants declared in architecture.md — nothing to check")
        return 0

    missing = sorted(set(declared) - set(covered))
    orphaned = sorted(set(covered) - set(declared))

    for key in sorted(declared):
        mark = "ok  " if key in covered else "MISS"
        target = covered.get(key, "(no test file)")
        print(f"  {mark} {key}  {target}")

    if not missing and not orphaned:
        print(f"\ninvariant coverage ok — {len(declared)} invariant(s), all covered")
        return 0

    print()
    if missing:
        print(f"{len(missing)} invariant(s) with no test:\n")
        for key in missing:
            print(f"  {key}  {declared[key]}")
        print(
            "\nAdd tests/invariants/<ID>-<slug>.spec.ts. If the feature is not built yet,\n"
            "the file contains a test.todo whose name is the invariant text."
        )
    if orphaned:
        print(f"\n{len(orphaned)} test(s) for invariants that no longer exist:\n")
        for key in orphaned:
            print(f"  {key}  {covered[key]}")
        print(
            "\nEither the invariant was removed without removing its test, or it was\n"
            "renumbered. Removing an invariant needs an ADR — see guardrails section 8."
        )
    return 1


if __name__ == "__main__":
    sys.exit(main())
