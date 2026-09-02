import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ScenarioService } from '../src/services/scenario.service.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const mediaDir = path.resolve(testDir, '../../web/public/media');

describe('ScenarioService', () => {
  const service = new ScenarioService();

  it('owns six unique scenarios with one unique UTC context each', () => {
    const catalog = service.catalog();
    const ids = catalog.scenarios.map((scenario) => scenario.id);
    const contexts = catalog.scenarios.map(
      (scenario) => `${scenario.channel}|${scenario.from}|${scenario.to}`,
    );

    expect(catalog.defaultScenarioId).toBe('primary');
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(contexts).size).toBe(contexts.length);
    expect(ids).toEqual([
      'primary',
      'negative-control',
      'small-sample-guard',
      'latency-confounder-isolation',
      'stb-error-confounder',
      'black-screen-timeout',
    ]);
  });

  it('keeps media authorization fields out of the public catalog', () => {
    for (const scenario of service.catalog().scenarios) {
      expect(scenario).not.toHaveProperty('videoFile');
      expect(scenario).not.toHaveProperty('agentSampleTimestampSeconds');
    }
  });

  it('maps every scenario to existing bounded synthetic media', () => {
    for (const scenario of service.list()) {
      expect(scenario.from.endsWith('Z')).toBe(true);
      expect(scenario.to.endsWith('Z')).toBe(true);
      expect(Date.parse(scenario.from)).toBeLessThan(Date.parse(scenario.to));
      expect(fs.existsSync(path.join(mediaDir, scenario.videoFile))).toBe(true);
      expect(fs.existsSync(path.join(mediaDir, path.basename(scenario.poster)))).toBe(true);
      expect(scenario.samples).toHaveLength(4);

      for (const sample of scenario.samples) {
        expect(sample.time).toBeGreaterThanOrEqual(0);
        expect(sample.time).toBeLessThan(scenario.durationSeconds);
        expect(fs.existsSync(path.join(mediaDir, path.basename(sample.image)))).toBe(true);
      }

      if (scenario.visionMode === 'required') {
        expect(scenario.agentSampleTimestampSeconds).not.toBeNull();
        expect(scenario.agentSampleTimestampSeconds!).toBeLessThan(scenario.durationSeconds);
      } else {
        expect(scenario.agentSampleTimestampSeconds).toBeNull();
      }
    }
  });

  it('resolves manual Vision media server-side and rejects unsafe requests', () => {
    expect(service.resolveVisionRequest('primary', 12.5)).toEqual({
      videoFile: 'test_stream_slate.mp4',
      timestamp: 12.5,
    });
    expect(service.resolveVisionRequest('black-screen-timeout', 12.5)).toEqual({
      videoFile: 'test_stream_black_screen.mp4',
      timestamp: 12.5,
    });
    expect(() => service.resolveVisionRequest('negative-control', 12.5)).toThrow(
      'Vision is disabled',
    );
    expect(() => service.resolveVisionRequest('primary', 35)).toThrow('less than 35 seconds');
    expect(() => service.resolveVisionRequest('unknown', 1)).toThrow(
      'Unknown investigation scenario',
    );
  });

  it('resolves each exact investigation context back to one scenario', () => {
    for (const scenario of service.list()) {
      expect(service.findByContext(scenario)?.id).toBe(scenario.id);
    }
    expect(
      service.findByContext({
        channel: 'ch-01',
        from: '2026-08-16T10:00:00.001Z',
        to: '2026-08-16T12:00:00.000Z',
      }),
    ).toBeUndefined();
  });
});
