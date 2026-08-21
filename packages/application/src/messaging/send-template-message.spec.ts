import { asUlid } from '@convert/contracts';
import {
  type ActivityRepository,
  type ConsentGate,
  type ContactRepository,
  type E164,
  type MessageSender,
  type OutboxRepository,
  type TemplateCatalog,
  type UserPrincipal,
  fixedClock,
} from '@convert/core';
import { UseCaseError } from '../errors';
import { type SendTemplateMessageDeps, sendTemplateMessage } from './send-template-message';

const ORG = asUlid('01JBQZ3K7X8V9WQ0R1S2T3V4W5');
const CONTACT = asUlid('01JBQZ3K7X8V9WQ0R1S2T3V4W6');

const owner: UserPrincipal = { kind: 'user', workspaceId: ORG, userId: CONTACT, role: 'owner' };
const now = new Date('2026-08-18T12:00:00.000Z');

const build = (overrides: Partial<SendTemplateMessageDeps> = {}) => {
  const appended: unknown[] = [];
  const published: unknown[] = [];
  const sent: unknown[] = [];

  const deps: SendTemplateMessageDeps = {
    contacts: {
      findById: async () => ({
        id: CONTACT,
        workspaceId: ORG,
        phoneE164: '+233241234567' as E164,
        displayName: 'Ama Boateng',
        lastInboundAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      }),
      findByPhone: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    } as ContactRepository,
    activities: { append: async (_org, a) => void appended.push(a) } as ActivityRepository,
    outbox: { publish: async (_org, type, p) => void published.push([type, p]) } as OutboxRepository,
    templates: {
      find: async () => ({
        name: 'follow_up_v1',
        category: 'marketing' as const,
        channel: 'whatsapp' as const,
        variables: ['first_name'],
        approved: true,
      }),
    } as TemplateCatalog,
    consent: { hasMarketingConsent: async () => true } as ConsentGate,
    sender: {
      sendTemplate: async (c) => {
        sent.push(c);
        return { providerMessageId: 'prov-1', status: 'sent' as const };
      },
      sendFreeForm: async () => ({ providerMessageId: 'prov-2', status: 'sent' as const }),
    } as MessageSender,
    clock: fixedClock(now),
    ...overrides,
  };

  return { deps, appended, published, sent };
};

const input = {
  contactId: CONTACT,
  channel: 'whatsapp' as const,
  templateName: 'follow_up_v1',
  variables: { first_name: 'Ama' },
  idempotencyKey: 'key-1',
};

describe('sendTemplateMessage', () => {
  it('sends, logs an activity, and publishes an outbox event', async () => {
    const { deps, appended, published, sent } = build();

    const result = await sendTemplateMessage(owner, input, deps);

    expect(result.providerMessageId).toBe('prov-1');
    expect(sent).toHaveLength(1);
    expect(appended).toHaveLength(1);
    expect(published[0]).toMatchObject(['message.sent', { contactId: CONTACT }]);
  });

  it('refuses a marketing send with no consent, before calling the provider', async () => {
    const { deps, sent } = build({
      consent: { hasMarketingConsent: async () => false } as ConsentGate,
    });

    await expect(sendTemplateMessage(owner, input, deps)).rejects.toThrow(UseCaseError);
    expect(sent).toHaveLength(0);
  });

  it('refuses an unapproved template', async () => {
    const { deps } = build({
      templates: {
        find: async () => ({
          name: 'follow_up_v1',
          category: 'utility' as const,
          channel: 'whatsapp' as const,
          variables: [],
          approved: false,
        }),
      } as TemplateCatalog,
    });

    await expect(sendTemplateMessage(owner, input, deps)).rejects.toThrow(/not approved/);
  });

  it('refuses a send with missing template variables', async () => {
    const { deps, sent } = build();

    await expect(
      sendTemplateMessage(owner, { ...input, variables: {} }, deps),
    ).rejects.toThrow(/missing template variables/);
    expect(sent).toHaveLength(0);
  });

  it('refuses an API client without the messages:write scope', async () => {
    const { deps, sent } = build();

    await expect(
      sendTemplateMessage(
        { kind: 'client', workspaceId: ORG, clientId: CONTACT, scopes: ['contacts:read'] },
        input,
        deps,
      ),
    ).rejects.toThrow(/not permitted/);
    expect(sent).toHaveLength(0);
  });

  it('allows a template send even when the conversation window is closed', async () => {
    const { deps, sent } = build({
      contacts: {
        findById: async () => ({
          id: CONTACT,
          workspaceId: ORG,
          phoneE164: '+233241234567' as E164,
          displayName: 'Ama Boateng',
          lastInboundAt: null,
        }),
        findByPhone: async () => null,
        list: async () => ({ items: [], nextCursor: null }),
      } as ContactRepository,
    });

    await sendTemplateMessage(owner, input, deps);
    expect(sent).toHaveLength(1);
  });
});
