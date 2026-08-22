#!/usr/bin/env python3
"""Keep PostgreSQL declarations aligned with the version that serves production.

CI, local development, and deployed environments once ran different PostgreSQL
majors. This gate keeps the current declarations on one major while preserving
explicitly marked historical evidence.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
VERSION_FILE = REPO / ".postgres-version"

# Accepted ADRs deliberately stay outside this registry. Their measured server
# versions are historical evidence and must not be swept as current declarations.
REGISTERED_FILES = (
    ".github/workflows/ci.yml",
    "docker-compose.yml",
    "docs/architecture.md",
    "docs/pre-development-checklist.md",
    "CONTRIBUTING.md",
    "CLAUDE.md",
)

# The accepted grammar for naming a major, in prose or in an image tag. A pinned minor is
# allowed and only the major is compared, because ADR 0053 makes the major the decision and
# the minor evidence.
MAJOR = r"(\d+)(?:\.\d+)?"
DECLARATION = re.compile(
    rf"\b(?:PostgreSQL|Postgres|PG)[\s:]*{MAJOR}\b|"
    rf"\bpostgres(?:ql)?:{MAJOR}(?:-alpine)?\b",
    re.IGNORECASE,
)
# Any major, not just 10-19, and every spelling the declaration grammar accepts. A sweep
# hardcoded to today's range goes blind the moment the declared major moves past it, and one
# that recognises fewer spellings than a person might write is bypassed by writing `PG 17`.
STALE_MENTION = DECLARATION


def major_from(match: re.Match[str]) -> str:
    return next(group for group in match.groups() if group is not None)


def main() -> int:
    failures: list[str] = []
    anchor_count = 0

    try:
        version_text = VERSION_FILE.read_text(encoding="utf8")
    except OSError as error:
        print(f"{VERSION_FILE.relative_to(REPO)}: cannot read declared major: {error}")
        return 1

    if not re.fullmatch(r"\d+\n", version_text):
        print(".postgres-version: expected one numeric major followed by a newline")
        return 1
    declared_major = version_text.rstrip("\n")

    for relative_name in REGISTERED_FILES:
        path = REPO / relative_name
        try:
            lines = path.read_text(encoding="utf8").splitlines()
        except OSError as error:
            failures.append(f"{relative_name}: cannot read file: {error}")
            print(f"checked {relative_name}: unavailable")
            continue

        yaml = path.suffix in {".yml", ".yaml"}
        anchor = re.compile(r"# pg-version\s*$") if yaml else re.compile(r"<!-- pg-version -->")
        # The hatch must name the majors it excuses: `pg-version:historical=16`. A bare hatch
        # excused the whole line, so a line mixing a historical mention with a current one -
        # which CONTRIBUTING.md does - hid a wrong current declaration completely. Review
        # found that by mutating the 18 on that line to 17 and watching the gate pass.
        historical = (
            re.compile(r"# pg-version:historical=([\d,\s]+)")
            if yaml
            else re.compile(r"<!-- pg-version:historical=([\d,\s]+) -->")
        )
        file_anchors = 0

        for line_number, line in enumerate(lines, start=1):
            if anchor.search(line):
                file_anchors += 1
                anchor_count += 1
                declarations = list(DECLARATION.finditer(line))
                if not declarations:
                    failures.append(
                        f"{relative_name}:{line_number}: anchored declaration names no "
                        f"Postgres major"
                    )
                for declaration in declarations:
                    found = major_from(declaration)
                    if found != declared_major:
                        failures.append(
                            f"{relative_name}:{line_number}: anchored declaration found "
                            f"{declaration.group(0)!r}, expected major {declared_major}"
                        )

            hatch = historical.search(line)
            excused = (
                {major.strip() for major in hatch.group(1).split(",") if major.strip()}
                if hatch
                else set()
            )
            for mention in STALE_MENTION.finditer(line):
                found = major_from(mention)
                if found == declared_major or found in excused:
                    continue
                escape_hatch = (
                    f"# pg-version:historical={found}"
                    if yaml
                    else f"<!-- pg-version:historical={found} -->"
                )
                failures.append(
                    f"{relative_name}:{line_number}: stale mention {mention.group(0)!r}; "
                    f"add {escape_hatch} if this is historical"
                )

        if file_anchors == 0:
            failures.append(f"{relative_name}: no pg-version anchor found")
        print(f"checked {relative_name}: {file_anchors} anchor(s)")

    if failures:
        for failure in failures:
            print(f"failure: {failure}")
        return 1

    print(
        f"Postgres {declared_major} is consistent: {anchor_count} anchor(s) "
        f"across {len(REGISTERED_FILES)} file(s) checked"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
