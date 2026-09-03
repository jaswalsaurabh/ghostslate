import { describe, expect, it } from 'vitest';
import { InvestigateSpikeSchema } from '../src/controllers/investigation.controller.js';
import { ScenarioService } from '../src/services/scenario.service.js';

describe('investigation input validation', () => {
  const scenarios = new ScenarioService();

  it('accepts only a scenario ID and bounded prompt', () => {
    const parsed = InvestigateSpikeSchema.parse({
      scenarioId: 'primary',
      prompt: '  Check anomaly  ',
    });
    expect(parsed).toEqual({ scenarioId: 'primary', prompt: 'Check anomaly' });
  });

  it('rejects browser-provided channel and time-window overrides', () => {
    expect(() =>
      InvestigateSpikeSchema.parse({
        scenarioId: 'primary',
        prompt: 'Check anomaly',
        channel: 'ch-02',
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-02T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('bounds prompt cost and delegates scenario authority to the registry', () => {
    expect(() =>
      InvestigateSpikeSchema.parse({ scenarioId: 'primary', prompt: 'x'.repeat(2_001) }),
    ).toThrow('Prompt is too long');
    expect(() => scenarios.require('unknown-scenario')).toThrow('Unknown investigation scenario');

    expect(scenarios.require('black-screen-timeout')).toMatchObject({
      channel: 'ch-01',
      from: '2026-08-16T10:00:00.000Z',
      to: '2026-08-16T12:00:00.000Z',
    });
  });
});
