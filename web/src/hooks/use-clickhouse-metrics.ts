import { useMemo } from 'react';
import { groundedKpiPayloadSchema } from '../api/index.js';
import type { InvestigationEvidenceSummary, InvestigationTraceEvent } from '../types.js';

export interface GroundedKpiMetrics {
  evidenceSummary?: InvestigationEvidenceSummary | undefined;
  revenueLoss: string;
  revenueLossSubtext: string;
  revenueLossVariant: 'critical' | 'warning' | 'success' | 'interactive' | 'neutral';
  revenueLossTag: string;

  slateBleedRate: string;
  slateBleedSubtext: string;
  slateBleedVariant: 'critical' | 'warning' | 'success' | 'interactive' | 'neutral';
  slateBleedTag: string;

  offendingSsp: string;
  sspLatency: string;
  sspSubtext: string;
  sspVariant: 'critical' | 'warning' | 'success' | 'interactive' | 'neutral';

  scannedLogs: string;
  scannedLogsSubtext: string;
  scannedLogsTag: string;

  isGroundedFromMcp: boolean;
  rateCardFromQuery: boolean;
}

const EMPTY_METRICS: GroundedKpiMetrics = {
  evidenceSummary: undefined,
  revenueLoss: '—',
  revenueLossSubtext: 'Awaiting investigation telemetry',
  revenueLossVariant: 'neutral',
  revenueLossTag: '—',

  slateBleedRate: '—',
  slateBleedSubtext: 'Target: 0.0% unmonetized pod time',
  slateBleedVariant: 'neutral',
  slateBleedTag: '—',

  offendingSsp: '—',
  sspLatency: '—',
  sspSubtext: 'Awaiting latency evidence',
  sspVariant: 'neutral',

  scannedLogs: '—',
  scannedLogsSubtext: 'ClickHouse fast_telemetry',
  scannedLogsTag: '—',

  isGroundedFromMcp: false,
  rateCardFromQuery: false,
};

export function useClickHouseMetrics(
  investigationTrace: InvestigationTraceEvent[],
): GroundedKpiMetrics {
  return useMemo(() => {
    // Scan backward to find the latest 'metrics' event
    for (let i = investigationTrace.length - 1; i >= 0; i--) {
      const ev = investigationTrace[i];
      if (ev && ev.type === 'metrics' && ev.data) {
        const parsed = groundedKpiPayloadSchema.safeParse(ev.data);
        if (parsed.success) {
          const { data } = parsed;
          if (data.isGroundedFromMcp) {
            return {
              evidenceSummary: data.evidenceSummary ?? undefined,
              revenueLoss: data.revenueLoss ?? '—',
              revenueLossSubtext: data.revenueLossSubtext ?? 'No loss in window',
              revenueLossVariant: data.revenueLossVariant,
              revenueLossTag: data.revenueLossTag ?? '—',

              slateBleedRate: data.slateBleedRate ?? '—',
              slateBleedSubtext: data.slateBleedSubtext ?? 'Target: 0.0% unmonetized pod time',
              slateBleedVariant: data.slateBleedVariant,
              slateBleedTag: data.slateBleedTag ?? '—',

              offendingSsp: data.offendingSsp ?? '—',
              sspLatency: data.sspLatency ?? '—',
              sspSubtext: data.sspSubtext ?? 'Awaiting latency evidence',
              sspVariant: data.sspVariant,

              scannedLogs: data.scannedLogs ?? '—',
              scannedLogsSubtext: data.scannedLogsSubtext ?? 'ClickHouse fast_telemetry',
              scannedLogsTag: data.scannedLogsTag ?? '—',

              isGroundedFromMcp: true,
              rateCardFromQuery: data.rateCardFromQuery,
            };
          }
        }
      }
    }

    return EMPTY_METRICS;
  }, [investigationTrace]);
}
