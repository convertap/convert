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
    {
      provide: DATABASE,
      useFactory: () => {
        return createDatabase(applicationDatabaseUrl(process.env));
      },
    },
    { provide: MESSAGE_SENDER, useFactory: () => createWhatsAppSender() },
  ],
  exports: [CLOCK, DATABASE, MESSAGE_SENDER],
})
export class InfraModule {}
