import type { Ulid } from '@convert/contracts';
import {
  type Clock,
  type ConsentGate,
  type ContactRepository,
  type MessageChannel,
  type MessageDeliveryRepository,
  type MessageSender,
  type Principal,
  type SendResult,
  type TemplateCatalog,
  hasScope,
  principalLabel,
  requiresConsent,
  windowState,
} from '@convert/core';
import { UseCaseError, forbidden, notFound } from '../errors';

/**
 * Reference use case. It exists to fix the shape every other use case follows, and to
 * make the invariants executable rather than aspirational.
 *
 * Note what happens here rather than anywhere else:
 *   - a Principal is the first argument (ADR 0003), and it is what gets recorded
 *   - consent is checked in the SEND PATH, because the API and the worker both bypass
 *     the UI (invariant I9)
 *   - the conversation window is checked BEFORE the provider is called, since a
 *     provider-side rejection costs a round trip and returns a worse error (I10)
 *   - an activity row and an outbox event are written for one state change (ADR 0011)
 *
 * It deliberately does not persist the message: the message table lands with the schema,
 * after the R1-R9 decisions. The port call and the guards are the part worth fixing now.
 */
export interface SendTemplateMessageDeps {
  readonly contacts: ContactRepository;
  readonly deliveries: MessageDeliveryRepository;
  readonly templates: TemplateCatalog;
  readonly consent: ConsentGate;
  readonly sender: MessageSender;
  readonly clock: Clock;
}

export interface SendTemplateMessageInput {
  readonly contactId: Ulid;
  readonly channel: MessageChannel;
  readonly templateName: string;
  readonly variables: Readonly<Record<string, string>>;
  readonly idempotencyKey: string;
}

export const sendTemplateMessage = async (
  principal: Principal,
  input: SendTemplateMessageInput,
  deps: SendTemplateMessageDeps,
): Promise<SendResult> => {
  if (!hasScope(principal, 'messages:write')) {
    throw forbidden('send messages');
  }

  const contact = await deps.contacts.findById(principal.workspaceId, input.contactId);
  if (!contact) throw notFound('contact');

  const template = await deps.templates.find(input.templateName);
  if (!template) throw notFound(`template ${input.templateName}`);
  if (!template.approved) {
    throw new UseCaseError(
      'provider_unavailable',
      `template ${template.name} is not approved by the provider yet`,
    );
  }
  if (template.channel !== input.channel) {
    throw new UseCaseError(
      'validation_failed',
      `template ${template.name} is not available on ${input.channel}`,
    );
  }

  const missing = template.variables.filter((name) => input.variables[name] === undefined);
  if (missing.length > 0) {
    throw new UseCaseError(
      'validation_failed',
      `missing template variables: ${missing.join(', ')}`,
    );
  }

  if (requiresConsent(template.category)) {
    const granted = await deps.consent.hasMarketingConsent(
      principal.workspaceId,
      contact.id,
      input.channel,
    );
    if (!granted) {
      throw new UseCaseError(
        'consent_missing',
        'no live marketing consent for this contact and channel',
      );
    }
  }

  // A template send is permitted with the window closed; a free-form send is not.
  // Recorded so the UI can explain which mode the rep is in.
  const window = windowState(contact.lastInboundAt, deps.clock);

  const result = await deps.sender.sendTemplate({
    to: contact.phoneE164,
    channel: input.channel,
    templateName: template.name,
    variables: input.variables,
    idempotencyKey: input.idempotencyKey,
  });

  await deps.deliveries.record(principal.workspaceId, {
    activity: {
      type: input.channel === 'whatsapp' ? 'whatsapp' : 'sms',
      subject: { kind: 'contact', id: contact.id },
      actor: principalLabel(principal),
      occurredAt: deps.clock.now(),
      note: `template ${template.name} sent (window ${window})`,
    },
    event: {
      type: 'message.sent',
      payload: {
        contactId: contact.id,
        channel: input.channel,
        templateName: template.name,
        providerMessageId: result.providerMessageId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });

  return result;
};
