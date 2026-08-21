import { z } from 'zod';

/**
 * The closed sets whose values are product rules (ADR 0044).
 *
 * These live here, in the one package both web and api may import, because the values are
 * needed in three places at once: the database type is built from them, the domain's union
 * types derive from them, and the browser renders labels for them. One tuple, no drift.
 *
 * **Declaration order is meaningful.** The database enum is created in this order, and a
 * Postgres enum sorts by declaration rather than alphabetically — so `order by status`
 * gives funnel order for free. Reordering these is a schema change, not a tidy-up.
 *
 * The trap, verified against Postgres 16: **casting to text loses the ordering.**
 * `order by status` gives `new, contacted, qualified, converted, lost`, while
 * `order by status::text` gives `contacted, converted, lost, new, qualified`. So sort in
 * the database on the enum column, and never on a serialised copy of it. Sorting in
 * TypeScript means sorting strings, which is alphabetical — use `LEAD_STATUSES.indexOf`.
 *
 * Sets that a *workspace* configures do not belong here. Deal stage is the example: it is a
 * `pipeline_stage` row, not a value, because `architecture.md` §6 models pipelines as
 * tables so multiple pipelines can arrive without rewriting every deal query.
 *
 * Each set is declared once as an `as const` tuple, then a Zod schema and the TypeScript
 * type are derived from it. The tuple stays the source rather than the schema so `infra`
 * can hand the same array to `pgEnum` — one literal, three consumers, no drift possible.
 */

/**
 * Lead status (R8, ADR 0031). Ordered along the funnel. `converted` requires at least one
 * linked deal and `lost` is terminal — a returning customer starts a new lead — but those
 * are transition rules, enforced in the domain layer (I4), not by the type.
 */
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;
export const leadStatusSchema = z.enum(LEAD_STATUSES);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

/**
 * Where a lead came from (`mvp-scope.md` §15). Matches the `channel-*` design tokens
 * one-for-one, deliberately: a source with no token is a source the pipeline cannot render.
 * `offline` covers walk-ins and referrals, which have no API and no click.
 */
export const LEAD_SOURCES = [
  'whatsapp',
  'facebook',
  'instagram',
  'phone',
  'web',
  'offline',
] as const;
export const leadSourceSchema = z.enum(LEAD_SOURCES);
export type LeadSource = z.infer<typeof leadSourceSchema>;

/** Workspace membership (`mvp-scope.md` §5). Visibility beyond this is a per-member grant (ADR 0032), not a role. */
export const MEMBER_ROLES = ['owner', 'sales_rep'] as const;
export const memberRoleSchema = z.enum(MEMBER_ROLES);
export type MemberRole = z.infer<typeof memberRoleSchema>;

/**
 * Invoice lifecycle (ADR 0033). Only two states, and that is the decision: `issued` is
 * terminal, because an issued invoice is immutable and corrections are credit notes. There
 * is no `void` — voiding would be an edit.
 */
export const INVOICE_STATES = ['draft', 'issued'] as const;
export const invoiceStateSchema = z.enum(INVOICE_STATES);
export type InvoiceState = z.infer<typeof invoiceStateSchema>;

/**
 * How a payment was recorded (ADR 0034). Both write to the same table and invoice payment
 * status is derived from the sum, never set — so this is provenance, not state.
 */
export const PAYMENT_ORIGINS = ['manual', 'psp'] as const;
export const paymentOriginSchema = z.enum(PAYMENT_ORIGINS);
export type PaymentOrigin = z.infer<typeof paymentOriginSchema>;

/** Products and services are one entity with a kind flag (ADR 0033). */
export const PRODUCT_KINDS = ['product', 'service'] as const;
export const productKindSchema = z.enum(PRODUCT_KINDS);
export type ProductKind = z.infer<typeof productKindSchema>;

/**
 * The channel a consent record covers (ADR 0008, ADR 0040). Consent is per channel: an
 * inbound WhatsApp message is not permission to send an SMS campaign, and neither is
 * permission to market.
 */
export const CONSENT_CHANNELS = ['whatsapp', 'sms', 'email'] as const;
export const consentChannelSchema = z.enum(CONSENT_CHANNELS);
export type ConsentChannel = z.infer<typeof consentChannelSchema>;

/**
 * Outbound message delivery (ADR 0006), forward-only: a status never moves backwards.
 * Ordered by progression, matching the `status-*` design tokens. `failed` sits last because
 * it is an outcome rather than a step, and ordering by this column is for funnels not
 * failure triage.
 */
export const MESSAGE_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'] as const;
export const messageStatusSchema = z.enum(MESSAGE_STATUSES);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

/**
 * Every set above, so a test can assert the properties that must hold across all of them
 * and a new set cannot quietly skip them.
 */
export const CLOSED_SETS = {
  lead_status: LEAD_STATUSES,
  lead_source: LEAD_SOURCES,
  member_role: MEMBER_ROLES,
  invoice_state: INVOICE_STATES,
  payment_origin: PAYMENT_ORIGINS,
  product_kind: PRODUCT_KINDS,
  consent_channel: CONSENT_CHANNELS,
  message_status: MESSAGE_STATUSES,
} as const satisfies Record<string, readonly [string, ...string[]]>;

/** Every schema, so a boundary can look one up by set name rather than importing eight. */
export const CLOSED_SET_SCHEMAS = {
  lead_status: leadStatusSchema,
  lead_source: leadSourceSchema,
  member_role: memberRoleSchema,
  invoice_state: invoiceStateSchema,
  payment_origin: paymentOriginSchema,
  product_kind: productKindSchema,
  consent_channel: consentChannelSchema,
  message_status: messageStatusSchema,
} as const;
