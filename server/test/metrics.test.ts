import { describe, it, expect } from 'vitest';
import { MetricsService, type RawMcpQueryData } from '../src/services/metrics.service.js';

describe('MetricsService', () => {
  it('computes exact financial loss from known impressions and known queried CPM', () => {
    const service = new MetricsService();

    // Primary incident calculation:
    // 59,482 unmonetized impressions * ($32.50 CPM / 1000) = $1,933.165 -> round to cents = $1,933.17
    const primaryLoss = service.computeLoss(59482, 32.5);
    expect(primaryLoss).toBe(1933.17);

    // Standard inventory test:
    // 2,000 impressions * ($25.00 CPM / 1000) = $50.00
    const loss = service.computeLoss(2000, 25.0);
    expect(loss).toBe(50.0);

    // Primetime advertiser inventory rate card:
    // 1,500 impressions * ($32.50 CPM / 1000) = $48.75
    const primetimeLoss = service.computeLoss(1500, 32.5);
    expect(primetimeLoss).toBe(48.75);

    // Daytime inventory rate card ($18.75 CPM):
    // 16,000 impressions * ($18.75 CPM / 1000) = $300.00
    const daytimeLoss = service.computeLoss(16000, 18.75);
    expect(daytimeLoss).toBe(300.0);

    // Zero or negative input boundary conditions:
    expect(service.computeLoss(0, 25.0)).toBe(0.0);
    expect(service.computeLoss(-5, 25.0)).toBe(0.0);
    expect(service.computeLoss(10, 0.0)).toBe(0.0);
    expect(service.computeLoss(10, -10.0)).toBe(0.0);
  });

  it('derives grounded KPI metrics from ClickHouse MCP query results with queried rate card', () => {
    const service = new MetricsService();

    // Query result matching primary incident from loss_attribution.sql
    const mockQueryDataWithCpm: RawMcpQueryData = {
      columns: [
        'channel_id',
        'ssp_id',
        'device_class',
        'codec',
        'daypart',
        'cues',
        'total_attempts',
        'unmonetized_impressions',
        'unmonetized_pct',
        'p95_auction_ms',
        'cpm_usd',
      ],
      rows: [
        [
          'ch-01',
          'ssp-beta',
          'connected_tv',
          'hevc',
          'primetime',
          80,
          60862,
          59482,
          97.73,
          1812.0,
          32.5,
        ],
        [
          'ch-01',
          'ssp-alpha',
          'connected_tv',
          'hevc',
          'primetime',
          80,
          75000,
          1800,
          2.4,
          305.0,
          32.5,
        ],
      ],
    };

    const metrics = service.deriveMetrics(mockQueryDataWithCpm, {
      rowsScanned: 135862,
      queryDurationMs: 52,
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
    expect(metrics.scannedLogs).toBe('135,862');
    expect(metrics.scannedLogsSubtext).toBe('ClickHouse ASOF JOIN (52ms)');
    expect(metrics.scannedLogsTag).toBe('GROUNDED (MCP)');
  });

  it('observably flags fallback rate card when query lacks cpm_usd column', () => {
    const service = new MetricsService();

    const mockQueryDataWithoutCpm: RawMcpQueryData = {
      columns: [
        'ssp_id',
        'total_attempts',
        'p95_auction_ms',
        'unmonetized_impressions',
        'unmonetized_pct',
      ],
      rows: [
        ['ssp-alpha', 34000, 105.0, 0, 0.0],
        ['ssp-beta', 33000, 542.0, 5000, 84.2],
        ['ssp-gamma', 33000, 106.0, 0, 0.0],
      ],
    };

    const metrics = service.deriveMetrics(mockQueryDataWithoutCpm, {
      rowsScanned: 100000,
      queryDurationMs: 42,
    });

    expect(metrics.isGroundedFromMcp).toBe(true);
    // Must be flagged as not from query (fallback)
    expect(metrics.rateCardFromQuery).toBe(false);
    // Fallback calculation: 5,000 unmonetized impressions * ($25.00 fallback CPM / 1000) = $125.00
    expect(metrics.revenueLoss).toBe('$125.00');
    expect(metrics.revenueLossSubtext).toBe('5,000 unmonetized impressions');
  });

  it('preserves negative-control restraint when all cohorts rise uniformly (diffuse 25% noise)', () => {
    const service = new MetricsService();

    // Diffuse fixture: all cohorts at 25.0% unmonetized rate (above 20% absolute threshold, but 0pp dispersion)
    const diffuseFixture: RawMcpQueryData = {
      columns: [
        'ssp_id',
        'device_class',
        'cues',
        'total_attempts',
        'unmonetized_impressions',
        'unmonetized_pct',
        'avg_latency_ms',
        'cpm_usd',
      ],
      rows: [
        ['ssp-alpha', 'connected_tv', 80, 40000, 10000, 25.0, 140.0, 32.5],
        ['ssp-beta', 'connected_tv', 80, 40000, 10000, 25.0, 168.0, 32.5],
        ['ssp-gamma', 'connected_tv', 80, 40000, 10000, 25.0, 152.0, 32.5],
        ['ssp-delta', 'connected_tv', 80, 40000, 10000, 25.0, 175.0, 32.5],
      ],
    };

    const metrics = service.deriveMetrics(diffuseFixture, {
      rowsScanned: 160000,
      queryDurationMs: 35,
    });

    expect(metrics.isGroundedFromMcp).toBe(true);
    // Dispersion check prevents false escalation on diffuse noise:
    expect(metrics.slateBleedVariant).toBe('warning');
    expect(metrics.slateBleedTag).toBe('NOMINAL');
    expect(metrics.slateBleedTag).not.toBe('CRITICAL SPIKE');
    expect(metrics.revenueLossVariant).not.toBe('critical');
  });

  it('returns ungrounded null state when query data is missing or columns do not match', () => {
    const service = new MetricsService();

    // 1. Null / undefined / empty data
    const emptyMetrics = service.deriveMetrics(null);
    expect(emptyMetrics.isGroundedFromMcp).toBe(false);
    expect(emptyMetrics.rateCardFromQuery).toBe(false);
    expect(emptyMetrics.revenueLoss).toBeNull();
    expect(emptyMetrics.slateBleedRate).toBeNull();
    expect(emptyMetrics.offendingSsp).toBeNull();
    expect(emptyMetrics.sspLatency).toBeNull();
    expect(emptyMetrics.scannedLogs).toBeNull();

    // 2. Unrelated table columns (e.g. system.databases query)
    const unrelatedQuery: RawMcpQueryData = {
      columns: ['name', 'engine', 'data_path'],
      rows: [['default', 'Atomic', '/var/lib/clickhouse/data/default/']],
    };

    const unrelatedMetrics = service.deriveMetrics(unrelatedQuery);
    expect(unrelatedMetrics.isGroundedFromMcp).toBe(false);
    expect(unrelatedMetrics.revenueLoss).toBeNull();
    expect(unrelatedMetrics.slateBleedRate).toBeNull();
    expect(unrelatedMetrics.offendingSsp).toBeNull();
  });
});
