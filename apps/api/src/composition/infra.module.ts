import { Global, Module } from '@nestjs/common';
import type { Clock } from '@convert/core';
import { createDatabase, createWhatsAppSender } from '@convert/infra';
import { CLOCK, DATABASE, MESSAGE_SENDER } from './tokens';

/**
 * The composition root. This is the ONLY place in apps/api permitted to import
 * @convert/infra - tools/check_boundaries.py fails the build if an import of it appears
 * anywhere else under src.
 *
 * The point of that restriction: swapping the WhatsApp provider (checklist E3) or the
 * database client touches this directory and nothing else.
 */
const systemClock: Clock = { now: () => new Date() };

@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
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
  exports: [CLOCK, DATABASE, MESSAGE_SENDER],
})
export class InfraModule {}
