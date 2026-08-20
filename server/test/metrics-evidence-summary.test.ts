import { describe, expect, it } from 'vitest';
import { MetricsService, type DiagnosisRow } from '../src/services/metrics.service.js';

const primaryRows: DiagnosisRow[] = [
  {
    channelId: 'ch-01',
    sspId: 'ssp-beta',
    deviceClass: 'connected_tv',
    codec: 'hevc',
    daypart: 'primetime',
    cues: 80,
    totalAttempts: 60_862,
    unmonetizedImpressions: 59_482,
    unmonetizedPct: 97.73,
    p95AuctionMs: 1812.633,
    cpmUsd: 32.5,
  },
  {
    channelId: 'ch-01',
    sspId: 'ssp-alpha',
    deviceClass: 'connected_tv',
    codec: 'hevc',
    daypart: 'primetime',
    cues: 80,
    totalAttempts: 79_454,
    unmonetizedImpressions: 1_697,
    unmonetizedPct: 2.14,
    p95AuctionMs: 304.29,
    cpmUsd: 32.5,
  },
];

const negativeRows: DiagnosisRow[] = [
  {
    channelId: 'ch-01',
    sspId: 'ssp-beta',
    deviceClass: 'connected_tv',
    codec: 'hevc',
    daypart: 'primetime',
    cues: 80,
    totalAttempts: 51_200,
    unmonetizedImpressions: 2_355,
    unmonetizedPct: 4.6,
    p95AuctionMs: 328.4,
    cpmUsd: 32.5,
  },
  {
    channelId: 'ch-01',
    sspId: 'ssp-alpha',
    deviceClass: 'connected_tv',
    codec: 'hevc',
    daypart: 'primetime',
    cues: 80,
    totalAttempts: 49_800,
    unmonetizedImpressions: 1_145,
    unmonetizedPct: 2.3,
    p95AuctionMs: 301.7,
    cpmUsd: 32.5,
  },
];

describe('structured metrics evidence summary', () => {
  const service = new MetricsService();

  it('reports the exact selected primary incident and server-owned thresholds', () => {
    const summary = service.deriveMetrics(primaryRows, {
      rowsReturned: 44,
      queryDurationMs: 91,
    }).evidenceSummary;

    expect(summary).toEqual({
      outcome: 'incident',
      reason: 'ISOLATED_ANOMALY',
      candidate: {
        basis: 'selected_incident',
        channelId: 'ch-01',
        sspId: 'ssp-beta',
        deviceClass: 'connected_tv',
        codec: 'hevc',
        daypart: 'primetime',
        cues: 80,
        totalAttempts: 60_862,
        unmonetizedImpressions: 59_482,
        unmonetizedPct: 97.73,
        p95AuctionMs: 1812.633,
        cpmUsd: 32.5,
      },
      revenueLossUsd: 1933.17,
      thresholds: {
        minimumCues: 20,
        incidentFailurePct: 20,
        cohortDispersionPp: 15,
        stitcherDeadlineMs: 450,
        hardAuctionTimeoutMs: 1200,
      },
      query: { rowsReturned: 44, rowsScanned: null, durationMs: 91 },
    });
  });

  it('reports restraint with the exact maximum negative-control observation', () => {
    const summary = service.deriveMetrics(negativeRows, {
      rowsReturned: 44,
      rowsScanned: 120_440,
      queryDurationMs: 89,
    }).evidenceSummary;

    expect(summary?.outcome).toBe('no_incident');
    expect(summary?.reason).toBe('BELOW_FAILURE_THRESHOLD');
    expect(summary?.candidate.basis).toBe('maximum_observed');
    expect(summary?.candidate.unmonetizedPct).toBe(4.6);
    expect(summary?.candidate.cues).toBe(80);
    expect(summary?.revenueLossUsd).toBeNull();
    expect(summary?.query).toEqual({
      rowsReturned: 44,
      rowsScanned: 120_440,
      durationMs: 89,
    });
  });
});
