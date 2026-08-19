import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ErrorFilter } from './interface/http/error.filter';
import { buildOpenApiDocument } from './openapi/document';

const bootstrap = async () => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  // Errors are first class: one filter, one envelope, one place the mapping lives (ADR 0018).
  app.useGlobalFilters(new ErrorFilter());

  // The web app is a separate origin (ADR 0001) but calls the API server-side, so the
  // browser never talks to it directly (ADR 0013). CORS stays closed by default.
  const origin = process.env.WEB_ORIGIN;
  if (origin && process.env.NODE_ENV !== 'production') {
    app.enableCors({ origin, credentials: true });
  }

  // Swagger UI: always on locally and in staging, behind authentication in production
  // until the Pro-tier public API launches. An open /docs on a production API is free
  // reconnaissance (ADR 0015).
  if (process.env.NODE_ENV !== 'production' || process.env.EXPOSE_DOCS === 'true') {
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Hosts assign the port and expect the process to use it: Railway, Fly and Render all
  // inject PORT, and binding anything else means the platform routes to a closed socket
  // while the process reports itself healthy. API_PORT stays the local knob (ADR 0022).
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  await app.listen({ port, host: '0.0.0.0' });
  console.warn(`api listening on ${port} (docs at /docs)`);
};

void bootstrap();
