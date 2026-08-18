import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import { ErrorEnvelopeDto, FieldErrorDto } from '../interface/http/error.dto';

/**
 * One definition of the OpenAPI document, used by both the running server and the
 * generator script, so the served spec and the committed file cannot diverge.
 */
export const buildOpenApiDocument = (app: INestApplication) => {
  const config = new DocumentBuilder()
    .setTitle('Convert API')
    .setDescription(
      'Sales and lead management for Ghanaian SMEs. ' +
        'Internal API today; the Pro-tier public API is a versioned subset of these endpoints.',
    )
    .setVersion('1.0.0')
    .addServer('http://localhost:3001', 'local')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', description: 'Org-scoped API key (Pro tier)' },
      'apiKey',
    )
    .addTag('system', 'Health and diagnostics')
    .build();

  // extraModels so the error envelope appears in the spec even before an endpoint
  // declares a failure response. Consumers need the code list to branch on.
  return SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorEnvelopeDto, FieldErrorDto],
  });
};
