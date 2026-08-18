import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { logger } from '@convert/infra';
import { WorkerModule } from './worker.module';
import { JOBS } from './jobs/job-names';

/**
 * A NestJS standalone application context: no HTTP server, the same modules as the API.
 *
 * Handlers land here as the features do. The queue is Postgres-backed (ADR 0010) so this
 * process needs no broker, and its shutdown is deliberate: a job interrupted mid-send
 * must be safe to retry, which is why every handler carries a dedupe key.
 */
const bootstrap = async () => {
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: false });

  logger.info({ jobs: Object.values(JOBS) }, 'worker started; no handlers registered yet');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker shutting down');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
};

void bootstrap();
