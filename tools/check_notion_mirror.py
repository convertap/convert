#!/usr/bin/env python3
"""Gate G15. Fail when a Notion mirror's source has moved since it was last mirrored.

Notion holds pages derived from documents in this repository. Nothing keeps them honest by
itself, and a stale stakeholder page is worse than no page because it gets believed. This
gate notices.

It deliberately does not talk to Notion. The manifest records a hash of the source content
taken when someone last mirrored it, so the check is a comparison between
`docs/notion-mirror.json` and the working tree. No token, no network, no flake, and it runs
the same on a laptop as in CI.

What it cannot see: an edit made directly in Notion. Verbatim pages carry a notice telling
people not to, and the pusher overwrites them anyway. Editorial pages are meant to be
edited by hand, so an edit there is not drift.

    python tools/check_notion_mirror.py            # gate
    python tools/check_notion_mirror.py --list     # what is mirrored from where
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from notion_mirror import audit, load_manifest  # noqa: E402

PUSH = "infisical run --env=dev -- python tools/push_notion_mirror.py"


def url(mirror: dict) -> str:
    return "https://app.notion.com/p/" + mirror["page"].replace("-", "")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--list", action="store_true", help="show the manifest and exit")
    args = ap.parse_args()

    manifest = load_manifest()

    if args.list:
        for m in manifest["mirrors"]:
            flag = "  (never published)" if m.get("pending") else ""
            print(f"{m['title']}  [{m['kind']}]{flag}")
            print(f"  {url(m)}")
            for s in m["diagrams"] if m["kind"] == "verbatim" else m["sources"]:
                print(f"  <- {s['file']}  {s['section']}")
        return 0

    current, stale, pending, broken = audit(manifest)

    if broken:
        print("G15 Notion mirror: the manifest does not match the documents.\n")
        for line in broken:
            print(f"  {line}")
        print(
            "\nA mirrored section was renamed or removed. Point docs/notion-mirror.json at "
            "where the content lives now."
        )
        return 1

    def report_pending() -> None:
        if not pending:
            return
        print(
            f"\n{len(pending)} mirror(s) have never been published to Notion. That is not a\n"
            "failure: there is no earlier state to have drifted from. Each needs one first\n"
            "push, which needs NOTION_TOKEN to exist. See docs/notion-workspace.md section 9.\n"
        )
        for m in pending:
            print(f"  {m['title']}")

    if not stale:
        print(f"G15 Notion mirror: {len(current)} mirror(s) current.")
        report_pending()
        return 0

    verbatim = [m for m in stale if m["kind"] == "verbatim"]
    editorial = [m for m in stale if m["kind"] == "editorial"]

    print("G15 Notion mirror: Notion is behind this branch.\n")

    if verbatim:
        print("Machine-owned pages. Push them, then commit the manifest:\n")
        for m in verbatim:
            print(f"  {m['title']}")
        print(f"\n    {PUSH}\n")

    if editorial:
        print("Hand-written pages. A machine must not rewrite these; someone has to read the")
        print("change and decide whether the stakeholder version now needs to say something")
        print("different:\n")
        for m in editorial:
            print(f"  {m['title']}")
            print(f"    {url(m)}")
            for s in m["sources"]:
                print(f"    <- {s['file']}  {s['section']}")
        print("\nOnce the page reads correctly again, record it:\n")
        print("    python tools/push_notion_mirror.py --accept\n")

    print(
        "If a source change genuinely does not affect what Notion says, --accept is the right\n"
        "answer. Saying so deliberately is the point; forgetting is what this gate is for."
    )
    report_pending()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
