import { describe, it, expect } from 'vitest';
import {
  MetricsService,
  selectIncidentCohort,
  type DiagnosisRow,
} from '../src/services/metrics.service.js';

describe('MetricsService & selectIncidentCohort', () => {
  const service = new MetricsService();

  const primaryIncidentFixture: DiagnosisRow[] = [
    {
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
    },
    {
      channelId: 'ch-01',
      sspId: 'ssp-alpha',
      deviceClass: 'connected_tv',
      codec: 'hevc',
      daypart: 'primetime',
      cues: 80,
      totalAttempts: 75000,
      unmonetizedImpressions: 1800,
      unmonetizedPct: 2.4,
      p95AuctionMs: 305.0,
      cpmUsd: 32.5,
    },
    {
      channelId: 'ch-01',
      sspId: 'ssp-gamma',
      deviceClass: 'connected_tv',
      codec: 'hevc',
      daypart: 'primetime',
      cues: 80,
      totalAttempts: 70000,
      unmonetizedImpressions: 1400,
      unmonetizedPct: 2.0,
      p95AuctionMs: 290.0,
      cpmUsd: 32.5,
    },
  ];

  it('computes exact financial loss from known impressions and known queried CPM', () => {
    // Primary incident calculation:
    // 59,482 unmonetized impressions * ($32.50 CPM / 1000) = $1,933.165 -> round to cents = $1,933.17
    const primaryLoss = service.computeLoss(59482, 32.5);
    expect(primaryLoss).toBe(1933.17);

    // Standard inventory test:
    // 2,000 impressions * ($25.00 CPM / 1000) = $50.00
    const loss = service.computeLoss(2000, 25.0);
    expect(loss).toBe(50.0);

    // Zero or negative input boundary conditions:
    expect(service.computeLoss(0, 25.0)).toBe(0.0);
    expect(service.computeLoss(-5, 25.0)).toBe(0.0);
    expect(service.computeLoss(10, 0.0)).toBe(0.0);
    expect(service.computeLoss(10, -10.0)).toBe(0.0);
  });

  describe('selectIncidentCohort', () => {
    it('selects expected incident row on primary incident fixture', () => {
      const selected = selectIncidentCohort(primaryIncidentFixture);
      expect(selected).not.toBeNull();
      expect(selected?.sspId).toBe('ssp-beta');
      expect(selected?.deviceClass).toBe('connected_tv');
      expect(selected?.codec).toBe('hevc');
      expect(selected?.unmonetizedPct).toBe(97.73);
      expect(selected?.unmonetizedImpressions).toBe(59482);
    });

    it('returns null on negative control fixture with all cohorts <= 5%', () => {
      const negControlFixture: DiagnosisRow[] = [
        {
          channelId: 'ch-01',
          sspId: 'ssp-alpha',
          deviceClass: 'connected_tv',
          codec: 'hevc',
          daypart: 'primetime',
          cues: 80,
          totalAttempts: 50000,
          unmonetizedImpressions: 1200,
          unmonetizedPct: 2.4,
          p95AuctionMs: 140.0,
          cpmUsd: 32.5,
        },
        {
          channelId: 'ch-01',
          sspId: 'ssp-beta',
          deviceClass: 'connected_tv',
          codec: 'hevc',
          daypart: 'primetime',
          cues: 80,
          totalAttempts: 50000,
          unmonetizedImpressions: 1500,
          unmonetizedPct: 3.0,
          p95AuctionMs: 160.0,
          cpmUsd: 32.5,
        },
        {
          channelId: 'ch-01',
          sspId: 'ssp-gamma',
          deviceClass: 'connected_tv',
          codec: 'hevc',
          daypart: 'primetime',
          cues: 80,
          totalAttempts: 50000,
          unmonetizedImpressions: 1100,
          unmonetizedPct: 2.2,
          p95AuctionMs: 150.0,
          cpmUsd: 32.5,
        },
      ];

      const selected = selectIncidentCohort(negControlFixture);
      expect(selected).toBeNull();
    });

    it('guards cues < 20 (cues = 19 vs cues = 20)', () => {
      const lowCuesFixture: DiagnosisRow[] = [
        {
          channelId: 'ch-01',
          sspId: 'ssp-beta',
          deviceClass: 'connected_tv',
          codec: 'hevc',
          daypart: 'primetime',
          cues: 19, // Below guard
          totalAttempts: 10000,
          unmonetizedImpressions: 9500,
          unmonetizedPct: 95.0,
          p95AuctionMs: 1800,
          cpmUsd: 32.5,
        },
        {
          channelId: 'ch-01',
          sspId: 'ssp-alpha',
          deviceClass: 'connected_tv',
          codec: 'hevc',
          daypart: 'primetime',
          cues: 80,
          totalAttempts: 50000,
          unmonetizedImpressions: 1000,
          unmonetizedPct: 2.0,
          p95AuctionMs: 150,
          cpmUsd: 32.5,
        },
      ];

      // Since ssp-beta has cues = 19, it is filtered out; ssp-alpha has unmonetizedPct = 2.0% -> null
      expect(selectIncidentCohort(lowCuesFixture)).toBeNull();

      // When cues = 20 and there are peers, ssp-beta is eligible
      const validCuesFixture: DiagnosisRow[] = [
        { ...lowCuesFixture[0]!, cues: 20 },
        lowCuesFixture[1]!,
      ];
      const selected = selectIncidentCohort(validCuesFixture);
      expect(selected).not.toBeNull();
      expect(selected?.sspId).toBe('ssp-beta');
    });

    it('enforces absolute threshold boundary (>20% required)', () => {
      const thresholdFixture20Pct: DiagnosisRow[] = [
        {
          channelId: 'ch-01',
          sspId: 'ssp-beta',
          deviceClass: 'connected_tv',
          codec: 'hevc',
          daypart: 'primetime',
          cues: 25,
          totalAttempts: 10000,
          unmonetizedImpressions: 2000,
          unmonetizedPct: 20.0, // Exactly 20.0% -> not > 20%
          p95AuctionMs: 500,
          cpmUsd: 32.5,
        },
        {
          channelId: 'ch-01',
          sspId: 'ssp-alpha',
          deviceClass: 'connected_tv',
          codec: 'hevc',
          daypart: 'primetime',
          cues: 25,
          totalAttempts: 10000,
          unmonetizedImpressions: 100,
          unmonetizedPct: 1.0,
          p95AuctionMs: 150,
          cpmUsd: 32.5,
        },
      ];
      expect(selectIncidentCohort(thresholdFixture20Pct)).toBeNull();

      const thresholdFixture20_1Pct: DiagnosisRow[] = [
        { ...thresholdFixture20Pct[0]!, unmonetizedPct: 20.1 },
        thresholdFixture20Pct[1]!,
      ];
      // 20.1 - 1.0 = 19.1pp >= 15pp dispersion
      expect(selectIncidentCohort(thresholdFixture20_1Pct)?.sspId).toBe('ssp-beta');
    });

    it('enforces dispersion threshold boundary (14.9pp fails, 15.0pp passes)', () => {
      const peer: DiagnosisRow = {
        channelId: 'ch-01',
        sspId: 'ssp-alpha',
        deviceClass: 'connected_tv',
        codec: 'hevc',
        daypart: 'primetime',
        cues: 50,
        totalAttempts: 10000,
        unmonetizedImpressions: 1000,
        unmonetizedPct: 10.0,
        p95AuctionMs: 200,
        cpmUsd: 32.5,
      };

      // Worst = 24.9% (24.9 - 10.0 = 14.9pp < 15.0pp -> null)
      const underDispersion: DiagnosisRow[] = [
        {
          ...peer,
          sspId: 'ssp-beta',
          unmonetizedPct: 24.9,
        },
        peer,
      ];
      expect(selectIncidentCohort(underDispersion)).toBeNull();

      // Worst = 25.0% (25.0 - 10.0 = 15.0pp >= 15.0pp -> ssp-beta)
      const exactDispersion: DiagnosisRow[] = [
        {
          ...peer,
          sspId: 'ssp-beta',
          unmonetizedPct: 25.0,
        },
        peer,
      ];
      expect(selectIncidentCohort(exactDispersion)?.sspId).toBe('ssp-beta');
    });

    it('excludes the selected worst row from peer median computation', () => {
      // Worst row is 90%. Peers are 10% and 10%. Peer median must be 10% (not (90+10+10)/3 = 10% median anyway, but with 2 peers, median is 10)
      const rows: DiagnosisRow[] = [
        {
          channelId: 'ch-01',
          sspId: 'ssp-beta',
          deviceClass: 'connected_tv',
          codec: 'hevc',
          daypart: 'primetime',
          cues: 40,
          totalAttempts: 10000,
          unmonetizedImpressions: 9000,
          unmonetizedPct: 90.0,
          p95AuctionMs: 1500,
          cpmUsd: 32.5,
        },
        {
          channelId: 'ch-01',
          sspId: 'ssp-alpha',
          deviceClass: 'connected_tv',
          codec: 'hevc',
          daypart: 'primetime',
          cues: 40,
          totalAttempts: 10000,
          unmonetizedImpressions: 1000,
          unmonetizedPct: 10.0,
          p95AuctionMs: 200,
          cpmUsd: 32.5,
        },
        {
          channelId: 'ch-01',
          sspId: 'ssp-gamma',
          deviceClass: 'connected_tv',
          codec: 'hevc',
          daypart: 'primetime',
          cues: 40,
          totalAttempts: 10000,
          unmonetizedImpressions: 1000,
          unmonetizedPct: 10.0,
          p95AuctionMs: 200,
          cpmUsd: 32.5,
        },
      ];

      const selected = selectIncidentCohort(rows);
      expect(selected?.sspId).toBe('ssp-beta');
    });

    it('enforces restraint when a lone cohort exists with no peers in the daypart', () => {
      const loneCohort: DiagnosisRow[] = [
        {
          channelId: 'ch-01',
          sspId: 'ssp-beta',
          deviceClass: 'connected_tv',
          codec: 'hevc',
          daypart: 'primetime',
          cues: 80,
          totalAttempts: 60000,
          unmonetizedImpressions: 59000,
          unmonetizedPct: 98.3,
          p95AuctionMs: 1800,
          cpmUsd: 32.5,
        },
      ];

      // A lone cohort has 0 peers, so isolation cannot be verified -> restraint returns null
      expect(selectIncidentCohort(loneCohort)).toBeNull();
    });

    it('breaks ties deterministically regardless of input row ordering', () => {
      const rowA: DiagnosisRow = {
        channelId: 'ch-01',
        sspId: 'ssp-alpha',
        deviceClass: 'connected_tv',
        codec: 'hevc',
        daypart: 'primetime',
        cues: 50,
        totalAttempts: 10000,
        unmonetizedImpressions: 5000,
        unmonetizedPct: 50.0,
        p95AuctionMs: 800,
        cpmUsd: 32.5,
      };

      const rowB: DiagnosisRow = {
        channelId: 'ch-01',
        sspId: 'ssp-beta',
        deviceClass: 'connected_tv',
        codec: 'hevc',
        daypart: 'primetime',
        cues: 50,
        totalAttempts: 10000,
        unmonetizedImpressions: 5000,
        unmonetizedPct: 50.0,
        p95AuctionMs: 800,
        cpmUsd: 32.5,
      };

      const peer: DiagnosisRow = {
        channelId: 'ch-01',
        sspId: 'ssp-gamma',
        deviceClass: 'connected_tv',
        codec: 'hevc',
        daypart: 'primetime',
        cues: 50,
        totalAttempts: 10000,
        unmonetizedImpressions: 200,
        unmonetizedPct: 2.0,
        p95AuctionMs: 200,
        cpmUsd: 32.5,
      };

      // Exact rate & impression tie between alpha and beta -> lexicographical sspId puts alpha first
      const selected1 = selectIncidentCohort([rowA, rowB, peer]);
      const selected2 = selectIncidentCohort([rowB, rowA, peer]);
      const selected3 = selectIncidentCohort([peer, rowB, rowA]);

      expect(selected1?.sspId).toBe('ssp-alpha');
      expect(selected2?.sspId).toBe('ssp-alpha');
      expect(selected3?.sspId).toBe('ssp-alpha');
    });
  });

  describe('deriveMetrics', () => {
    it('derives grounded KPI metrics from DiagnosisRow array with queried rate card', () => {
      const metrics = service.deriveMetrics(primaryIncidentFixture, {
        rowsReturned: 3,
        queryDurationMs: 48,
      });

      expect(metrics.isGroundedFromMcp).toBe(true);
      expect(metrics.rateCardFromQuery).toBe(true);
      expect(metrics.offendingSsp).toBe('SSP-BETA');
      expect(metrics.sspLatency).toBe('1812ms');
      expect(metrics.sspVariant).toBe('warning');
      expect(metrics.slateBleedRate).toBe('97.7%');
      expect(metrics.slateBleedVariant).toBe('critical');
      // 59,482 unmonetized impressions * ($32.50 CPM / 1000) = $1,933.17
      expect(metrics.revenueLoss).toBe('$1,933.17');
      expect(metrics.revenueLossSubtext).toBe('59,482 unmonetized impressions');
      expect(metrics.revenueLossVariant).toBe('critical');
      expect(metrics.scannedLogs).toBe('3');
      expect(metrics.scannedLogsSubtext).toBe('ClickHouse ASOF JOIN (48ms)');
      expect(metrics.scannedLogsTag).toBe('GROUNDED (MCP)');
    });

    it('handles missing/nullable CPM cleanly without substituting a fallback rate card', () => {
      const fixtureWithoutCpm: DiagnosisRow[] = primaryIncidentFixture.map((r) => ({
        ...r,
        cpmUsd: null,
      }));

      const metrics = service.deriveMetrics(fixtureWithoutCpm, {
        rowsReturned: 3,
        queryDurationMs: 48,
      });

      expect(metrics.isGroundedFromMcp).toBe(true);
      expect(metrics.rateCardFromQuery).toBe(false);
      expect(metrics.offendingSsp).toBe('SSP-BETA');
      expect(metrics.slateBleedRate).toBe('97.7%');
      expect(metrics.slateBleedVariant).toBe('critical');
      // Loss fields must remain null and neutral when CPM is missing
      expect(metrics.revenueLoss).toBeNull();
      expect(metrics.revenueLossSubtext).toBe('Financial impact unavailable');
      expect(metrics.revenueLossVariant).toBe('neutral');
    });

    it('returns nominal state on negative control query data', () => {
      const negControl: DiagnosisRow[] = [
        {
          channelId: 'ch-01',
          sspId: 'ssp-alpha',
          deviceClass: 'connected_tv',
          codec: 'hevc',
          daypart: 'primetime',
          cues: 80,
          totalAttempts: 50000,
          unmonetizedImpressions: 1200,
          unmonetizedPct: 2.4,
          p95AuctionMs: 140.0,
          cpmUsd: 32.5,
        },
        {
          channelId: 'ch-01',
          sspId: 'ssp-beta',
          deviceClass: 'connected_tv',
          codec: 'hevc',
          daypart: 'primetime',
          cues: 80,
          totalAttempts: 50000,
          unmonetizedImpressions: 1500,
          unmonetizedPct: 3.0,
          p95AuctionMs: 160.0,
          cpmUsd: 32.5,
        },
      ];

      const metrics = service.deriveMetrics(negControl, {
        rowsReturned: 2,
        queryDurationMs: 30,
      });

      expect(metrics.isGroundedFromMcp).toBe(true);
      expect(metrics.offendingSsp).toBeNull();
      expect(metrics.sspLatency).toBeNull();
      expect(metrics.revenueLoss).toBeNull();
      expect(metrics.revenueLossVariant).toBe('neutral');
      expect(metrics.revenueLossSubtext).toBe('No incident detected in window');
      expect(metrics.slateBleedVariant).toBe('success');
      expect(metrics.slateBleedTag).toBe('NOMINAL');
    });

    it('returns ungrounded empty state when query data is missing or empty', () => {
      const emptyMetrics = service.deriveMetrics(null);
      expect(emptyMetrics.isGroundedFromMcp).toBe(false);
      expect(emptyMetrics.revenueLoss).toBeNull();
      expect(emptyMetrics.slateBleedRate).toBeNull();
      expect(emptyMetrics.offendingSsp).toBeNull();
    });
  });
});
