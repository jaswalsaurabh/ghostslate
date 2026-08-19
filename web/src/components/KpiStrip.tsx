import React from 'react';
import { DollarSign, AlertTriangle, Clock, Database, CheckCircle2 } from 'lucide-react';
import { KpiCard } from './ui/index.js';
import type { GroundedKpiMetrics } from '../hooks/use-clickhouse-metrics.js';

interface KpiStripProps {
  metrics: GroundedKpiMetrics;
}

export const KpiStrip: React.FC<KpiStripProps> = ({ metrics }) => {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
      {/* 1. Estimated Revenue Loss Card */}
      <KpiCard
        label="Est. Revenue Loss (Window)"
        value={metrics.revenueLoss}
        variant={metrics.revenueLossVariant}
        valueTag={
          <span
            className={
              metrics.revenueLossVariant === 'critical'
                ? 'text-status-critical'
                : 'text-status-success'
            }
          >
            {metrics.revenueLossTag}
          </span>
        }
        subtext={metrics.revenueLossSubtext}
        icon={<DollarSign className="w-4 h-4" />}
      />

      {/* 2. Slate Bleed Ratio Card */}
      <KpiCard
        label="Slate Bleed Ratio"
        value={metrics.slateBleedRate}
        variant={metrics.slateBleedVariant}
        valueTag={
          <span
            className={
              metrics.slateBleedVariant === 'critical'
                ? 'text-status-critical'
                : 'text-status-success'
            }
          >
            {metrics.slateBleedTag}
          </span>
        }
        subtext={metrics.slateBleedSubtext}
        icon={<AlertTriangle className="w-4 h-4" />}
      />

      {/* 3. Offending SSP & Latency Card */}
      <KpiCard
        label="Offending SSP / Latency"
        value={metrics.offendingSsp}
        variant={metrics.sspVariant}
        valueTag={
          <span
            className={
              metrics.sspVariant === 'warning' ? 'text-status-warning' : 'text-status-success'
            }
          >
            {metrics.sspLatency}
          </span>
        }
        subtext={metrics.sspSubtext}
        icon={<Clock className="w-4 h-4" />}
      />

      {/* 4. ClickHouse Rows Returned Card */}
      <KpiCard
        label="ClickHouse Rows Returned"
        value={metrics.scannedLogs}
        variant="interactive"
        valueTag={
          <span className="text-interactive flex items-center gap-1">
            {metrics.isGroundedFromMcp && <CheckCircle2 className="w-3 h-3 text-status-success" />}
            {metrics.scannedLogsTag}
          </span>
        }
        subtext={metrics.scannedLogsSubtext}
        icon={<Database className="w-4 h-4" />}
      />
    </section>
  );
};
