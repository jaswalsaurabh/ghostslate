import { Activity, Database, DollarSign, Percent, Zap } from 'lucide-react';
import type { GroundedKpiMetrics } from '../hooks/use-clickhouse-metrics.js';
import { Metric } from './ui/index.js';

interface CaseOverviewMetricsProps {
  metrics: GroundedKpiMetrics;
  investigating: boolean;
  outcome?: 'incident' | 'no_incident' | undefined;
}

export function CaseOverviewMetrics({ metrics, investigating, outcome }: CaseOverviewMetricsProps) {
  if (!metrics.isGroundedFromMcp) {
    return (
      <div
        className="flex items-center gap-3 border-t border-border-subtle bg-surface-panel px-5 py-3.5 sm:px-6"
        aria-live="polite"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-card text-data-fg">
          <Database aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="m-0 font-sans text-forensic-meta font-bold uppercase tracking-label text-text-primary">
            {investigating ? 'Collecting grounded telemetry' : 'Telemetry pending'}
          </p>
          <p className="m-0 mt-0.5 font-sans text-detail text-text-muted">
            {investigating
              ? 'Live MCP queries will populate the cockpit as evidence arrives.'
              : 'Run the investigation to populate revenue, slate bleed, SSP, and scan metrics.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-px border-t border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-4">
      <Metric
        label="Revenue at risk"
        value={metrics.revenueLoss}
        detail={metrics.revenueLossSubtext}
        tag={metrics.revenueLossTag}
        tone={metrics.revenueLossVariant}
        icon={<DollarSign className="size-3.5" />}
        className="bg-surface-panel"
      />
      <Metric
        label="Slate bleed"
        value={metrics.slateBleedRate}
        detail={metrics.slateBleedSubtext}
        tag={metrics.slateBleedTag}
        tone={metrics.slateBleedVariant}
        icon={<Percent className="size-3.5" />}
        className="bg-surface-panel"
      />
      <Metric
        label="Offending SSP"
        value={metrics.offendingSsp}
        detail={metrics.sspSubtext}
        tag={metrics.sspLatency}
        tone={metrics.sspVariant}
        icon={
          outcome === 'no_incident' ? (
            <Activity className="size-3.5" />
          ) : (
            <Zap className="size-3.5" />
          )
        }
        className="bg-surface-panel"
      />
      <Metric
        label="Telemetry scanned"
        value={metrics.scannedLogs}
        detail={metrics.scannedLogsSubtext}
        tag={metrics.scannedLogsTag}
        tone="interactive"
        icon={<Database className="size-3.5" />}
        className="bg-surface-panel"
      />
    </div>
  );
}
