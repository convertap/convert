import { errorEnvelopeSchema, fieldErrorSchema } from '@convert/contracts';
import { createZodDto } from 'nestjs-zod';

/**
 * The error envelope, documented once and referenced by every endpoint (ADR 0015).
 * Consumers - the web app today, paying integrators later - need the code list in the
 * spec, because branching on a code is the contract and branching on a message is not.
 */
export class FieldErrorDto extends createZodDto(fieldErrorSchema) {}

export class ErrorEnvelopeDto extends createZodDto(errorEnvelopeSchema) {}
