import { Database, Play, RotateCw, Sparkles } from 'lucide-react';
import type { InvestigationCaseConfig } from '../config/investigation-cases.js';
import type {
  GroundingReport,
  InvestigationEvidenceSummary,
  InvestigationTraceEvent,
  RemediationState,
} from '../types.js';
import { GroundedDiagnosisCard } from './GroundedDiagnosisCard.js';
import { InvestigationEventItem } from './InvestigationEventItem.js';
import { Button, SegmentedControl } from './ui/index.js';

export type TraceFilter = 'all' | 'query' | 'reasoning';

interface InvestigationPanelProps {
  activeCase: InvestigationCaseConfig;
  investigating: boolean;
  reconnecting: boolean;
  trace: InvestigationTraceEvent[];
  filter: TraceFilter;
  onFilter: (filter: TraceFilter) => void;
  onRun: () => void;
  finalDiagnosis: string | null;
  grounding?: GroundingReport | undefined;
  evidenceSummary?: InvestigationEvidenceSummary | undefined;
  isGroundedFromMcp: boolean;
  rateCardFromQuery: boolean;
  remediation: RemediationState | null;
  remediationLoading: boolean;
  remediationApproving: boolean;
  remediationError: string | null;
  onApproveRemediation: () => Promise<void>;
  onRefreshRemediation: () => Promise<void>;
}

const stages = ['Observe', 'Correlate', 'Verify', 'Diagnose'] as const;
const TRACE_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'query', label: 'Queries' },
  { value: 'reasoning', label: 'Reasoning' },
] as const;

function stageIndex(trace: InvestigationTraceEvent[], finalDiagnosis: string | null) {
  if (finalDiagnosis) return 3;
  if (
    trace.some(
      (event) =>
        event.type === 'frame_classified' ||
        ((event.type === 'tool_call' || event.type === 'tool_result') &&
          event.data.name === 'collect_diagnosis_evidence'),
    )
  )
    return 2;
  if (trace.some((event) => event.type === 'tool_call' || event.type === 'tool_result')) return 1;
  return trace.length > 0 ? 0 : -1;
}

function isVisible(event: InvestigationTraceEvent, filter: TraceFilter) {
  if (filter === 'all') return true;
  if (filter === 'reasoning') return event.type === 'reasoning' || event.type === 'status';
  return ['tool_call', 'tool_result', 'vision_call', 'frame_classified'].includes(event.type);
}

function formatWindow(value: string) {
  return value.replace('T', ' ').replace(':00.000Z', '');
}

export function InvestigationPanel(props: InvestigationPanelProps) {
  const activeStage = stageIndex(props.trace, props.finalDiagnosis);
  const visibleEvents = props.trace.filter((event) => isVisible(event, props.filter));
  const hasVisionEvidence = props.trace.some((event) => event.type === 'frame_classified');
  const hasRateCardEvidence = Boolean(
    props.evidenceSummary?.outcome === 'incident' && props.rateCardFromQuery,
  );

  return (
    <section
      className="rounded-2xl border border-border-subtle bg-surface-panel shadow-panel-subtle overflow-hidden"
      aria-labelledby="investigation-title"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border-subtle p-4 max-md:flex-col sm:px-5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 font-sans text-forensic-meta font-bold tracking-module text-interactive">
            02
          </span>
          <div>
            <h2
              id="investigation-title"
              className="m-0 mb-1 text-forensic-title font-bold tracking-tight text-text-primary"
            >
              Grounded forensic investigation
            </h2>
            <p className="m-0 font-sans text-forensic-meta leading-section text-text-muted">
              Gemini reasoning · official mcp-clickhouse · observable SQL
            </p>
          </div>
        </div>
        <Button
          onClick={props.onRun}
          loading={props.investigating}
          variant="primary"
          size="sm"
          className="h-8.5 shrink-0 font-sans tracking-wide max-md:w-full"
          icon={
            props.trace.length > 0 ? (
              <RotateCw aria-hidden="true" className="size-3.5" />
            ) : (
              <Play aria-hidden="true" className="size-3.5 fill-current" />
            )
          }
        >
          {props.investigating
            ? 'Running investigation'
            : props.trace.length > 0
              ? 'Replay investigation'
              : 'Run investigation'}
        </Button>
      </div>

      <div className="investigation-prompt-grid mx-5 mt-4 gap-4 rounded-inset border border-reasoning-border/40 bg-reasoning-surface p-3 sm:px-4">
        <div className="min-w-0">
          <span className="mb-1 block font-sans text-forensic-meta font-bold uppercase tracking-widest text-reasoning-fg">
            <Sparkles className="inline size-3.5 mr-1" />
            Operator prompt
          </span>
          <p className="m-0 font-sans text-forensic-body leading-normal text-text-primary">
            {props.activeCase.prompt}
          </p>
        </div>
        <div className="self-center border-l border-border-subtle pl-4 font-sans text-forensic-meta leading-evidence text-text-secondary whitespace-nowrap max-md:border-t max-md:border-l-0 max-md:pl-0 max-md:pt-3 max-md:whitespace-normal">
          <span className="block font-sans text-forensic-meta uppercase text-text-muted">
            Investigation window · UTC
          </span>
          <strong className="block font-mono text-forensic-code text-text-primary">
            {formatWindow(props.activeCase.from)} → {formatWindow(props.activeCase.to)}
          </strong>
          <span className="block font-sans text-text-muted">
            {props.activeCase.channel} · FAST-01
          </span>
        </div>
      </div>

      <ol
        className="grid grid-cols-4 border-b border-border-subtle px-5 py-4 list-none m-0 max-md:px-3.5"
        aria-label="Investigation pipeline stages"
      >
        {stages.map((stage, index) => {
          const isDone = index < activeStage || (index === 3 && Boolean(props.finalDiagnosis));
          const isActive = index === activeStage && !props.finalDiagnosis;
          return (
            <li
              key={stage}
              className={`relative font-sans text-forensic-meta uppercase tracking-micro ${
                index < stages.length - 1 ? 'pipeline-stage-connector' : ''
              } ${
                isDone
                  ? 'text-status-success'
                  : isActive
                    ? 'font-bold text-interactive'
                    : 'text-text-muted'
              }`}
            >
              <span
                className={`relative z-content mb-2 block size-2.75 rounded-full border-2 border-surface-panel transition-all ${
                  isDone
                    ? 'bg-status-success shadow-status-success-ring'
                    : isActive
                      ? 'bg-interactive shadow-glow-interactive'
                      : 'bg-surface-card shadow-border-ring'
                }`}
              />
              <span>{stage}</span>
            </li>
          );
        })}
      </ol>

      <div className="px-5 pb-5 max-md:px-3.5">
        <div className="flex min-h-9.5 flex-wrap items-center justify-between gap-2.5 py-1 font-sans text-forensic-meta uppercase tracking-widest text-text-muted">
          <div className="flex items-center gap-2">
            <span>Live evidence trace · {props.trace.length} events</span>
            {props.reconnecting && <span className="text-status-warning">(Reconnecting...)</span>}
          </div>
          <SegmentedControl
            label="Trace filters"
            options={TRACE_FILTER_OPTIONS}
            value={props.filter}
            onValueChange={props.onFilter}
            size="sm"
            className="font-sans uppercase"
          />
        </div>

        {visibleEvents.length === 0 ? (
          <div className="flex min-h-35 flex-col items-center justify-center border-t border-border-subtle py-8 text-center">
            <div className="mb-2.5 grid size-9 place-items-center rounded-full border border-border-subtle bg-surface-card text-data-fg">
              <Database className="size-4" />
            </div>
            <p className="m-0 font-sans text-forensic-heading font-bold text-text-primary">
              Forensic pipeline ready
            </p>
            <p className="m-0 mt-1 max-w-sm font-sans text-forensic-meta leading-normal text-text-muted">
              Run this case to stream real MCP calls, SQL, query results, reasoning, Vision
              evidence, and the grounded conclusion.
            </p>
          </div>
        ) : (
          <div className="mb-4">
            {visibleEvents.map((event, index) => (
              <InvestigationEventItem
                key={`${event.timestamp}-${event.type}-${index}`}
                event={event}
              />
            ))}
          </div>
        )}
      </div>

      {props.finalDiagnosis && (
        <GroundedDiagnosisCard
          diagnosis={props.finalDiagnosis}
          outcome={props.evidenceSummary?.outcome}
          grounding={props.grounding}
          hasClickHouseEvidence={props.isGroundedFromMcp}
          hasVisionEvidence={hasVisionEvidence}
          hasRateCardEvidence={hasRateCardEvidence}
          remediation={props.remediation}
          remediationLoading={props.remediationLoading}
          remediationApproving={props.remediationApproving}
          remediationError={props.remediationError}
          onApproveRemediation={props.onApproveRemediation}
          onRefreshRemediation={props.onRefreshRemediation}
        />
      )}
    </section>
  );
}
