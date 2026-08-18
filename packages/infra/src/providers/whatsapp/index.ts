import type { MessageSender } from '@convert/core';
import { LoggingMessageSender } from './log-adapter';

/**
 * Provider selection. One switch, one place (ADR 0005).
 *
 * Adding Meta Cloud API or a BSP means adding a case here and a file beside this one.
 * Nothing in core, application, api, or web changes - which is what makes checklist item
 * E3 a reversible decision rather than a commitment.
 */
export type WhatsAppProviderName = 'log' | 'cloud_api' | 'bsp';

export const createWhatsAppSender = (
  provider: string = process.env.WHATSAPP_PROVIDER ?? 'log',
): MessageSender => {
  switch (provider) {
    case 'log':
      return new LoggingMessageSender();
    case 'cloud_api':
    case 'bsp':
      throw new Error(
        `WhatsApp provider "${provider}" is not implemented yet - see checklist E0/E3 and run the spike first`,
      );
    default:
      throw new Error(`unknown WHATSAPP_PROVIDER: ${provider}`);
  }
};

export { LoggingMessageSender };
