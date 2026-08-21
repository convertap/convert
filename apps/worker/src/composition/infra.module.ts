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


/**
 * The connection string a runtime is allowed to use: `DATABASE_URL_APP`, never
 * `DATABASE_URL`.
 *
 * ADR 0042 splits the two roles because row-level security does not apply to a table's
 * owner. A runtime holding the owner's credential therefore makes every tenant policy
 * advisory while every check still reports green - which is the exact failure the ADR was
 * written to remove, so this refuses to boot rather than falling back.
 *
 * Exported, and taking the environment as an argument, so the refusal is testable. An
 * inline factory inside the module metadata is not.
 */
export const applicationDatabaseUrl = (env: NodeJS.ProcessEnv): string => {
  const url = env.DATABASE_URL_APP;
  if (url) return url;

  const ownerIsSet = Boolean(env.DATABASE_URL);
  throw new Error(
    ownerIsSet
      ? 'DATABASE_URL_APP is not set, and DATABASE_URL is. The application connects as convert_app and never as the owner, so this does not fall back (ADR 0042).'
      : 'DATABASE_URL_APP is not set. The application connects as convert_app, which row-level security applies to (ADR 0042).',
  );
};

@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: LOGGER, useValue: logger },
    {
      provide: DATABASE,
      useFactory: () => {
        return createDatabase(applicationDatabaseUrl(process.env));
      },
    },
    { provide: MESSAGE_SENDER, useFactory: () => createWhatsAppSender() },
  ],
  exports: [CLOCK, DATABASE, MESSAGE_SENDER, LOGGER],
})
export class InfraModule {}
