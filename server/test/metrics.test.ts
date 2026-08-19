import { describe, it, expect } from 'vitest';
import { MetricsService, type RawMcpQueryData } from '../src/services/metrics.service.js';

describe('MetricsService', () => {
  it('computes exact financial loss from known impressions and known rate card', () => {
    const service = new MetricsService({
      cpmUsd: 25.0,
      impressionsPerCue: 200,
    });

    // 10 unmonetized cues * 200 impressions/cue = 2,000 impressions
    // 2,000 impressions * ($25.00 / 1000) = $50.00
    const loss = service.computeLoss(10, 200, 25.0);
    expect(loss).toBe(50.0);

    // Custom rate card test (e.g. Primetime rate card: $32.50 CPM, 300 impressions)
    // 5 cues * 300 impressions/cue = 1,500 impressions
    // 1,500 * (32.50 / 1000) = $48.75
    const primetimeLoss = service.computeLoss(5, 300, 32.5);
    expect(primetimeLoss).toBe(48.75);

    // Zero or negative input boundary conditions
    expect(service.computeLoss(0)).toBe(0.0);
    expect(service.computeLoss(-5)).toBe(0.0);
  });

  it('derives grounded KPI metrics from ClickHouse MCP query results', () => {
    const service = new MetricsService({
      cpmUsd: 25.0,
      impressionsPerCue: 200,
    });

    const mockQueryData: RawMcpQueryData = {
      columns: ['ssp_id', 'cues', 'avg_latency_ms', 'failures', 'bleed_pct'],
      rows: [
        ['ssp-alpha', 34, 105.0, 0, 0.0],
        ['ssp-beta', 33, 542.0, 5, 84.2],
        ['ssp-gamma', 33, 106.0, 0, 0.0],
      ],
    };

    const metrics = service.deriveMetrics(mockQueryData, {
      rowsScanned: 100,
      queryDurationMs: 42,
    });

    expect(metrics.isGroundedFromMcp).toBe(true);
    expect(metrics.offendingSsp).toBe('SSP-BETA');
    expect(metrics.sspLatency).toBe('542ms');
    expect(metrics.sspVariant).toBe('warning');
    expect(metrics.slateBleedRate).toBe('84.2%');
    expect(metrics.slateBleedVariant).toBe('critical');
    // 5 dropped cues * 200 impressions * ($25 / 1000) = $25.00
    expect(metrics.revenueLoss).toBe('$25.00');
    expect(metrics.scannedLogs).toBe('100');
    expect(metrics.scannedLogsSubtext).toBe('ClickHouse ASOF JOIN (42ms)');
    expect(metrics.scannedLogsTag).toBe('GROUNDED (MCP)');
  });

  it('returns ungrounded null state when query data is missing or columns do not match', () => {
    const service = new MetricsService();

    // 1. Null / undefined / empty data
    const emptyMetrics = service.deriveMetrics(null);
    expect(emptyMetrics.isGroundedFromMcp).toBe(false);
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
