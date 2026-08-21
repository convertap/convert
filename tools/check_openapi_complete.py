#!/usr/bin/env python3
"""Gate G10, second half: no endpoint is undocumented.

The first half of G10 -- regenerate the spec and fail on a diff -- has run in CI since
ADR 0015. The second half never existed. `engineering-guardrails.md` section 6.1 and
ADR 0015 both claimed G10 "fails on an endpoint with no summary, no response type, or an
untyped body", and nothing checked it. One documented endpoint hid the gap.

This reads the committed `apps/api/openapi.json` -- the artifact, not the source -- so it
cannot be fooled by a decorator that looks right but generates nothing. Run it after
`openapi:generate`, or the two halves of the gate disagree about what the code produces.

What it checks, and why each one:

  1. summary          a spec entry with no summary is a URL, not documentation
  2. 2xx with schema  a consumer cannot generate a typed client from an untyped success
  3. typed body       an untyped request body is an undocumented contract
  4. operationId      the generated client names its methods from this
  5. at least one tag ungrouped operations are unfindable in Swagger UI once there are 30

What it deliberately does NOT check yet, so that nobody reads a pass as more than it is:

  - every operation documents a failure response against the error envelope. ADR 0015
    requires it. It cannot be enforced until the envelope is a Zod-derived DTO that every
    controller declares (ADR 0045), so it arrives with that change, not before.
  - every schema property carries an example. ADR 0015 requires it; enforcing it today
    would fail on array properties that legitimately carry their example on the item.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SPEC = Path(__file__).resolve().parent.parent / "apps" / "api" / "openapi.json"

# Anything else is a field of the path item (parameters, servers, $ref), not an operation.
METHODS = ("get", "put", "post", "delete", "options", "head", "patch", "trace")


def failures_for(path: str, method: str, operation: dict) -> list[str]:
    where = f"{method.upper()} {path}"
    found: list[str] = []

    if not str(operation.get("summary", "")).strip():
        found.append(f"{where}: no summary")

    if not str(operation.get("operationId", "")).strip():
        found.append(f"{where}: no operationId")

    if not operation.get("tags"):
        found.append(f"{where}: no tag")

    responses = operation.get("responses") or {}
    successes = [code for code in responses if code.startswith("2")]
    if not successes:
        found.append(f"{where}: no 2xx response")
    else:
        for code in successes:
            content = (responses[code] or {}).get("content") or {}
            if not content:
                # 204 says "no content" on purpose; anything else is an omission.
                if code != "204":
                    found.append(f"{where}: {code} has no response body schema")
                continue
            for media_type, media in content.items():
                if not (media or {}).get("schema"):
                    found.append(f"{where}: {code} {media_type} has no schema")

    body = operation.get("requestBody")
    if body is not None:
        content = body.get("content") or {}
        if not content:
            found.append(f"{where}: request body is untyped")
        for media_type, media in content.items():
            if not (media or {}).get("schema"):
                found.append(f"{where}: request body {media_type} has no schema")

    return found


def main() -> int:
    if not SPEC.exists():
        print(f"G10: {SPEC} not found. Run 'pnpm --filter @convert/api openapi:generate'.")
        return 1

    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    paths = spec.get("paths") or {}

    if not paths:
        # A pass, and a hollow one: an empty spec satisfies every rule below without
        # containing anything. It exits 0 so the gate does not block a repository that
        # has no endpoints yet, and says so on stdout so the green tick is not read as
        # evidence. Once an endpoint exists this branch is unreachable, and a spec that
        # loses its paths fails on the regeneration diff in the step before this one.
        print("G10: openapi.json documents no paths. Nothing to check, so nothing is proven.")
        return 0

    failures: list[str] = []
    operations = 0
    for path, item in paths.items():
        for method in METHODS:
            operation = (item or {}).get(method)
            if not isinstance(operation, dict):
                continue
            operations += 1
            failures.extend(failures_for(path, method, operation))

    if failures:
        print(f"G10: {len(failures)} documentation gap(s) across {operations} operation(s):")
        for failure in failures:
            print(f"  - {failure}")
        print("\nFix the decorator on the controller or DTO, regenerate, and commit the spec.")
        return 1

    print(f"G10: {operations} operation(s) documented (summary, tag, typed 2xx, typed body).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
