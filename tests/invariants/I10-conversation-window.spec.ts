/**
 * Invariant I10 - docs/architecture.md section 6
 *
 * A free-form WhatsApp message requires an open conversation window; otherwise only a template may be sent (§10.3)
 *
 * Decision record: ADR 0007.
 *
 * How to test it: With last_inbound_at older than 24h, a free-form send must be refused before the provider adapter is called.
 *
 * This file exists so CI gate G6 stays green while the feature is unbuilt.
 * Replace the todo with a real assertion when the behaviour lands; do not
 * delete the file - removing an invariant requires an ADR.
 */

describe('I10 - conversation-window', () => {
  test.todo('a free-form WhatsApp message requires an open conversation window; otherwise only a template may be sent (§10.3)');
});
