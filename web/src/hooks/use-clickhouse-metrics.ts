import { useMemo } from 'react';
import { z } from 'zod';
import type { InvestigationTraceEvent } from '../types.js';

export interface GroundedKpiMetrics {
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

const GroundedKpiPayloadSchema = z.object({
  revenueLoss: z.string().nullable().optional(),
  revenueLossSubtext: z.string().nullable().optional(),
  revenueLossVariant: z
    .enum(['critical', 'warning', 'success', 'interactive', 'neutral'])
    .default('neutral'),
  revenueLossTag: z.string().nullable().optional(),

  slateBleedRate: z.string().nullable().optional(),
  slateBleedSubtext: z.string().nullable().optional(),
  slateBleedVariant: z
    .enum(['critical', 'warning', 'success', 'interactive', 'neutral'])
    .default('neutral'),
  slateBleedTag: z.string().nullable().optional(),

  offendingSsp: z.string().nullable().optional(),
  sspLatency: z.string().nullable().optional(),
  sspSubtext: z.string().nullable().optional(),
  sspVariant: z
    .enum(['critical', 'warning', 'success', 'interactive', 'neutral'])
    .default('neutral'),

  scannedLogs: z.string().nullable().optional(),
  scannedLogsSubtext: z.string().nullable().optional(),
  scannedLogsTag: z.string().nullable().optional(),

  isGroundedFromMcp: z.boolean().default(false),
  rateCardFromQuery: z.boolean().default(false),
});

const EMPTY_METRICS: GroundedKpiMetrics = {
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
  sspSubtext: 'SSAI SLA budget: 250ms',
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
        const parsed = GroundedKpiPayloadSchema.safeParse(ev.data);
        if (parsed.success) {
          const { data } = parsed;
          if (data.isGroundedFromMcp) {
            return {
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
              sspSubtext: data.sspSubtext ?? 'SSAI SLA budget: 250ms',
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
