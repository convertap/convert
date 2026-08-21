import {
  CLOSED_SET_SCHEMAS,
  CLOSED_SETS,
  invoiceStateSchema,
  LEAD_SOURCES,
  LEAD_STATUSES,
  leadStatusSchema,
  MESSAGE_STATUSES,
} from './enums';

describe('closed sets', () => {
  test('every set has values, and none repeats', () => {
    for (const [name, values] of Object.entries(CLOSED_SETS)) {
      expect(values.length, `${name} is empty`).toBeGreaterThan(0);
      expect(new Set(values).size, `${name} repeats a value`).toBe(values.length);
    }
  });

  test('every value is lower snake case, because it becomes a Postgres enum label', () => {
    for (const [name, values] of Object.entries(CLOSED_SETS)) {
      for (const value of values) {
        expect(value, `${name}.${value}`).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  test('lead status is in funnel order, not alphabetical', () => {
    // The whole reason for a native enum: `order by status` follows the funnel. If these
    // were sorted alphabetically the ordering would be Contacted, Converted, Lost, New,
    // Qualified, which is meaningless in a pipeline view.
    expect(LEAD_STATUSES).toEqual(['new', 'contacted', 'qualified', 'converted', 'lost']);
    expect([...LEAD_STATUSES]).not.toEqual([...LEAD_STATUSES].sort());
  });

  test('message status is in progression order, with the outcome last', () => {
    expect(MESSAGE_STATUSES).toEqual(['queued', 'sent', 'delivered', 'read', 'failed']);
  });

  test('lead sources match the channel design tokens one for one', () => {
    // A source with no `channel-*` token is a source the pipeline cannot render. Keeping
    // these aligned is what stops the schema and the design system inventing separate
    // vocabularies for the same thing.
    expect([...LEAD_SOURCES].sort()).toEqual([
      'facebook',
      'instagram',
      'offline',
      'phone',
      'web',
      'whatsapp',
    ]);
  });

  test('deal stage is deliberately absent', () => {
    // Deal stage is a `pipeline_stage` row, not a value, because architecture.md models
    // pipelines as tables so multiple pipelines arrive without rewriting deal queries.
    // If someone adds it here, that decision has been reversed by accident.
    expect(Object.keys(CLOSED_SETS)).not.toContain('deal_stage');
  });
});

describe('closed sets validate at runtime', () => {
  test('every schema accepts each of its own values', () => {
    for (const [name, schema] of Object.entries(CLOSED_SET_SCHEMAS)) {
      for (const value of CLOSED_SETS[name as keyof typeof CLOSED_SETS]) {
        expect(schema.safeParse(value).success, `${name} rejected its own ${value}`).toBe(true);
      }
    }
  });

  test('every schema rejects a value it does not define', () => {
    // The point of the whole exercise: a bad value is refused at the boundary rather than
    // reaching the database and being refused there, or worse, being stored.
    for (const [name, schema] of Object.entries(CLOSED_SET_SCHEMAS)) {
      expect(schema.safeParse('definitely_not_a_member').success, `${name} accepted junk`).toBe(
        false,
      );
      expect(schema.safeParse('').success, `${name} accepted an empty string`).toBe(false);
    }
  });

  test('a schema rejects a value belonging to a different set', () => {
    // 'whatsapp' is a lead source and a consent channel, but never a lead status.
    expect(leadStatusSchema.safeParse('whatsapp').success).toBe(false);
    expect(invoiceStateSchema.safeParse('new').success).toBe(false);
  });
});
