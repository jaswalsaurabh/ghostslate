import { describe, it, expect } from 'vitest';
import { HealthService } from '../src/services/health.service.js';

describe('HealthService', () => {
  it('returns ok status and server identity', () => {
    const service = new HealthService();
    const health = service.getHealth();

    expect(health.status).toBe('ok');
    expect(health.service).toBe('ghostslate-server');
    expect(typeof health.timestamp).toBe('string');
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
