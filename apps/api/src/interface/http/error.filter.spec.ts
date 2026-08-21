import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@convert/contracts';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';
import { ErrorFilter } from './error.filter';

interface Classification {
  readonly code: string;
  readonly status: number;
  readonly details?: readonly { field: string; message: string }[];
}

const classify = (exception: unknown): Classification => {
  const filter = new ErrorFilter() as unknown as {
    classify(value: unknown): Classification;
  };
  return filter.classify(exception);
};

describe('ErrorFilter Zod mapping', () => {
  it('maps validation issues to named field details', () => {
    const parsed = healthResponseSchema.safeParse({ status: 'bad', time: 'today' });
    if (parsed.success) throw new Error('invalid fixture unexpectedly parsed');

    const result = classify(new ZodValidationException(parsed.error));

    expect(result.status).toBe(400);
    expect(result.code).toBe('validation_failed');
    expect(result.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'status' }),
        expect.objectContaining({ field: 'time' }),
        expect.objectContaining({ field: 'version' }),
      ]),
    );
  });

  it('treats response-schema failures as internal defects', () => {
    const parsed = healthResponseSchema.safeParse({});
    if (parsed.success) throw new Error('invalid fixture unexpectedly parsed');

    expect(classify(new ZodSerializationException(parsed.error))).toMatchObject({
      code: 'internal_error',
      status: 500,
    });
  });
});
