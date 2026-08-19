import { describe, it, expect } from 'vitest';
import { GroundingService } from '../src/services/grounding.service.js';
import type { InvestigationEvent } from '../src/services/investigation.service.js';

describe('GroundingService', () => {
  const service = new GroundingService();

  it('passes a diagnosis whose every numeric claim appears in the steps corpus or is derived from queried figures', () => {
    const steps: InvestigationEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2026-08-14T23:01:00.000Z',
        data: {
          name: 'run_query',
          result: JSON.stringify({
            columns: [
              'channel_id',
              'ssp_id',
              'device_class',
              'codec',
              'cues',
              'total_attempts',
              'unmonetized_impressions',
              'unmonetized_pct',
              'p95_auction_ms',
              'cpm_usd',
            ],
            rows: [
              ['ch-01', 'ssp-beta', 'connected_tv', 'hevc', 80, 60862, 59482, 97.73, 1812.0, 32.5],
            ],
          }),
        },
      },
      {
        type: 'metrics',
        timestamp: '2026-08-14T23:01:05.000Z',
        data: {
          revenueLoss: '$1,933.17',
          slateBleedRate: '97.7%',
          sspLatency: '1812ms',
          scannedLogs: '60,862',
          isGroundedFromMcp: true,
          rateCardFromQuery: true,
        },
      },
    ];

    const diagnosis =
      'Investigation confirmed that ssp-beta on connected_tv with hevc codec suffered an unmonetized rate of 97.73% ' +
      'across 80 cues (59,482 unmonetized impressions of 60,862 attempts), with auction latency reaching 1812ms, ' +
      'resulting in $1,933.17 in loss at $32.50 CPM.';

    const report = service.verify(diagnosis, steps);

    expect(report.grounded).toBe(true);
    expect(report.violations).toHaveLength(0);
    expect(report.checkedClaims).toBeGreaterThan(0);
  });

  it('strictly rejects ungrounded figures from the Finding 4 test matrix', () => {
    // Corpus containing only [80, 34.04]
    const steps: InvestigationEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2026-08-14T23:01:00.000Z',
        data: {
          name: 'run_query',
          result: JSON.stringify({
            columns: ['cues', 'slate_bleed_pct'],
            rows: [[80, 34.04]],
          }),
        },
      },
    ];

    // 1. $520.00 (hallucinated derivation from hardcoded multiplier/rate card)
    const report1 = service.verify('Estimated revenue loss was $520.00 across the window.', steps);
    expect(report1.grounded).toBe(false);
    expect(report1.violations.map((v) => v.claim)).toContain('$520.00');

    // 2. 3404 ad breaks (hallucinated 100x scaling of 34.04)
    const report2 = service.verify('A total of 3404 ad breaks were affected by the issue.', steps);
    expect(report2.grounded).toBe(false);
    expect(report2.violations.map((v) => v.claim)).toContain('3404');

    // 3. 88.8% failure rate
    const report3 = service.verify('The failure rate escalated to 88.8% during the peak.', steps);
    expect(report3.grounded).toBe(false);
    expect(report3.violations.map((v) => v.claim)).toContain('88.8%');

    // 4. $9.25 CPM (unqueried rate card)
    const report4 = service.verify('Inventory was billed at a rate of $9.25 CPM.', steps);
    expect(report4.grounded).toBe(false);
    expect(report4.violations.map((v) => v.claim)).toContain('$9.25');
  });

  it('grounds derived revenue loss computed strictly from corpus impressions and queried CPM', () => {
    // Tool result has 10,000 unmonetized impressions and $32.50 CPM, but raw string "$325.00" is absent
    // 10,000 impressions * ($32.50 CPM / 1000) = $325.00
    const steps: InvestigationEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2026-08-14T23:01:00.000Z',
        data: {
          name: 'run_query',
          result: JSON.stringify({
            columns: ['channel_id', 'unmonetized_impressions', 'cpm_usd'],
            rows: [['ch-01', 10000, 32.5]],
          }),
        },
      },
    ];

    const diagnosis =
      'Analysis found 10000 unmonetized impressions during primetime inventory at $32.50 CPM, producing a derived loss of $325.00.';

    const report = service.verify(diagnosis, steps);

    expect(report.grounded).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it('exempts system prompt thresholds, timestamp dates, and step ordinals', () => {
    const steps: InvestigationEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2026-08-14T23:01:00.000Z',
        data: {
          name: 'run_query',
          result: JSON.stringify({
            columns: ['ssp_id', 'latency_ms'],
            rows: [['ssp-beta', 850]],
          }),
        },
      },
    ];

    // Cites 450ms (stitcher deadline) and 1200ms (timeout) from prompt, 2026-08-14 19:00 window, and Step 1
    const diagnosis =
      'In Step 1 of the analysis for window 2026-08-14 from 19:00 to 23:00, latency reached 850ms, ' +
      'breaching the 450ms stitcher deadline while remaining below the 1200ms hard timeout.';

    const report = service.verify(diagnosis, steps);

    expect(report.grounded).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it('flags an ungrounded root cause diagnosis on negative control telemetry', () => {
    const steps: InvestigationEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2026-08-09T23:01:00.000Z',
        data: {
          name: 'run_query',
          result: JSON.stringify({
            columns: ['ssp_id', 'cues', 'unmonetized_pct'],
            rows: [
              ['ssp-alpha', 80, 2.5],
              ['ssp-beta', 80, 3.1],
              ['ssp-gamma', 80, 2.7],
            ],
          }),
        },
      },
    ];

    const bogusDiagnosis =
      'Root cause isolated to ssp-alpha with 45.5% slate bleed resulting in $5,000.00 loss.';

    const report = service.verify(bogusDiagnosis, steps);

    expect(report.grounded).toBe(false);
    expect(report.violations.length).toBeGreaterThan(0);
    const violationClaims = report.violations.map((v) => v.claim);
    expect(violationClaims).toContain('45.5%');
    expect(violationClaims).toContain('$5,000.00');
  });
});
