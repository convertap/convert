import { healthResponseSchema, readinessResponseSchema } from '@convert/contracts';
import { createZodDto } from 'nestjs-zod';

/**
 * Every DTO carries an example (ADR 0015). A spec with types but no examples is half a
 * document, and gate G10 fails an endpoint with no typed response.
 *
 * The classes contain no fields by design. Runtime validation, TypeScript output and
 * OpenAPI all derive from the shared Zod schemas, so this adapter cannot drift from them.
 */
export class HealthResponseDto extends createZodDto(healthResponseSchema) {}

export class ReadinessResponseDto extends createZodDto(readinessResponseSchema) {}
