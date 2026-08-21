/**
 * Invariant I04 - docs/architecture.md section 6
 *
 * lead.status = Converted requires at least one linked deal. lost_reason is optional. Lost is terminal: a returning customer produces a new lead (ADR 0031)
 *
 * How to test it: Set a lead to Converted with no deal (must fail) and with one deal (must succeed); set Lost with no reason (must succeed); transition away from Lost (must fail).
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I04 - lead-terminal-status', () => {
  test.todo('lead.status = Converted requires at least one linked deal. lost_reason is optional. Lost is terminal: a returning customer produces a new lead (ADR 0031)');
});
