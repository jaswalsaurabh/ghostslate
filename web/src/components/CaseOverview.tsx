import { Activity, Database, DollarSign, Percent, Zap } from 'lucide-react';
import type { InvestigationCaseConfig } from '../config/investigation-cases.js';
import type { GroundedKpiMetrics } from '../hooks/use-clickhouse-metrics.js';
import type { EvidenceGateReason } from '../types.js';
import { Metric, SegmentedControl } from './ui/index.js';

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
      return 'Monetization window did not exceed incident failure threshold';
    case 'NO_DATA':
      return 'No telemetry records found for investigation window';
    default:
      return 'Control window did not meet the incident evidence gate';
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
}): { text: string; highlight?: string; highlightTone?: 'critical' | 'success' } {
  if (!outcome) {
    return {
      text: 'Run the investigation to populate this workspace from grounded runtime evidence.',
    };
  }

  if (outcome === 'incident') {
    return {
      highlight: 'Critical anomaly',
      highlightTone: 'critical',
      text: visionConfirmed
        ? ' detected across the window. Evidence is grounded in live MCP queries and Gemini Vision.'
        : ' isolated from ClickHouse telemetry. Awaiting Gemini Vision confirmation.',
    };
  }

  switch (reason) {
    case 'INSUFFICIENT_SAMPLE_SIZE':
      return {
        highlight: 'Sample guard held',
        highlightTone: 'success',
        text: thresholds
          ? `: all cohorts had fewer than ${thresholds.minimumCues} cues. Small-sample guard prevented ungrounded causal attribution.`
          : ': the available evidence did not satisfy the small-sample guard.',
      };
    case 'DIFFUSE_VARIATION':
      return {
        highlight: 'Diffuse variation',
        highlightTone: 'success',
        text: thresholds
          ? `: cohort dispersion remained below the ${thresholds.cohortDispersionPp}pp isolation threshold against peer cohorts.`
          : ': peer variation did not establish an isolated cohort failure.',
      };
    case 'LONE_COHORT':
      return {
        text: 'No peer cohorts were available in the daypart to evaluate dispersion and verify anomaly isolation.',
      };
    case 'BELOW_FAILURE_THRESHOLD':
      return {
        highlight: 'At or below threshold',
        highlightTone: 'success',
        text: ': no observed cohort exceeded the incident failure threshold.',
      };
    case 'NO_DATA':
      return {
        text: 'No telemetry rows matched the query parameters for this investigation window.',
      };
    default:
      return {
        highlight: 'Evidence gate held',
        highlightTone: 'success',
        text: ': no cohort crossed the evidence threshold, so no root cause or loss was asserted.',
      };
  }
}

export function CaseOverview({
  activeCase,
  metrics,
  investigating: _investigating,
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

  const outcomeCardAccent =
    outcome === 'incident'
      ? 'before:bg-status-critical'
      : outcome === 'no_incident'
        ? 'before:bg-status-success'
        : 'before:bg-border-strong';

  const outcomeBannerBg =
    outcome === 'incident'
      ? 'bg-linear-to-r from-status-critical-surface/70 to-transparent'
      : outcome === 'no_incident'
        ? 'bg-linear-to-r from-status-success-surface/70 to-transparent'
        : '';

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
    <section
      aria-labelledby="incident-title"
      className={`relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-panel shadow-panel before:absolute before:inset-y-0 before:left-0 before:w-0.75 before:z-content ${outcomeCardAccent}`}
    >
      {/* Tier 1: Incident Hero Banner */}
      <div className={`p-5 sm:p-6 ${outcomeBannerBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
          <div className="font-mono text-forensic-meta font-bold uppercase tracking-eyebrow text-text-muted break-keep whitespace-nowrap max-w-full truncate">
            {activeCase.eyebrow}
          </div>
          <SegmentedControl
            label="Investigation case"
            options={CASE_OPTIONS}
            value={activeCase.id}
            onValueChange={onSelectCase}
            size="sm"
            className="font-mono uppercase"
          />
        </div>
        <h1
          id="incident-title"
          className="mb-1.5 mt-2.5 text-incident-title font-bold leading-title tracking-incident text-text-primary max-sm:text-mobile-title"
        >
          {title}
        </h1>
        <p className="m-0 max-w-4xl font-sans text-section leading-relaxed text-text-secondary">
          {summary.highlight ? (
            <b
              className={`font-bold ${
                summary.highlightTone === 'critical'
                  ? 'text-status-critical'
                  : 'text-status-success'
              }`}
            >
              {summary.highlight}
            </b>
          ) : null}
          {summary.text}
        </p>
      </div>

      {/* Tier 2: Cockpit KPI Stat Row */}
      <div className="grid grid-cols-1 gap-px border-t border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Revenue at risk"
          value={metrics.revenueLoss}
          detail={metrics.revenueLossSubtext}
          tag={metrics.revenueLossTag}
          tone={metrics.revenueLossVariant}
          icon={<DollarSign className="size-3.5" />}
          variant="column"
          className="bg-surface-panel"
        />
        <Metric
          label="Slate bleed"
          value={metrics.slateBleedRate}
          detail={metrics.slateBleedSubtext}
          tag={metrics.slateBleedTag}
          tone={metrics.slateBleedVariant}
          icon={<Percent className="size-3.5" />}
          variant="column"
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
          variant="column"
          className="bg-surface-panel"
        />
        <Metric
          label="Telemetry scanned"
          value={metrics.scannedLogs}
          detail={metrics.scannedLogsSubtext}
          tag={metrics.scannedLogsTag}
          tone={metrics.isGroundedFromMcp ? 'interactive' : 'neutral'}
          icon={<Database className="size-3.5" />}
          variant="column"
          className="bg-surface-panel"
        />
      </div>
    </section>
  );
}
