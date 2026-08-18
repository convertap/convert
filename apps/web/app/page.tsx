/**
 * Placeholder shell. It exists so the performance gate has a page to measure and so the
 * token layer is visible in a browser before any feature is built.
 *
 * Screens arrive after the product-definition session: R3 (can a rep see another rep's
 * leads) decides the shape of every list on the pipeline screen, so building it first
 * would mean building it twice.
 */
const stages = [
  { name: 'New', token: 'bg-stage-new' },
  { name: 'Contacted', token: 'bg-stage-contacted' },
  { name: 'Qualified', token: 'bg-stage-qualified' },
  { name: 'Proposal', token: 'bg-stage-proposal' },
  { name: 'Won', token: 'bg-stage-won' },
  { name: 'Lost', token: 'bg-stage-lost' },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Convert</h1>
        <p className="text-muted-foreground text-sm">From lead to sale, in one place.</p>
      </header>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">Pipeline stage tokens</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {stages.map((stage) => (
            <li
              key={stage.name}
              className="flex min-h-tap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm"
            >
              <span className={`size-2 rounded-full ${stage.token}`} aria-hidden />
              {stage.name}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">WhatsApp conversation window</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="flex min-h-tap items-center gap-2 rounded-md bg-muted px-3 py-2 text-window-open">
            <span className="size-2 rounded-full bg-window-open" aria-hidden />
            Open - free-form reply allowed
          </span>
          <span className="flex min-h-tap items-center gap-2 rounded-md bg-muted px-3 py-2 text-window-closed">
            <span className="size-2 rounded-full bg-window-closed" aria-hidden />
            Closed - approved template only
          </span>
        </div>
      </section>
    </main>
  );
}
