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
  // Building the module graph runs InfraModule's factory, which demands the application
  // role's connection string (ADR 0042). Nothing connects here - the document is built
  // from decorators - so a placeholder is enough, and it has to be DATABASE_URL_APP
  // rather than DATABASE_URL or the graph refuses to construct. Seeding the owner's
  // variable instead is what broke CI on 21 August when the runtimes were corrected.
  process.env.DATABASE_URL_APP ??= 'postgres://unused:unused@localhost:5432/unused';

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
