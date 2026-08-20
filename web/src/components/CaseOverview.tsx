import { Activity, DollarSign, Gauge, ServerCrash } from 'lucide-react';
import type { InvestigationCaseConfig } from '../config/investigation-cases.js';
import type { GroundedKpiMetrics } from '../hooks/use-clickhouse-metrics.js';
import type { EvidenceGateReason } from '../types.js';
import { Badge, Card, Metric, SegmentedControl } from './ui/index.js';

interface CaseOverviewProps {
  activeCase: InvestigationCaseConfig;
  metrics: GroundedKpiMetrics;
  investigating: boolean;
  visionConfirmed?: boolean;
  onSelectCase: (id: InvestigationCaseConfig['id']) => void;
}

const CASE_OPTIONS = [
  { value: 'primary', label: 'Primary incident' },
  { value: 'negative-control', label: 'Negative control' },
] as const;

function getOverviewTitle({
  activeCase,
  outcome,
  reason,
  hasTimeout,
  hasDeadline,
  visionConfirmed,
}: {
  activeCase: InvestigationCaseConfig;
  outcome?: 'incident' | 'no_incident' | undefined;
  reason?: EvidenceGateReason | undefined;
  hasTimeout: boolean;
  hasDeadline: boolean;
  visionConfirmed: boolean;
}): string {
  if (!outcome) {
    return activeCase.heading;
  }

  if (outcome === 'incident') {
    if (visionConfirmed) {
      if (hasTimeout) return 'SSP auction timeout confirmed replacing paid ads with slate';
      if (hasDeadline) return 'SSP auction latency exceeded stitcher deadline with confirmed slate';
      return 'Isolated cohort anomaly confirmed with broadcast slate';
    }
    if (hasTimeout) return 'SSP auction timeout exceeded hard auction boundary';
    if (hasDeadline) return 'SSP auction latency exceeded stitcher deadline';
    return 'Isolated cohort anomaly detected on channel';
  }

  switch (reason) {
    case 'INSUFFICIENT_SAMPLE_SIZE':
      return 'Insufficient telemetry sample size to attribute root cause';
    case 'DIFFUSE_VARIATION':
      return 'Telemetry shows diffuse variation without isolated cohort failure';
    case 'LONE_COHORT':
      return 'Insufficient peer cohorts to verify anomaly isolation';
    case 'BELOW_FAILURE_THRESHOLD':
      return 'Monetization window remains within normal baseline';
    case 'NO_DATA':
      return 'No telemetry records found for investigation window';
    default:
      return 'Control window remains within monetization baseline';
  }
}

function getOverviewSummary({
  outcome,
  reason,
  thresholds,
  visionConfirmed,
}: {
  outcome?: 'incident' | 'no_incident' | undefined;
  reason?: EvidenceGateReason | undefined;
  thresholds?: { minimumCues: number; cohortDispersionPp: number } | undefined;
  visionConfirmed: boolean;
}): string {
  if (!outcome) {
    return 'Run the investigation to populate this workspace from grounded runtime evidence.';
  }

  if (outcome === 'incident') {
    return visionConfirmed
      ? 'Critical anomaly confirmed with ClickHouse telemetry and Gemini Vision slate evidence.'
      : 'Critical anomaly isolated from ClickHouse telemetry. Awaiting Gemini Vision slate confirmation.';
  }

  switch (reason) {
    case 'INSUFFICIENT_SAMPLE_SIZE':
      return `All cohorts had fewer than ${thresholds?.minimumCues ?? 20} cues; small-sample guard prevented ungrounded causal attribution.`;
    case 'DIFFUSE_VARIATION':
      return `Cohort dispersion remained below ${thresholds?.cohortDispersionPp ?? 15}pp against peer cohorts, indicating diffuse variation rather than isolated failure.`;
    case 'LONE_COHORT':
      return 'No peer cohorts were available in the daypart to evaluate dispersion and verify anomaly isolation.';
    case 'BELOW_FAILURE_THRESHOLD':
      return 'Failure rate remained below the incident threshold across all observed cohorts.';
    case 'NO_DATA':
      return 'No telemetry rows matched the query parameters for this investigation window.';
    default:
      return 'No cohort crossed the evidence threshold, so no root cause or loss was asserted.';
  }
}

export function CaseOverview({
  activeCase,
  metrics,
  investigating,
  visionConfirmed = false,
  onSelectCase,
}: CaseOverviewProps) {
  const summaryData = metrics.evidenceSummary;
  const outcome = summaryData?.outcome;
  const candidate = summaryData?.candidate;
  const thresholds = summaryData?.thresholds;

  const hasTimeout = Boolean(
    candidate && thresholds && candidate.p95AuctionMs > thresholds.hardAuctionTimeoutMs,
  );
  const hasDeadline = Boolean(
    candidate && thresholds && candidate.p95AuctionMs > thresholds.stitcherDeadlineMs,
  );

  const title = getOverviewTitle({
    activeCase,
    outcome,
    reason: summaryData?.reason,
    hasTimeout,
    hasDeadline,
    visionConfirmed,
  });

  const summary = getOverviewSummary({
    outcome,
    reason: summaryData?.reason,
    thresholds,
    visionConfirmed,
  });

  return (
    <Card variant="panel" className="overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant={outcome === 'incident' ? 'critical' : 'neutral'} size="sm">
                {activeCase.eyebrow}
              </Badge>
              {investigating && <Badge variant="primary">Live run</Badge>}
            </div>
            <SegmentedControl
              label="Investigation case"
              options={CASE_OPTIONS}
              value={activeCase.id}
              onValueChange={(id) => onSelectCase(id as InvestigationCaseConfig['id'])}
            />
          </div>
          <h1 className="max-w-3xl text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">{summary}</p>
        </div>

        <Metric
          label="Revenue at risk"
          value={metrics.revenueLoss}
          detail={metrics.revenueLossSubtext}
          tag={metrics.revenueLossTag}
          tone={metrics.revenueLossVariant}
          icon={<DollarSign className="h-4 w-4" />}
          variant="column"
        />
        <Metric
          label="Slate bleed"
          value={metrics.slateBleedRate}
          detail={metrics.slateBleedSubtext}
          tag={metrics.slateBleedTag}
          tone={metrics.slateBleedVariant}
          icon={<Gauge className="h-4 w-4" />}
          variant="column"
        />
        <Metric
          label="Offending SSP"
          value={metrics.offendingSsp}
          detail={metrics.sspSubtext}
          tag={metrics.sspLatency}
          tone={metrics.sspVariant}
          icon={
            outcome === 'no_incident' ? (
              <Activity className="h-4 w-4" />
            ) : (
              <ServerCrash className="h-4 w-4" />
            )
          }
          variant="column"
        />
      </div>
    </Card>
  );
}
