# Web Components

This directory is the source for frontend components in the MVP web app.

The project uses shadcn/ui as source-owned component code, not as a runtime dependency or visual identity. Add shadcn primitives into `components/ui`, then compose Convert-specific product components outside `components/ui`.

## Structure

```
components/
  ui/          shadcn-generated primitives only
  convert/     Convert product components built from ui primitives
  layouts/     app shells, navigation, responsive page frames
  patterns/    reusable workflow compositions such as filters and empty states
```

## Rules

- Run shadcn commands from `apps/web`.
- Keep `components/ui` close to upstream shadcn. Do not put product logic there.
- Use semantic tokens from `app/globals.css`; do not hardcode brand colors in components.
- Use Convert-specific wrappers in `components/convert` when the product needs a named pattern.
- Components may import `@/components/ui/*`, `@/lib/*`, `@/hooks/*`, and `@convert/contracts`.
- Components must not import `@convert/core`, `@convert/application`, `@convert/infra`, database clients, provider SDKs, or API credentials.
