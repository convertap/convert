# Convert Design System

shadcn/ui primitives, Convert-owned design language. shadcn gives us accessible component source; the visual identity, the domain tokens, and the composition rules are ours (ADR 0016).

**Last updated:** 2026-08-18

---

## 1. Where things live

| Concern | Location |
|---------|----------|
| shadcn config | `apps/web/components.json` |
| Tokens and theme | `apps/web/app/globals.css` |
| shadcn primitives | `apps/web/components/ui` |
| Convert product components | `apps/web/components/convert` |
| Reusable workflow patterns | `apps/web/components/patterns` |
| Layout shells | `apps/web/components/layouts` |
| Contrast gate | `tools/check_contrast.py` |

Run shadcn from `apps/web`, not the repository root:

```bash
cd apps/web
pnpm dlx shadcn@latest add button card input select dialog sheet table badge alert tabs sidebar
```

The CLI creates `lib/utils.ts` (the `cn` helper) on first use. Tailwind v4 is CSS-first, which is why `components.json` has an empty `tailwind.config`, the theme lives in `globals.css` under `@theme inline`.

### No shared UI package, for now

UI stays in `apps/web`. There is one frontend, and a `packages/ui` would need `apps/web` to import something other than `@convert/contracts`, which is the boundary rule that keeps domain logic out of the browser bundle. Creating one later requires an ADR superseding 0014, a `.boundaries.json` change, and a migration plan.

---

## 2. Visual direction

An operating tool, not a marketing site. A rep opens this thirty times a day between customer conversations, usually one-handed, often outdoors.

- **Dense but legible.** Lists and pipelines carry a lot per screen; whitespace serves scanning, not decoration.
- **Calm.** Colour carries meaning: stage, source, delivery state. If everything is coloured, nothing reads.
- **Mobile-first, genuinely.** 360 px is the design target, not the fallback.
- **No hero sections, no gradient blobs, no ornamental cards** inside the app.

Palette: deep teal as the brand and primary, amber for commercial emphasis and constraint states, neutral surfaces for dense work areas, separate success and destructive families for state.

---

## 3. Tokens

Three tiers. A component reaching past semantic tokens to a raw colour is the failure this system exists to prevent, so never skip one.

**Tier 1, the primitives.** oklch values in `:root`. Nothing outside `globals.css` references them.

**Tier 2, the semantic shadcn contract.** `background`, `foreground`, `card`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `success`, `warning`, `border`, `input`, `ring`, `sidebar-*`, `chart-1..5`. Use these in components: `bg-background`, `text-muted-foreground`, `border-border`.

**Tier 3, the Convert domain tokens.** The part shadcn does not provide, and the reason this is our design system rather than a theme:

| Group | Tokens | Used for |
|-------|--------|----------|
| Pipeline stage | `stage-new` `stage-contacted` `stage-qualified` `stage-proposal` `stage-won` `stage-lost` | Kanban column headers, stage chips, deal cards |
| Lead source | `channel-whatsapp` `channel-facebook` `channel-instagram` `channel-phone` `channel-web` `channel-offline` | Source badges on leads and contacts |
| Message status | `status-queued` `status-sent` `status-delivered` `status-read` `status-failed` | Timeline delivery indicators (ADR 0006) |
| WhatsApp window | `window-open` `window-closed` | Window state on the contact record (ADR 0007) |

Available as utilities: `text-stage-won`, `border-l-window-closed`, `bg-channel-whatsapp/10`.

Two rules that keep them tractable:

1. **They are indicator colours, not badge fills.** Dots, left borders, icons, and text on a neutral surface. A filled badge uses `bg-muted` with the domain token as its text colour. That is why there is no `-foreground` pair for each of the twenty-three.
2. **Stage colours vary in lightness as well as hue,** so the sequence survives colour blindness and a greyscale screenshot. Never encode stage by hue alone, pair it with the stage name.

### Typography

System fonts, deliberately. A webfont costs 40–100 KB against a 150 KB budget and delays first text paint on a 3G connection. Roboto is the system face on the Android devices this product runs on, so the stack renders locally with zero download. Revisit only with a measured argument that survives the performance gate.

### Touch targets

`--spacing-tap: 2.75rem` (44 px) generates `min-h-tap`, `size-tap`, `p-tap`. Every interactive element in a list, timeline, or pipeline column must reach it. A rep moving a deal with a thumb on a moving trotro is the real use case.

---

## 4. Accessibility, enforced

This is not a compliance checkbox. The question is whether a rep can read a phone number in daylight.

`tools/check_contrast.py` parses the tokens, converts oklch to sRGB, and asserts WCAG ratios: 4.5 for text, 3.0 for input outlines and focus rings. It runs in CI as **gate G13**.

```bash
python tools/check_contrast.py
```

Rules that follow from it:

- **Never fix a contrast failure by enlarging text.** The same token is reused at body size elsewhere. Change the token's lightness.
- **Amber (`accent`, `warning`, `window-closed`) is never body text on a light surface.** Its light variants exist for fills and chips.
- **Focus rings stay visible.** Do not remove `outline` without replacing it with something that passes 3:1.
- **State is never colour alone.** A stage, a delivery status, and a window state each carry a label or an icon as well as a colour.

### Dark mode is out of MVP scope

`mvp-scope.md` §18 commits to responsive web across mobile, tablet, and desktop. It says nothing about theming. Dark tokens exist so that adding the theme later is tuning rather than a redesign, and their text pairs already pass. They are reported as **advisory** in the contrast gate, not enforced.

Two known dark gaps: `border` and `input` sit at 1.04 against the dark background, well below the 3.0 a form-field boundary needs. Fix those before putting dark mode in scope.

---

## 5. Component rules

- Reach for a shadcn primitive before writing markup.
- `components/ui` stays close to upstream. No product vocabulary, no API calls, no feature flags there.
- Product concepts live in `components/convert`: `LeadCard`, `PipelineColumn`, `SourceBadge`, `MessageStatusIcon`, `WhatsAppWindowBadge`, `FollowUpPrompt`.
- Cross-screen compositions live in `components/patterns`: `FilterBar`, `EmptyState`, `ListDetailShell`, `ConfirmAction`.
- Shells and navigation live in `components/layouts`: `PageShell`, `AppSidebar`, `MobileNav`.
- Semantic and domain tokens only. No raw Tailwind colour utilities (`bg-emerald-600`) in product components.
- Icons come from lucide, **imported individually**. A barrel import pulls the whole set into the bundle.
- Every data surface has loading, empty, and error states. Empty gets real attention: a new workspace sees every screen empty first, and that is the first impression the product makes.

### Promotion rule

A pattern starts local to the screen that needs it. Promote it when a second screen uses it, or when it names a product concept. Premature promotion produces an abstraction fitted to one caller.

---

## 6. Performance, because the split makes it harder

The web app talks to a separate API (ADR 0001), so the usual failure is a client-side data waterfall.

- Fetch in server components and route handlers. A client component that fetches is a review block (ADR 0013).
- Client components stay leaves, interaction only.
- Every new client dependency is declared in the pull request with its transferred size. Budget: **150 KB gzipped** on the pipeline screen.
- Radix primitives arrive per component through shadcn, which is fine; watch the total as the component count grows.

---

## 7. Open decisions

| Item | Needs |
|------|-------|
| Brand marks, logo, app icon, favicon | Design input; tokens do not cover identity assets |
| Illustration and empty-state art direction | Decide before building empty states, or they all get invented separately |
| Whether dark mode enters scope | Product decision; two token fixes required first |
| Chart style for the dashboard | `chart-1..5` exist; the dashboard is not designed yet |
