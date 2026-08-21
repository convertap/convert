import { describe, expect, it } from 'vitest';
import type { DatabaseReadiness } from '../../composition/infra.module';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('keeps liveness independent of external services', () => {
    const readiness: DatabaseReadiness = { check: async () => Promise.reject(new Error('down')) };
    expect(new HealthController(readiness).get().status).toBe('ok');
  });

  it('reports ready only after the database query succeeds', async () => {
    let checked = false;
    const readiness: DatabaseReadiness = {
      check: async () => {
        checked = true;
      },
    };

    const response = await new HealthController(readiness).ready();

    expect(checked).toBe(true);
    expect(response.status).toBe('ready');
  });

  it('propagates a failed database query to the error boundary', async () => {
    const failure = new Error('database unavailable');
    const readiness: DatabaseReadiness = { check: async () => Promise.reject(failure) };

    await expect(new HealthController(readiness).ready()).rejects.toBe(failure);
  });
});
