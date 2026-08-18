# ADR 0016 - shadcn primitives with Convert-owned tokens, in the web app

**Status:** Accepted
**Date:** 2026-08-18
**Supersedes:** -
**Superseded by:** -

## Context

The product is a dense operating tool used one-handed on mid-range Android phones, often outdoors. It needs a large set of accessible primitives quickly - tables, sheets, dialogs, forms, sidebars - and it needs a visual identity that is not recognisably a default template, because the pitch positions Convert as built locally rather than as a global CRM squeezed to fit.

It also constantly displays four things stock component libraries know nothing about: pipeline stage, lead source, message delivery state, and WhatsApp conversation window state. Without named tokens for those, every component invents its own colour for them.

Performance is a product claim, not a preference: the budget is 150 KB of JavaScript on the pipeline screen, measured on a throttled connection.

## Decision

**shadcn/ui as source-owned primitives, with a Convert-owned token layer.**

- Primitives are generated into `apps/web/components/ui` and treated as our code, not a runtime dependency. They stay close to upstream; product behaviour lives outside that directory.
- Three token tiers in `apps/web/app/globals.css`: oklch primitives, the shadcn semantic contract, and a third tier of **Convert domain tokens** for stage, channel, message status, and conversation window. Components use tiers two and three only.
- Domain tokens are indicator colours - dots, borders, icons, text on neutral surfaces - not badge fills, so no foreground pair is needed for each.
- Stage colours vary in lightness as well as hue, and state is never encoded by colour alone.
- **System fonts.** No webfont: 40-100 KB and delayed first text paint is not worth typographic identity on this budget.
- **Contrast is gated,** not reviewed by eye. `tools/check_contrast.py` converts oklch to sRGB and asserts WCAG ratios in CI (gate G13).
- **`--spacing-tap: 2.75rem`** (44 px) as the minimum interactive size.
- **Dark mode is out of MVP scope.** Dark tokens exist and their text pairs pass, so adding the theme later is tuning; they are advisory in the gate, not enforced.
- **UI stays in `apps/web`.** No `packages/ui` while there is one frontend.

## Consequences

**Positive:** a large accessible component surface immediately, with an identity we control token by token. Domain tokens make the product's own vocabulary a first-class part of the design system, which is what stops twelve components inventing twelve greens for "won". Contrast becomes a build failure rather than a design review opinion. Zero font payload.

**Negative / cost:** source-owned primitives mean upstream fixes arrive by re-running the CLI and re-reading a diff, not by bumping a version. Twenty-three domain tokens are more surface than a default theme, and they need discipline to stay meaningful. System fonts give up typographic distinctiveness - the identity has to come from colour, spacing, and density instead.

**Rejected alternatives:** a component library with a built-in theme (MUI, Mantine, Chakra) - larger runtime, harder to reach the budget, and the visual identity fights the library rather than living in tokens. A `packages/ui` package from the start - would break the `web` imports `contracts` only rule (ADR 0014) for a second frontend that does not exist. Tailwind utility classes with no token layer - fastest to start and guarantees drift, since nothing names the product's own states.

## Enforcement

CI gate G13 (`tools/check_contrast.py`). Boundary rules keep `apps/web` importing `@convert/contracts` alone. Review checklist items for semantic-token use, touch targets, icon imports, and client-side fetching. Conventions in `docs/design-system.md`.
