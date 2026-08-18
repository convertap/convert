import type { MessageSender, SendFreeFormCommand, SendResult, SendTemplateCommand } from '@convert/core';
import { logger, maskPhone } from '../../observability/logger';

/**
 * The default MessageSender until checklist E0/E3 chooses a provider.
 *
 * It records what would have been sent and delivers nothing. That is the point: with no
 * credentials configured, no real message can leave a developer machine by accident, and
 * the rest of the system can be built and tested against the port today.
 *
 * A real adapter goes beside this file and is selected in a composition root. Nothing
 * else in the codebase changes when it does (ADR 0005).
 */
export class LoggingMessageSender implements MessageSender {
  async sendTemplate(command: SendTemplateCommand): Promise<SendResult> {
    logger.info(
      {
        channel: command.channel,
        template: command.templateName,
        to: maskPhone(command.to),
        idempotencyKey: command.idempotencyKey,
      },
      'logging adapter: template send (nothing was delivered)',
    );
    return { providerMessageId: `log-${command.idempotencyKey}`, status: 'sent' };
  }

  async sendFreeForm(command: SendFreeFormCommand): Promise<SendResult> {
    logger.info(
      {
        channel: command.channel,
        to: maskPhone(command.to),
        idempotencyKey: command.idempotencyKey,
      },
      'logging adapter: free-form send (nothing was delivered)',
    );
    return { providerMessageId: `log-${command.idempotencyKey}`, status: 'sent' };
  }
}
