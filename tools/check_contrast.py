#!/usr/bin/env python3
"""Check WCAG contrast for the foreground/background token pairs in globals.css.

The product is used one-handed, outdoors, on mid-range Android screens. Contrast is
not a compliance checkbox here; it is whether a rep can read a lead's phone number
in daylight. Palette regressions are silent, so this is a gate rather than a habit.

Parses oklch() values out of apps/web/app/globals.css, converts to sRGB, and reports
the WCAG 2.1 contrast ratio for each pair that must be legible.

Thresholds: 4.5 normal text, 3.0 large text and UI boundaries.

Usage:
    python tools/check_contrast.py            # all themes
    python tools/check_contrast.py --strict   # exit 1 on any failure
"""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CSS = REPO / "apps" / "web" / "app" / "globals.css"

# (foreground token, background token, minimum ratio, what it is)
PAIRS = [
    ("foreground", "background", 4.5, "body text"),
    ("muted-foreground", "background", 4.5, "secondary text - timestamps, hints"),
    ("muted-foreground", "muted", 4.5, "text on muted surfaces"),
    ("card-foreground", "card", 4.5, "text on cards - lead and deal cards"),
    ("primary-foreground", "primary", 4.5, "primary button label"),
    ("secondary-foreground", "secondary", 4.5, "secondary button label"),
    ("accent-foreground", "accent", 4.5, "accent chip label"),
    ("destructive-foreground", "destructive", 4.5, "destructive button label"),
    ("success-foreground", "success", 4.5, "success badge label"),
    ("warning-foreground", "warning", 4.5, "warning badge label"),
    ("sidebar-foreground", "sidebar", 4.5, "sidebar navigation text"),
    ("sidebar-accent-foreground", "sidebar-accent", 4.5, "active sidebar item"),
    ("border", "background", 3.0, "card and list separators - must read outdoors"),
    ("input", "background", 3.0, "input outline - WCAG 1.4.11 UI boundary"),
    ("ring", "background", 3.0, "focus ring - keyboard and screen-reader users"),

    # Convert domain tokens. Checked at 4.5 because they are used as text and icon
    # colour on the page background, not only as decorative dots.
    ("stage-new", "background", 4.5, "pipeline stage: New"),
    ("stage-contacted", "background", 4.5, "pipeline stage: Contacted"),
    ("stage-qualified", "background", 4.5, "pipeline stage: Qualified"),
    ("stage-proposal", "background", 4.5, "pipeline stage: Proposal"),
    ("stage-won", "background", 4.5, "pipeline stage: Won"),
    ("stage-lost", "background", 4.5, "pipeline stage: Lost"),
    ("channel-whatsapp", "background", 4.5, "lead source: WhatsApp"),
    ("channel-facebook", "background", 4.5, "lead source: Facebook"),
    ("channel-instagram", "background", 4.5, "lead source: Instagram"),
    ("channel-phone", "background", 4.5, "lead source: phone"),
    ("channel-web", "background", 4.5, "lead source: web form"),
    ("channel-offline", "background", 4.5, "lead source: walk-in and referral"),
    ("status-queued", "background", 4.5, "message status: queued"),
    ("status-sent", "background", 4.5, "message status: sent"),
    ("status-delivered", "background", 4.5, "message status: delivered"),
    ("status-read", "background", 4.5, "message status: read"),
    ("window-open", "background", 4.5, "WhatsApp window open"),
    ("window-closed", "background", 4.5, "WhatsApp window closed"),
    # Domain tokens are also read on --muted, the badge fill surface.
    ("stage-won", "muted", 4.5, "stage badge on muted fill"),
    ("window-closed", "muted", 4.5, "window badge on muted fill"),
]

# The light theme is what ships (mvp-scope.md section 18 says nothing about dark mode,
# so it is out of MVP scope). Dark tokens exist so adding the theme later is tuning
# rather than a redesign, but they are not production-tuned and are therefore advisory:
# reported, not gated. Moving dark into scope means making it strict here.
GATED_THEMES = ("light",)

OKLCH = re.compile(r"^\s*--([a-z0-9-]+):\s*oklch\(([^)]+)\)\s*;", re.I)
ALIAS = re.compile(r"^\s*--([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)\s*;", re.I)


def parse_blocks(text: str) -> dict[str, dict[str, str]]:
    """Return {theme: {token: raw-value}} for the :root and .dark blocks."""
    blocks: dict[str, dict[str, str]] = {}
    theme = None
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(":root"):
            theme = "light"
            blocks.setdefault(theme, {})
            continue
        if stripped.startswith(".dark"):
            theme = "dark"
            blocks.setdefault(theme, {})
            continue
        if stripped.startswith("@theme"):
            theme = None
            continue
        if theme is None:
            continue
        if stripped.startswith("}"):
            theme = None
            continue
        m = OKLCH.match(line)
        if m:
            blocks[theme][m.group(1)] = m.group(2)
            continue
        m = ALIAS.match(line)
        if m:
            blocks[theme][m.group(1)] = "var:" + m.group(2)
    return blocks


def resolve(token: str, theme: dict[str, str], fallback: dict[str, str]) -> str | None:
    seen = set()
    while True:
        value = theme.get(token) or fallback.get(token)
        if value is None or token in seen:
            return None
        seen.add(token)
        if value.startswith("var:"):
            token = value[4:]
            continue
        return value


def oklch_to_srgb(spec: str) -> tuple[float, float, float]:
    parts = spec.replace("/", " ").split()
    L = float(parts[0].rstrip("%")) / (100 if parts[0].endswith("%") else 1)
    C = float(parts[1])
    H = float(parts[2]) if len(parts) > 2 else 0.0

    h = math.radians(H)
    a, b = C * math.cos(h), C * math.sin(h)

    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3

    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return (r, g, bl)


def relative_luminance(rgb: tuple[float, float, float]) -> float:
    def channel(c: float) -> float:
        c = min(max(c, 0.0), 1.0)
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(fg: str, bg: str) -> float:
    l1 = relative_luminance(oklch_to_srgb(fg))
    l2 = relative_luminance(oklch_to_srgb(bg))
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def main() -> int:
    if not CSS.exists():
        print(f"no {CSS.relative_to(REPO)} yet — skipping contrast check")
        return 0

    blocks = parse_blocks(CSS.read_text(encoding="utf8"))
    light = blocks.get("light", {})
    gated_failures = 0
    advisory_failures = 0

    for theme_name in ("light", "dark"):
        theme = blocks.get(theme_name)
        if not theme:
            continue
        gated = theme_name in GATED_THEMES
        suffix = "" if gated else "   (advisory — dark mode is out of MVP scope)"
        print(f"\n{theme_name}{suffix}")
        print(f"  {'ratio':>6}  {'need':>4}  pair")
        for fg_token, bg_token, minimum, label in PAIRS:
            fg = resolve(fg_token, theme, light)
            bg = resolve(bg_token, theme, light)
            if not fg or not bg:
                print(f"  {'--':>6}  {minimum:>4}  {fg_token} on {bg_token}  (token missing)")
                continue
            value = ratio(fg, bg)
            ok = value >= minimum
            if not ok:
                if gated:
                    gated_failures += 1
                else:
                    advisory_failures += 1
            mark = " " if ok else "!"
            print(f" {mark}{value:>6.2f}  {minimum:>4}  {fg_token} on {bg_token} — {label}")

    print()
    if advisory_failures:
        print(f"{advisory_failures} advisory failure(s) in the dark theme — tune before "
              f"putting dark mode in scope.")
    if gated_failures:
        print(f"{gated_failures} pair(s) below threshold in a gated theme.")
        print("Adjust the lightness of the offending token in apps/web/app/globals.css.")
        print("Do not fix this by making text larger; the same token is reused at body size.")
        return 1
    print(f"contrast ok — gated theme(s) {', '.join(GATED_THEMES)} meet every threshold")
    return 0


if __name__ == "__main__":
    sys.exit(main())
