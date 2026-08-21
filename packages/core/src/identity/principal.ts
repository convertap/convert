import type { Ulid } from '@convert/contracts';

/**
 * Who is acting. Every use case takes one (ADR 0003).
 *
 * The reason this exists on day one, before any public API: if endpoints assume an
 * interactive session, adding API clients later touches every route. The worker is a
 * principal too, so "the system sent this reminder" is attributable in the timeline.
 */
export type OrgRole = 'owner' | 'sales_rep';

interface BasePrincipal {
  readonly workspaceId: Ulid;
}

export interface UserPrincipal extends BasePrincipal {
  readonly kind: 'user';
  readonly userId: Ulid;
  readonly role: OrgRole;
}

export interface ClientPrincipal extends BasePrincipal {
  readonly kind: 'client';
  readonly clientId: Ulid;
  readonly scopes: readonly string[];
}

export interface SystemPrincipal extends BasePrincipal {
  readonly kind: 'system';
  /** Which job or process acted, for the activity log. */
  readonly actor: string;
}

export type Principal = UserPrincipal | ClientPrincipal | SystemPrincipal;

export const isOwner = (p: Principal): boolean => p.kind === 'user' && p.role === 'owner';

export const hasScope = (p: Principal, scope: string): boolean =>
  p.kind !== 'client' ? true : p.scopes.includes(scope);

/** Label recorded on activity and audit rows. */
export const principalLabel = (p: Principal): string =>
  p.kind === 'user' ? `user:${p.userId}` : p.kind === 'client' ? `client:${p.clientId}` : `system:${p.actor}`;
