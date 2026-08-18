import type { CursorPage, PageRequest, Ulid } from '@convert/contracts';
import type { NewActivity } from '../activities/activity';
import type { E164 } from '../shared/phone';

/**
 * Repository ports. Implementations live in packages/infra and are wired only in a
 * composition root, so the domain never learns that Drizzle exists (ADR 0017).
 *
 * Deliberately thin: only what the reference use case needs. The full set arrives once
 * the R1-R9 product decisions are made - writing repositories against undecided rules is
 * how a wrong schema becomes permanent.
 */

export interface ContactRecord {
  readonly id: Ulid;
  readonly orgId: Ulid;
  readonly phoneE164: E164;
  readonly displayName: string;
  /** Drives the derived WhatsApp conversation window (ADR 0007). */
  readonly lastInboundAt: Date | null;
}

export interface ContactRepository {
  findById(orgId: Ulid, contactId: Ulid): Promise<ContactRecord | null>;
  findByPhone(orgId: Ulid, phone: E164): Promise<ContactRecord | null>;
  list(orgId: Ulid, page: PageRequest): Promise<CursorPage<ContactRecord>>;
}

export interface ActivityRepository {
  /** Append only. There is no update and no delete, at any layer (I6). */
  append(orgId: Ulid, activity: NewActivity): Promise<void>;
}

export interface OutboxRepository {
  /** Domain facts, consumed by notifications now and integration webhooks later (ADR 0011). */
  publish(orgId: Ulid, eventType: string, payload: Readonly<Record<string, unknown>>): Promise<void>;
}
