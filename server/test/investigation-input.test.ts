import { describe, expect, it } from 'vitest';
import { InvestigateSpikeSchema } from '../src/controllers/investigation.controller.js';

describe('InvestigateSpikeSchema validation', () => {
  it('normalizes valid channel and ISO UTC timestamps', () => {
    const parsed = InvestigateSpikeSchema.parse({
      prompt: 'Check anomaly',
      channel: '  CH-01  ',
      from: '2026-08-14T19:00:00.000Z',
      to: '2026-08-14T23:00:00.000Z',
    });
    expect(parsed.channel).toBe('ch-01');
    expect(parsed.from).toBe('2026-08-14T19:00:00.000Z');
    expect(parsed.to).toBe('2026-08-14T23:00:00.000Z');
  });

  it('rejects channel with SQL injection or special characters', () => {
    expect(() =>
      InvestigateSpikeSchema.parse({
        prompt: 'Check anomaly',
        channel: "ch-01'; DROP TABLE ssai_stitch_attempts; --",
      }),
    ).toThrow();
  });

  it('rejects timestamps without UTC Z suffix or invalid date syntax', () => {
    expect(() =>
      InvestigateSpikeSchema.parse({
        prompt: 'Check anomaly',
        from: '2026-08-14 19:00:00',
      }),
    ).toThrow();
  });

  it('rejects from >= to', () => {
    expect(() =>
      InvestigateSpikeSchema.parse({
        prompt: 'Check anomaly',
        from: '2026-08-14T23:00:00.000Z',
        to: '2026-08-14T19:00:00.000Z',
      }),
    ).toThrow();
  });

  it('bounds unauthenticated investigation cost and scope', () => {
    expect(() => InvestigateSpikeSchema.parse({ prompt: 'x'.repeat(2_001) })).toThrow(
      'Prompt is too long',
    );

    expect(() =>
      InvestigateSpikeSchema.parse({ channel: 'ch-02', prompt: 'Check anomaly' }),
    ).toThrow('Only the configured channel ch-01 may be investigated');

    expect(() =>
      InvestigateSpikeSchema.parse({
        prompt: 'Check anomaly',
        from: '2026-08-14T00:00:00.000Z',
        to: '2026-08-15T00:00:00.001Z',
      }),
    ).toThrow('Investigation window cannot exceed 24 hours');
  });
});
