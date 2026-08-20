#!/usr/bin/env python3
"""Push git-owned diagrams into Notion, and record what is current.

Two modes, because the two kinds of mirror need opposite treatment:

    infisical run --env=dev -- python tools/push_notion_mirror.py
        Overwrite the mermaid code blocks of every `verbatim` mirror with the version in
        git, then stamp those mirrors current. Needs NOTION_TOKEN.

    infisical run --env=dev -- python tools/push_notion_mirror.py --verify
        Compare what Notion holds against git, block by block, and write nothing. This is
        the only check that catches an edit made directly in Notion, which G15 cannot see.

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
import difflib
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date
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


def mermaid_blocks(page_id: str, token: str) -> list[dict]:
    """The mermaid code blocks on a page, in document order.

    Returns whole blocks rather than ids, because the caller needs both the id to write to
    and the current contents to decide whether writing is necessary at all.
    """
    return [
        b
        for b in page_children(page_id, token)
        if b["type"] == "code" and b["code"].get("language") == "mermaid"
    ]


def rich_text(body: str) -> list[dict]:
    parts = [body[i : i + CHUNK] for i in range(0, len(body), CHUNK)] or [""]
    return [{"type": "text", "text": {"content": p}} for p in parts]


def block_text(block: dict) -> str:
    """The mermaid body currently stored in a Notion code block."""
    joined = "".join(rt["plain_text"] for rt in block["code"]["rich_text"])
    return "\n".join(line.rstrip() for line in joined.strip().splitlines())


def verify(manifest: dict, token: str) -> int:
    """Compare what Notion holds against git, block by block. Returns the mismatch count.

    This is the one check that catches an edit made directly in Notion, which gate G15
    cannot see: G15 compares the manifest against the working tree and never leaves the
    machine. Needs the token, so it is a local command rather than part of CI.
    """
    bad = 0
    for mirror in manifest["mirrors"]:
        if mirror["kind"] != "verbatim":
            continue
        blocks = mermaid_blocks(mirror["page"], token)
        for entry in mirror["diagrams"]:
            n = entry["page_block"]
            if n >= len(blocks):
                print(f"  MISSING  {mirror['title']} block {n}")
                bad += 1
                continue
            want, live = diagram_source(entry), block_text(blocks[n])
            if want == live:
                print(f"  match    {mirror['title']} block {n}")
                continue
            bad += 1
            print(f"  DIFFERS  {mirror['title']} block {n}  <- {entry['file']} {entry['section']}")
            for line in difflib.unified_diff(
                want.splitlines(), live.splitlines(), "git", "notion", lineterm="", n=1
            ):
                print(f"    {line}")
    return bad


def log_change(manifest: dict, token: str, titles: list[str], today: str) -> None:
    """Append one row to the Notion changelog describing what was just published.

    The pusher is the only thing that knows a machine changed a page, so it is the only
    thing that can record it without someone remembering to. Discipline is exactly what
    failed for the diagrams before this pipeline existed: four were never copied across
    and two lived only in Notion.

    A failure here is reported and does not fail the run. The push has already happened by
    this point, and exiting non-zero afterwards would claim the publish failed when it did
    not. The most likely cause is the integration not being shared into the database.
    """
    database = manifest.get("changelogDatabase")
    if not database:
        return

    def text(value: str) -> dict:
        return {"rich_text": [{"text": {"content": value}}]}

    body = {
        "parent": {"database_id": database},
        "properties": {
            "Change": {
                "title": [
                    {"text": {"content": f"Diagrams republished from git ({len(titles)} page(s))"}}
                ]
            },
            "Date": {"date": {"start": today}},
            "Area": {"select": {"name": "Delivery"}},
            "Kind": {"select": {"name": "Machine"}},
            "Pages": text(", ".join(titles)),
            "Why": text(
                "A mermaid block in the repository changed, so the published copy was "
                "overwritten to match. Written by tools/push_notion_mirror.py, which touches "
                "diagrams only and never prose."
            ),
        },
    }

    try:
        request("POST", "/pages", token, body)
        print("  changelog row added")
    except SystemExit:
        print(
            "  warning: the changelog row could not be written. The push succeeded. "
            "  Most likely the integration is not shared into the Changelog database."
        )


def push(manifest: dict, token: str, dry_run: bool) -> tuple[list[str], list[str]]:
    """Bring verbatim mirrors up to date.

    Returns (published, changed). `published` is every verbatim mirror confirmed to match
    git, which is what may be stamped. `changed` is the subset where a block was actually
    rewritten, which is what deserves a changelog row: a run that rewrites nothing did not
    change anything, and saying otherwise makes the log worth less than no log.
    """
    published, changed = [], []
    for mirror in manifest["mirrors"]:
        if mirror["kind"] != "verbatim":
            continue

        page = mirror["page"]
        found = mermaid_blocks(page, token)
        wanted = max(d["page_block"] for d in mirror["diagrams"]) + 1
        if len(found) < wanted:
            die(
                f"{mirror['title']}: the page has {len(found)} mermaid block(s) but the "
                f"manifest addresses block {wanted - 1}. Somebody restructured the page. "
                "Fix page_block in docs/notion-mirror.json rather than guessing."
            )

        touched = False
        for entry in mirror["diagrams"]:
            body = diagram_source(entry)
            block = found[entry["page_block"]]
            label = f"{mirror['title']} block {entry['page_block']}"

            if block_text(block) == body:
                if dry_run:
                    print(f"  unchanged {label}")
                continue

            if dry_run:
                print(f"  would write {label}  <- {entry['file']} {entry['section']}")
                touched = True
                continue

            request(
                "PATCH",
                f"/blocks/{block['id']}",
                token,
                {"code": {"language": "mermaid", "rich_text": rich_text(body)}},
            )
            print(f"  wrote {label}")
            touched = True

        published.append(mirror["title"])
        if touched:
            changed.append(mirror["title"])
    return published, changed


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
    ap.add_argument(
        "--no-changelog",
        action="store_true",
        help="skip appending a row to the Notion changelog after publishing",
    )
    ap.add_argument(
        "--verify",
        action="store_true",
        help="compare what Notion holds against git without writing anything",
    )
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
    if args.verify:
        if not token:
            die("NOTION_TOKEN is not set. --verify has to read Notion to compare against it.")
        bad = verify(manifest, token)
        print(f"\n{bad} block(s) differ from git." if bad else "\nNotion matches git exactly.")
        return 1 if bad else 0

    if not token:
        die(
            "NOTION_TOKEN is not set. Secrets come from Infisical, never a file (ADR 0020):\n"
            "  infisical run --env=dev -- python tools/push_notion_mirror.py\n"
            "\n--dry-run needs it too: locating the blocks to write means reading the page."
        )

    pushed, changed = push(manifest, token, args.dry_run)
    if args.dry_run:
        print("\nDry run, nothing written.")
        return 0
    if changed and not args.no_changelog:
        log_change(manifest, token, changed, date.today().isoformat())

    n = stamp(manifest, pushed)
    verb = f"{len(changed)} page(s) changed" if changed else "nothing to change"
    print()
    print(f"{len(pushed)} page(s) checked, {verb}, {n} manifest entr(ies) updated.")
    print("Commit docs/notion-mirror.json so CI knows Notion is current.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
