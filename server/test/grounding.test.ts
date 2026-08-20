import { describe, it, expect } from 'vitest';
import {
  GroundingService,
  renderDiagnosis,
  countPublishedFigures,
  type DiagnosisEvidence,
} from '../src/services/grounding.service.js';
import type { DiagnosisRow } from '../src/services/evidence.helper.js';

describe('GroundingService & renderDiagnosis', () => {
  const service = new GroundingService();

  const mockPositiveRow: DiagnosisRow = {
    channelId: 'ch-01',
    sspId: 'ssp-beta',
    deviceClass: 'connected_tv',
    codec: 'hevc',
    daypart: 'primetime',
    cues: 80,
    totalAttempts: 60862,
    unmonetizedImpressions: 59482,
    unmonetizedPct: 97.73,
    p95AuctionMs: 1812.0,
    cpmUsd: 32.5,
  };

  const mockEvidence: DiagnosisEvidence = {
    context: {
      channel: 'ch-01',
      from: '2026-08-14T19:00:00.000Z',
      to: '2026-08-14T23:00:00.000Z',
    },
    rows: [mockPositiveRow],
    incident: mockPositiveRow,
    frame: {
      classification: 'slate',
      confidence: 0.98,
      slate_type: 'looping_card',
      text_detected: 'We will be right back',
      visual_summary: 'Looping commercial break slate screen',
      contentHash: 'hash-123',
      cached: false,
      timestampSeconds: 12,
    },
  };

  it('renders a deterministic positive incident diagnosis with all grounded figures and remediation', () => {
    const diagnosis = renderDiagnosis(mockEvidence);

    expect(diagnosis).toContain('**Target Channel:** `ch-01`');
    expect(diagnosis).toContain('`2026-08-14T19:00:00.000Z` to `2026-08-14T23:00:00.000Z`');
    expect(diagnosis).toContain('`ssp-beta` on device class `connected_tv` (codec `hevc`)');
    expect(diagnosis).toContain('- Cues analyzed: 80');
    expect(diagnosis).toContain('- Total stitch attempts: 60,862');
    expect(diagnosis).toContain('59,482 (97.73%)');
    expect(diagnosis).toContain('1812ms');
    expect(diagnosis).toContain('450ms');
    expect(diagnosis).toContain('1200ms');
    expect(diagnosis).toContain("Frame classified as 'slate' at 12s with 98% confidence");
    expect(diagnosis).toContain('slate type: looping card');
    expect(diagnosis).not.toContain(mockEvidence.frame?.visual_summary);
    expect(diagnosis).toContain('$1,933.17');
    expect(diagnosis).toContain('$32.50');
    expect(diagnosis).toContain('Immediately reroute SSAI ad requests away from ssp-beta');
  });

  it('describes latency relative to thresholds without claiming a breach below them', () => {
    const diagnosis = renderDiagnosis({
      ...mockEvidence,
      incident: { ...mockPositiveRow, p95AuctionMs: 400 },
    });

    expect(diagnosis).toContain('within the 450ms stitcher deadline');
    expect(diagnosis).toContain('below the 1200ms hard auction timeout threshold');
    expect(diagnosis).not.toContain('exceeding the 450ms');
  });

  it('renders deterministic unavailable-impact sentence when queried CPM is missing', () => {
    const evidenceWithoutCpm: DiagnosisEvidence = {
      ...mockEvidence,
      incident: {
        ...mockPositiveRow,
        cpmUsd: null,
      },
    };

    const diagnosis = renderDiagnosis(evidenceWithoutCpm);

    // Incident cohort is still published
    expect(diagnosis).toContain('`ssp-beta` on device class `connected_tv` (codec `hevc`)');
    expect(diagnosis).toContain('- Cues analyzed: 80');
    // Financial impact states unavailable from queried inventory
    expect(diagnosis).toContain('Financial impact was unavailable from queried inventory.');
    expect(diagnosis).not.toContain('$1,933.17');
    expect(diagnosis).not.toContain('$32.50');
  });

  it('renders deterministic negative control diagnosis when non-empty cohorts meet no incident criteria', () => {
    const mockNegativeRow: DiagnosisRow = {
      channelId: 'ch-01',
      sspId: 'ssp-beta',
      deviceClass: 'connected_tv',
      codec: 'hevc',
      daypart: 'primetime',
      cues: 80,
      totalAttempts: 60710,
      unmonetizedImpressions: 2363,
      unmonetizedPct: 3.89,
      p95AuctionMs: 414.0,
      cpmUsd: 32.5,
    };

    const negativeEvidence: DiagnosisEvidence = {
      context: {
        channel: 'ch-01',
        from: '2026-08-09T19:00:00.000Z',
        to: '2026-08-09T23:00:00.000Z',
      },
      rows: [mockNegativeRow],
      incident: null,
      frame: null,
    };

    const diagnosis = renderDiagnosis(negativeEvidence);

    expect(diagnosis).toContain('**Target Channel:** `ch-01`');
    expect(diagnosis).toContain(
      'no isolated cohort breached the 20.0% unmonetized failure threshold',
    );
    expect(diagnosis).toContain(
      'No isolated root cause, on-air slate bleed, or financial loss is asserted.',
    );
    expect(diagnosis).toContain('No remediation action required for this window.');
    expect(diagnosis).not.toContain('$0.00');
    expect(diagnosis).not.toContain('$');
    expect(diagnosis).not.toContain('Root Cause Cohort');
    expect(diagnosis).not.toContain('reroute');
    expect(countPublishedFigures(negativeEvidence)).toBe(3);
  });

  it('renders deterministic insufficient sample diagnosis when canonical evidence is empty (cues < 20)', () => {
    const emptyEvidence: DiagnosisEvidence = {
      context: {
        channel: 'ch-01',
        from: '2026-08-14T19:00:00.000Z',
        to: '2026-08-14T19:15:00.000Z',
      },
      rows: [],
      incident: null,
      frame: null,
    };

    const diagnosis = renderDiagnosis(emptyEvidence);

    expect(diagnosis).toContain('**Target Channel:** `ch-01`');
    expect(diagnosis).toContain('insufficient qualifying evidence in this window');
    expect(diagnosis).toContain(
      'No cohort met the statistical significance threshold of cues >= 20',
    );
    expect(diagnosis).toContain(
      'Insufficient eligible sample size to evaluate incident failure thresholds',
    );
    expect(diagnosis).toContain(
      'No isolated root cause, on-air slate bleed, or financial loss is asserted.',
    );
    expect(diagnosis).toContain('No remediation action required for this window.');
    expect(diagnosis).not.toContain('$');
    expect(diagnosis).not.toContain('Root Cause Cohort');
    expect(diagnosis).not.toContain('reroute');
    expect(countPublishedFigures(emptyEvidence)).toBe(1);
  });

  it('builds GroundingReport counting exact verified figures directly from evidence snapshot', () => {
    expect(countPublishedFigures(mockEvidence)).toBe(11);
    const report = service.buildReport(mockEvidence);

    expect(report.grounded).toBe(true);
    expect(report.violations).toHaveLength(0);
    // countPublishedFigures: 2 thresholds (450, 1200) + 5 telemetry figures + 2 frame figures + 2 financial figures = 11
    expect(report.checkedClaims).toBe(11);
  });

  it('ensures rendering is pure and reproducible across multiple invocations', () => {
    const run1 = renderDiagnosis(mockEvidence);
    const run2 = renderDiagnosis(mockEvidence);
    const run3 = renderDiagnosis(mockEvidence);

    expect(run1).toBe(run2);
    expect(run2).toBe(run3);
  });
});
