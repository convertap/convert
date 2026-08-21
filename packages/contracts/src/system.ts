import { z } from 'zod';

const probeResponseFields = {
  time: z.iso.datetime().meta({ example: '2026-08-18T12:00:00.000Z' }),
  version: z.string().meta({ example: '0.0.0' }),
};

export const healthResponseSchema = z
  .object({
    status: z.literal('ok').meta({ example: 'ok' }),
    ...probeResponseFields,
  })
  .meta({ id: 'HealthResponse' });

export const readinessResponseSchema = z
  .object({
    status: z.literal('ready').meta({ example: 'ready' }),
    ...probeResponseFields,
  })
  .meta({ id: 'ReadinessResponse' });

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
