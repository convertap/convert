/**
 * Injection tokens for the ports defined in @convert/core.
 *
 * They live here, in the composition layer, because the domain must not know that a DI
 * container exists. A port is an interface; this is the only place an interface gets
 * bound to an implementation (ADR 0005).
 */
export const CLOCK = Symbol('Clock');
export const DATABASE = Symbol('Database');
export const MESSAGE_SENDER = Symbol('MessageSender');
export const CONTACT_REPOSITORY = Symbol('ContactRepository');
export const ACTIVITY_REPOSITORY = Symbol('ActivityRepository');
export const OUTBOX_REPOSITORY = Symbol('OutboxRepository');
export const TEMPLATE_CATALOG = Symbol('TemplateCatalog');
export const CONSENT_GATE = Symbol('ConsentGate');
