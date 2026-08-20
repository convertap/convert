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

The CI workflow gets the same treatment for the same reason (ADR 0025). Which version
of `actions/checkout` is pinned is a fact with an upstream owner, not a decision, so a
diff that only moves version pins passes. Adding or removing a gate step, widening a
trigger, cutting a `needs:` edge or swapping the action itself still needs an ADR.

For the remaining watched files any change counts, because they have no comparable
mechanical/semantic split.

Usage:
    python tools/check_adr_discipline.py --base origin/main
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys

BOUNDARIES = ".boundaries.json"
WORKFLOW = ".github/workflows/ci.yml"
WATCHED = (
    BOUNDARIES,
    WORKFLOW,
    "docs/engineering-guardrails.md",
)
ADR_DIR = "docs/adr/"

# The parts of .boundaries.json that encode an architectural decision.
SEMANTIC_KEYS = ("aliasPrefix", "layers", "compositionRoots")

# `uses: owner/repo@ref`, with the trailing `# v4.2.0` comment Dependabot writes when
# an action is pinned to a SHA. The ref and that comment together are the pin; the
# action's identity is the part that carries a decision. A local action (`./path`) has
# no `@` and so does not match, which is the right answer — there is no pin to ignore.
USES = re.compile(r"^(?P<indent>\s*(?:-\s*)?)uses:\s*(?P<action>[^\s@#]+)@\S+\s*(?:#.*)?$")


def run(args: list[str]) -> tuple[int, str]:
    # git speaks UTF-8. Decoding with the locale encoding instead gives cp1252 on a
    # Windows shell, and then a `§` read out of history does not match the same `§`
    # read from the working tree — a content comparison fails for no visible reason.
    result = subprocess.run(args, capture_output=True, encoding="utf8")
    return result.returncode, result.stdout


def merge_base(base: str) -> str:
    code, out = run(["git", "merge-base", "HEAD", base])
    return out.strip() if code == 0 and out.strip() else base


def changed_files(ref: str) -> list[str] | None:
    code, out = run(["git", "diff", "--name-only", f"{ref}...HEAD"])
    if code != 0:
        return None
    return [line.strip() for line in out.splitlines() if line.strip()]


def contents(ref: str | None, path: str) -> str | None:
    """`path` at `ref`, or from the working tree when `ref` is None."""
    if ref is None:
        try:
            with open(path, encoding="utf8") as fh:
                return fh.read()
        except OSError:
            return None
    code, out = run(["git", "show", f"{ref}:{path}"])
    return out if code == 0 else None


def semantic_boundaries(ref: str | None) -> dict | None:
    """Semantic subset of .boundaries.json at `ref`, or from the working tree."""
    text = contents(ref, BOUNDARIES)
    if text is None:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    return {key: data.get(key) for key in SEMANTIC_KEYS}


def semantic_workflow(ref: str | None) -> str | None:
    """The workflow at `ref` with every action's version pin stripped out."""
    text = contents(ref, WORKFLOW)
    if text is None:
        return None
    lines = []
    for line in text.splitlines():
        match = USES.match(line)
        lines.append(f"{match['indent']}uses: {match['action']}" if match else line)
    return "\n".join(lines)


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

    if WORKFLOW in touched:
        before = semantic_workflow(ref)
        after = semantic_workflow(None)
        if before is not None and after is not None and before == after:
            touched.remove(WORKFLOW)
            print(f"{WORKFLOW} changed, but only the version an action is pinned to")

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
