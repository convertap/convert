/**
 * Deal pipeline stages. Stages are DATA, not an enum, in the database (architecture.md
 * section 19) - one default pipeline per workspace for the MVP, so a second pipeline
 * later is a configuration change rather than a migration.
 *
 * The values below are the seed for that default pipeline.
 */
export const DEFAULT_PIPELINE_STAGES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
] as const;

export const DEAL_OUTCOMES = ['won', 'lost'] as const;
export type DealOutcome = (typeof DEAL_OUTCOMES)[number];

/** Invariant I5: outcomes are terminal. Reopening creates a new deal, preserving history. */
export const isClosed = (outcome: DealOutcome | null): boolean => outcome !== null;

export const canMoveStage = (outcome: DealOutcome | null): boolean => !isClosed(outcome);

export const canMarkWon = (outcome: DealOutcome | null): boolean => outcome === null;

export const canMarkLost = (outcome: DealOutcome | null, reason: string | undefined): boolean =>
  outcome === null && Boolean(reason?.trim());
