import type { Ulid } from '@convert/contracts';
import type { E164 } from '../shared/phone';
import type { MessageChannel, MessageStatus, TemplateCategory } from './message';

/**
 * Ports, not vendors (ADR 0005). The domain asks to send template X to contact Y on
 * channel Z; it never learns whether that is Meta Cloud API, a BSP, or the logging
 * adapter. This is what keeps checklist item E3 a reversible decision.
 */

export interface SendTemplateCommand {
  readonly to: E164;
  readonly channel: MessageChannel;
  readonly templateName: string;
  readonly variables: Readonly<Record<string, string>>;
  /** Deduplication key. Providers retry and workers restart (invariant: no double send). */
  readonly idempotencyKey: string;
}

export interface SendFreeFormCommand {
  readonly to: E164;
  readonly channel: MessageChannel;
  readonly body: string;
  readonly idempotencyKey: string;
}

export interface SendResult {
  readonly providerMessageId: string;
  readonly status: MessageStatus;
  /** Provider-reported cost in the smallest unit, when the provider reports one. */
  readonly costMinorUnits?: number;
}

export interface MessageSender {
  sendTemplate(command: SendTemplateCommand): Promise<SendResult>;
  sendFreeForm(command: SendFreeFormCommand): Promise<SendResult>;
}

export interface TemplateDefinition {
  readonly name: string;
  readonly category: TemplateCategory;
  readonly channel: MessageChannel;
  readonly variables: readonly string[];
  readonly approved: boolean;
}

export interface TemplateCatalog {
  find(name: string): Promise<TemplateDefinition | null>;
}

/**
 * Consent is checked in the send path, not in the UI - the API and the worker both
 * bypass the UI (invariant I9, ADR 0008).
 */
export interface ConsentGate {
  hasMarketingConsent(workspaceId: Ulid, contactId: Ulid, channel: MessageChannel): Promise<boolean>;
}
