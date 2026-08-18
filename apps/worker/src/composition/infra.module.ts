import { Global, Module } from '@nestjs/common';
import type { Clock } from '@convert/core';
import { createDatabase, createWhatsAppSender, logger } from '@convert/infra';

/**
 * The worker's composition root, and the only place here that may import @convert/infra.
 *
 * The worker shares use cases with the API through @convert/application, so a reminder
 * sent by a scheduled job runs the same code path - and the same authorization and consent
 * checks - as one triggered by a rep.
 */
export const CLOCK = Symbol('Clock');
export const DATABASE = Symbol('Database');
export const MESSAGE_SENDER = Symbol('MessageSender');
export const LOGGER = Symbol('Logger');

const systemClock: Clock = { now: () => new Date() };

@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: LOGGER, useValue: logger },
    {
      provide: DATABASE,
      useFactory: () => {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error('DATABASE_URL is not set');
        return createDatabase(url);
      },
    },
    { provide: MESSAGE_SENDER, useFactory: () => createWhatsAppSender() },
  ],
  exports: [CLOCK, DATABASE, MESSAGE_SENDER, LOGGER],
})
export class InfraModule {}
