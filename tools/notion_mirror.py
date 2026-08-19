"""Shared logic for the Notion mirror gate and pusher.

A *mirror* is a Notion page whose content is derived from documents in this repository.
Two kinds, and the difference decides what a machine is allowed to do with it:

  verbatim   The Notion content is byte-identical to a fenced mermaid block in git.
             A machine may overwrite it, because there is nothing human in the copy.

  editorial  The Notion page is a rewrite for a non-engineering reader: simplified,
             reordered, with prose a stakeholder can follow. A machine must never
             overwrite it. All the gate does is notice the source moved and say so.

Neither kind needs network access to check. The manifest records a hash of the source
content at the time someone last mirrored it, so drift is a pure git-versus-manifest
comparison. That is deliberate: a gate that needs a token is a gate that gets skipped.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "docs" / "notion-mirror.json"

FENCE = re.compile(r"^```(\w*)$")


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf8"))


def save_manifest(data: dict) -> None:
    MANIFEST.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf8")


def read_doc(rel: str) -> str:
    p = ROOT / rel
    if not p.exists():
        raise LookupError(f"{rel} does not exist")
    return p.read_text(encoding="utf8")


def section(rel: str, heading: str) -> str:
    """The text of one markdown section, from `heading` to the next same-or-higher heading.

    `heading` is given with its hashes, exactly as it appears: "## 5. Module map".
    """
    text = read_doc(rel)
    lines = text.splitlines()
    level = len(heading) - len(heading.lstrip("#"))
    try:
        start = next(i for i, ln in enumerate(lines) if ln.strip() == heading.strip())
    except StopIteration:
        raise LookupError(f"{rel}: no heading {heading!r}") from None
    end = len(lines)
    for i in range(start + 1, len(lines)):
        m = re.match(r"^(#{1,6}) ", lines[i])
        if m and len(m.group(1)) <= level:
            end = i
            break
    return "\n".join(lines[start:end]).strip()


def mermaid_blocks(rel: str, heading: str) -> list[str]:
    """Bodies of the mermaid blocks inside one section, fences excluded."""
    out, body, inside = [], [], False
    for ln in section(rel, heading).splitlines():
        m = FENCE.match(ln.strip())
        if m and not inside:
            inside = m.group(1) == "mermaid"
            body = []
            continue
        if m and inside:
            out.append("\n".join(body).strip())
            inside = False
            continue
        if inside:
            body.append(ln)
    if inside:
        raise LookupError(f"{rel} {heading!r}: unterminated code fence")
    return out


def _norm(text: str) -> str:
    """Whitespace-insensitive at line ends, so a stray trailing space is not a false alarm."""
    return "\n".join(ln.rstrip() for ln in text.strip().splitlines())


def diagram_source(entry: dict) -> str:
    """The single mermaid block a verbatim entry points at."""
    blocks = mermaid_blocks(entry["file"], entry["section"])
    n = entry.get("block", 0)
    if n >= len(blocks):
        raise LookupError(
            f"{entry['file']} {entry['section']!r}: wanted mermaid block {n}, "
            f"found {len(blocks)}"
        )
    return _norm(blocks[n])


def mirror_content(mirror: dict) -> str:
    """Everything a mirror is derived from, concatenated in manifest order."""
    if mirror["kind"] == "verbatim":
        return "\n\n".join(diagram_source(d) for d in mirror["diagrams"])
    return "\n\n".join(section(s["file"], s["section"]) for s in mirror["sources"])


def mirror_hash(mirror: dict) -> str:
    return hashlib.sha256(_norm(mirror_content(mirror)).encode("utf8")).hexdigest()[:16]


def audit(manifest: dict) -> tuple[list[dict], list[dict], list[dict], list[str]]:
    """Split mirrors into current, stale, and never-published, plus manifest errors.

    A `pending` mirror has never been machine-published, which is a different thing from
    having drifted: there is no earlier state to have drifted from. The gate says so and
    does not fail, because failing would block every pull request on a setup step that has
    nothing to do with the change under review.
    """
    current, stale, pending, broken = [], [], [], []
    for mirror in manifest["mirrors"]:
        try:
            actual = mirror_hash(mirror)
        except LookupError as exc:
            broken.append(f"{mirror['title']}: {exc}")
            continue
        record = dict(mirror, actual=actual)
        if mirror.get("pending"):
            pending.append(record)
        elif actual == mirror.get("hash"):
            current.append(record)
        else:
            stale.append(record)
    return current, stale, pending, broken


def die(msg: str) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(1)
