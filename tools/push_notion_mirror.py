#!/usr/bin/env python3
"""Push git-owned diagrams into Notion, and record what is current.

Two modes, because the two kinds of mirror need opposite treatment:

    infisical run --env=dev -- python tools/push_notion_mirror.py
        Overwrite the mermaid code blocks of every `verbatim` mirror with the version in
        git, then stamp those mirrors current. Needs NOTION_TOKEN.

    python tools/push_notion_mirror.py --accept
        Stamp the `editorial` mirrors current. No network. Run this after a person has
        read a source change and updated the stakeholder page by hand.

`--accept` deliberately refuses to stamp a verbatim mirror. The only way one of those
becomes current is by actually pushing it, so the manifest cannot claim a diagram is
published when it is not.

This script can only replace the body of a mermaid code block that already exists on the
page. It never creates a block, never deletes one, and never touches prose, tables, or
callouts. That bound is the reason it is safe to point at a workspace people write in.

Setup, once: create an internal integration, put its token in Infisical as NOTION_TOKEN,
and share each mirrored page with the integration. An integration sees nothing until a
page is shared with it, and an unshared page is indistinguishable from a bad token.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from notion_mirror import (  # noqa: E402
    audit,
    diagram_source,
    die,
    load_manifest,
    mirror_hash,
    save_manifest,
)

API = "https://api.notion.com/v1"
VERSION = "2022-06-28"
CHUNK = 1900  # Notion caps a single rich_text item at 2000 characters


def request(method: str, path: str, token: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Notion-Version", VERSION)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        if exc.code == 401:
            die(
                "Notion returned 401. Either NOTION_TOKEN is wrong, or the integration has "
                "not been shared into the page. Both look the same from here.\n" + detail
            )
        if exc.code == 404:
            die(
                "Notion returned 404. The page exists but is not shared with this "
                "integration, or the id in the manifest is wrong.\n" + detail
            )
        die(f"Notion {method} {path} failed with {exc.code}:\n{detail}")
        raise  # unreachable, keeps type checkers quiet


def page_children(page_id: str, token: str) -> list[dict]:
    out: list[dict] = []
    cursor = None
    while True:
        query = f"?page_size=100{f'&start_cursor={cursor}' if cursor else ''}"
        payload = request("GET", f"/blocks/{page_id}/children{query}", token)
        out.extend(payload["results"])
        if not payload.get("has_more"):
            return out
        cursor = payload["next_cursor"]


def mermaid_block_ids(page_id: str, token: str) -> list[str]:
    return [
        b["id"]
        for b in page_children(page_id, token)
        if b["type"] == "code" and b["code"].get("language") == "mermaid"
    ]


def rich_text(body: str) -> list[dict]:
    parts = [body[i : i + CHUNK] for i in range(0, len(body), CHUNK)] or [""]
    return [{"type": "text", "text": {"content": p}} for p in parts]


def push(manifest: dict, token: str, dry_run: bool) -> list[str]:
    """Overwrite verbatim mirrors. Returns the titles that are now current in Notion."""
    pushed = []
    for mirror in manifest["mirrors"]:
        if mirror["kind"] != "verbatim":
            continue

        page = mirror["page"]
        found = mermaid_block_ids(page, token)
        wanted = max(d["page_block"] for d in mirror["diagrams"]) + 1
        if len(found) < wanted:
            die(
                f"{mirror['title']}: the page has {len(found)} mermaid block(s) but the "
                f"manifest addresses block {wanted - 1}. Somebody restructured the page. "
                "Fix page_block in docs/notion-mirror.json rather than guessing."
            )

        for entry in mirror["diagrams"]:
            body = diagram_source(entry)
            block = found[entry["page_block"]]
            label = f"{mirror['title']} block {entry['page_block']}"
            if dry_run:
                print(f"  would write {label}  <- {entry['file']} {entry['section']}")
                continue
            request(
                "PATCH",
                f"/blocks/{block}",
                token,
                {"code": {"language": "mermaid", "rich_text": rich_text(body)}},
            )
            print(f"  wrote {label}")

        pushed.append(mirror["title"])
    return pushed


def stamp(manifest: dict, titles: list[str]) -> int:
    changed = 0
    for mirror in manifest["mirrors"]:
        if mirror["title"] not in titles:
            continue
        actual = mirror_hash(mirror)
        if mirror.get("hash") != actual or mirror.get("pending"):
            mirror["hash"] = actual
            mirror.pop("pending", None)
            changed += 1
    if changed:
        save_manifest(manifest)
    return changed


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--accept",
        action="store_true",
        help="record the editorial mirrors as current, without touching Notion",
    )
    ap.add_argument("--dry-run", action="store_true", help="say what would change, change nothing")
    args = ap.parse_args()

    manifest = load_manifest()
    _, stale, pending, broken = audit(manifest)
    if broken:
        die("The manifest does not match the documents:\n  " + "\n  ".join(broken))

    if args.accept:
        titles = [m["title"] for m in stale if m["kind"] == "editorial"]
        refused = [m["title"] for m in stale + pending if m["kind"] == "verbatim"]
        if not titles and not refused:
            print("Nothing to accept: every mirror is already current.")
            return 0
        n = stamp(manifest, titles)
        for t in titles:
            print(f"  accepted {t}")
        if refused:
            print(
                "\nNot accepted, because these are machine-owned and have to be pushed for "
                "real:\n  " + "\n  ".join(refused)
            )
        print(f"\n{n} mirror(s) stamped. Commit docs/notion-mirror.json.")
        return 1 if refused else 0

    token = os.environ.get("NOTION_TOKEN")
    if not token and not args.dry_run:
        die(
            "NOTION_TOKEN is not set. Secrets come from Infisical, never a file (ADR 0020):\n"
            "  infisical run --env=dev -- python tools/push_notion_mirror.py"
        )

    pushed = push(manifest, token or "", args.dry_run)
    if args.dry_run:
        print("\nDry run, nothing written.")
        return 0
    n = stamp(manifest, pushed)
    print(f"\n{len(pushed)} page(s) pushed, {n} manifest entr(ies) updated.")
    print("Commit docs/notion-mirror.json so CI knows Notion is current.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
