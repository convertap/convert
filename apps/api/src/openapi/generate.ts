import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { buildOpenApiDocument } from './document';

/**
 * Gate G10. Regenerates apps/api/openapi.json; CI fails if the result differs from what
 * is committed. An API change therefore shows up as a reviewable diff rather than as a
 * surprise for the web app or, later, a paying integrator.
 */
const main = async () => {
  process.env.DATABASE_URL ??= 'postgres://unused:unused@localhost:5432/unused';

  const app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false });
  await app.init();

  const document = buildOpenApiDocument(app);
  const target = join(__dirname, '..', '..', 'openapi.json');
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  await app.close();
  console.warn(`openapi.json written (${Object.keys(document.paths).length} path(s))`);
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
