import { describe, expect, it } from 'vitest';
import {
  createEvidenceExportBundle,
  renderEvidenceMarkdown,
  serializeEvidenceExport,
  type EvidenceExportInput,
} from '../src/utils/evidence-export.js';

const scenario = {
  id: 'small-sample-guard',
  label: 'Insufficient evidence',
  prompt: 'Investigate this window and remain silent below the minimum sample size.',
  channel: 'ch-01',
  from: '2026-08-14T19:00:00.000Z',
  to: '2026-08-14T19:15:00.000Z',
};

function input(overrides: Partial<EvidenceExportInput> = {}): EvidenceExportInput {
  return {
    scenario,
    runKey: 'run-small-sample-123456',
    executionMode: 'live',
    trace: [
      {
        type: 'tool_call',
        timestamp: '2026-08-14T19:15:01.000Z',
        data: {
          name: 'collect_diagnosis_evidence',
          args: { sql: 'SELECT 1', apiToken: 'do-not-export' },
        },
      },
      {
        type: 'frame_classified',
        timestamp: '2026-08-14T19:15:02.000Z',
        data: {
          classification: 'slate',
          confidence: 0.99,
          slate_type: 'looping_card',
          text_detected: '',
          visual_summary: 'test frame',
          contentHash: 'abc',
          cached: false,
          frameBase64: 'very-large-payload',
          frameMetadata: { authorization: 'hidden' },
        },
      },
      {
        type: 'diagnosis',
        timestamp: '2026-08-14T19:15:03.000Z',
        data: {
          diagnosis: 'Insufficient evidence.',
          grounding: { grounded: true, violations: [], checkedClaims: 0 },
        },
      },
    ],
    finalDiagnosis: 'Insufficient evidence: no qualifying cohort reached the minimum cue count.',
    grounding: { grounded: true, violations: [], checkedClaims: 0 },
    evidenceSummary: {
      outcome: 'no_incident',
      reason: 'INSUFFICIENT_SAMPLE_SIZE',
      candidate: {
        basis: 'maximum_observed',
        channelId: 'ch-01',
        sspId: 'ssp-a',
        deviceClass: 'tv',
        codec: 'h264',
        daypart: 'prime',
        cues: 8,
        totalAttempts: 8,
        unmonetizedImpressions: 1,
        unmonetizedPct: 12.5,
        p95AuctionMs: 100,
        cpmUsd: null,
      },
      revenueLossUsd: null,
      thresholds: {
        minimumCues: 20,
        incidentFailurePct: 25,
        cohortDispersionPp: 8,
        stitcherDeadlineMs: 4000,
        hardAuctionTimeoutMs: 3500,
      },
      query: { rowsReturned: 1, rowsScanned: 8, durationMs: 12 },
    },
    remediation: { status: 'unavailable', reason: 'INSUFFICIENT_EVIDENCE' },
    metrics: { revenueLoss: '—', authorization: 'must not appear' },
    exportedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('evidence export', () => {
  it('has a stable versioned shape and UTC export time', () => {
    const bundle = createEvidenceExportBundle(input());
    expect(Object.keys(bundle)).toEqual([
      'schemaVersion',
      'exportedAt',
      'run',
      'scenario',
      'investigation',
      'evidence',
      'remediation',
    ]);
    expect(bundle.schemaVersion).toBe('1.0');
    expect(bundle.exportedAt).toBe('2026-08-25T00:00:00.000Z');
  });

  it('omits frame payloads and secret-shaped fields recursively', () => {
    const json = serializeEvidenceExport(input());
    expect(json).not.toContain('very-large-payload');
    expect(json).not.toContain('do-not-export');
    expect(json).not.toContain('hidden');
    expect(json).not.toContain('authorization');
  });

  it('preserves no-loss and no-remediation outcomes for guard scenarios', () => {
    const bundle = createEvidenceExportBundle(input());
    expect(bundle.evidence.summary?.revenueLossUsd).toBeNull();
    expect(bundle.evidence.summary?.reason).toBe('INSUFFICIENT_SAMPLE_SIZE');
    expect(bundle.remediation).toEqual({ status: 'unavailable', reason: 'INSUFFICIENT_EVIDENCE' });
    expect(renderEvidenceMarkdown(input())).toContain('## Remediation');
  });
});
