#!/usr/bin/env python3
"""Fail the build when an import crosses a layer boundary it is not allowed to cross.

Reads .boundaries.json — the machine-readable form of docs/architecture.md §5 — and
checks every source file's imports against the layer it belongs to. Two kinds of
violation are reported:

  1. Internal: a layer importing another layer it may not depend on
     (e.g. apps/web importing packages/core, which would leak domain logic
     into the browser bundle).
  2. External: a forbidden third-party package inside a layer that must stay
     free of it (e.g. @nestjs/common inside packages/core, which would end the
     framework-free property the ports-and-adapters design depends on).

Stdlib only, deliberately: this must run before any package manager exists, and it
must keep running if the toolchain changes.

Usage:
    python tools/check_boundaries.py            # check, exit 1 on violation
    python tools/check_boundaries.py --matrix   # print the allowed-dependency matrix
    python tools/check_boundaries.py --json     # machine-readable violations
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CONFIG = REPO / ".boundaries.json"

SOURCE_SUFFIXES = {".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"}

# from 'x' | import 'x' | require('x') | import('x')
IMPORT_RE = re.compile(
    r"""(?:\bfrom\s+|\bimport\s+|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]"""
)


def load_config() -> dict:
    if not CONFIG.exists():
        sys.exit(f"missing {CONFIG.relative_to(REPO)}")
    with CONFIG.open(encoding="utf8") as fh:
        return json.load(fh)


def glob_to_regex(glob: str) -> re.Pattern[str]:
    out, i = [], 0
    while i < len(glob):
        if glob.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif glob.startswith("**", i):
            out.append(".*")
            i += 2
        elif glob[i] == "*":
            out.append("[^/]*")
            i += 1
        elif glob[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(glob[i]))
            i += 1
    return re.compile("^" + "".join(out) + "$")


def layer_of(rel: str, layers: dict) -> str | None:
    """Longest matching layer path wins, so apps/api beats apps."""
    best, best_len = None, -1
    for name, spec in layers.items():
        prefix = spec["path"].rstrip("/") + "/"
        if rel.startswith(prefix) and len(prefix) > best_len:
            best, best_len = name, len(prefix)
    return best


def external_root(spec: str) -> str:
    """'@scope/pkg/sub' -> '@scope/pkg'; 'pkg/sub' -> 'pkg'."""
    parts = spec.split("/")
    if spec.startswith("@") and len(parts) >= 2:
        return "/".join(parts[:2])
    return parts[0]


def classify(spec: str, rel: str, alias: str, layers: dict) -> tuple[str, str] | None:
    """Return ('internal', layer) or ('external', package-root), or None to ignore."""
    if spec.startswith(alias):
        target = spec[len(alias):].split("/")[0]
        return ("internal", target) if target in layers else None

    if spec.startswith("."):
        resolved = (Path(rel).parent / spec).as_posix()
        # collapse .. segments without touching the filesystem
        stack: list[str] = []
        for part in resolved.split("/"):
            if part == "..":
                if stack:
                    stack.pop()
            elif part not in (".", ""):
                stack.append(part)
        target = layer_of("/".join(stack) + "/", layers)
        return ("internal", target) if target else None

    if spec.startswith(("node:", "#")):
        return None

    return ("external", external_root(spec))


def iter_sources(ignore: list[re.Pattern[str]]):
    for path in REPO.rglob("*"):
        if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
            continue
        rel = path.relative_to(REPO).as_posix()
        if any(pattern.match(rel) for pattern in ignore):
            continue
        yield path, rel


def main() -> int:
    config = load_config()
    layers: dict = config["layers"]
    alias: str = config["aliasPrefix"]
    ignore = [glob_to_regex(g) for g in config.get("ignore", [])]

    roots = config.get("compositionRoots", {})
    root_patterns = [glob_to_regex(g) for g in roots.get("globs", [])]
    root_extra: list[str] = roots.get("mayAlsoImport", [])

    if "--matrix" in sys.argv:
        width = max(len(n) for n in layers)
        print(f"{'layer'.ljust(width)}  may import")
        print(f"{'-' * width}  {'-' * 40}")
        for name, spec in layers.items():
            allowed = ", ".join(spec["mayImport"]) or "(nothing)"
            print(f"{name.ljust(width)}  {allowed}")
        print(f"\ncomposition roots may also import: {', '.join(root_extra) or '(none)'}")
        for glob in roots.get("globs", []):
            print(f"  {glob}")
        return 0

    violations = []
    scanned = 0

    for path, rel in iter_sources(ignore):
        layer = layer_of(rel, layers)
        if layer is None:
            continue
        scanned += 1

        spec = layers[layer]
        allowed = set(spec["mayImport"])
        if any(p.match(rel) for p in root_patterns):
            allowed |= set(root_extra)
        forbidden = {pkg.lower() for pkg in spec.get("forbiddenExternals", [])}

        for lineno, line in enumerate(path.read_text(encoding="utf8", errors="ignore").splitlines(), 1):
            if line.lstrip().startswith(("//", "*", "/*")):
                continue
            for match in IMPORT_RE.finditer(line):
                target = classify(match.group(1), rel, alias, layers)
                if target is None:
                    continue
                kind, name = target
                if kind == "internal" and name != layer and name not in allowed:
                    violations.append({
                        "file": rel, "line": lineno, "kind": "layer",
                        "detail": f"{layer} may not import {name}",
                        "import": match.group(1),
                    })
                elif kind == "external" and name.lower() in forbidden:
                    violations.append({
                        "file": rel, "line": lineno, "kind": "external",
                        "detail": f"{name} is forbidden inside {layer}",
                        "import": match.group(1),
                    })

    if "--json" in sys.argv:
        print(json.dumps({"scanned": scanned, "violations": violations}, indent=2))
        return 1 if violations else 0

    if not violations:
        print(f"boundaries ok — {scanned} source file(s) checked, 0 violations")
        return 0

    print(f"boundary violations: {len(violations)} (in {scanned} file(s) checked)\n")
    for v in violations:
        print(f"  {v['file']}:{v['line']}")
        print(f"    {v['detail']}  ->  imported '{v['import']}'")
    print("\nFix the import, or change .boundaries.json in the same commit as an ADR.")
    print("See docs/architecture.md §5 and docs/engineering-guardrails.md.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
