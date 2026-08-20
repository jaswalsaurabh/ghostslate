import { Database, Play, RotateCw, Sparkles } from 'lucide-react';
import type { InvestigationCaseConfig } from '../config/investigation-cases.js';
import type { GroundingReport, InvestigationTraceEvent, RemediationState } from '../types.js';
import { GroundedDiagnosisCard } from './GroundedDiagnosisCard.js';
import { InvestigationEventItem } from './InvestigationEventItem.js';
import { Badge, Button, Card } from './ui/index.js';

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
  remediation: RemediationState | null;
  remediationLoading: boolean;
  remediationApproving: boolean;
  remediationError: string | null;
  onApproveRemediation: () => Promise<void>;
  onRefreshRemediation: () => Promise<void>;
}

const stages = ['Observe', 'Correlate', 'Verify', 'Diagnose'] as const;

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

  return (
    <Card variant="panel" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-hover font-mono text-xs font-bold text-text-muted">
            02
          </span>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Grounded forensic investigation</h2>
            <p className="text-xs text-text-muted">
              Gemini reasoning · official mcp-clickhouse · observable SQL
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          onClick={props.onRun}
          loading={props.investigating}
          icon={
            props.trace.length > 0 ? <RotateCw className="h-4 w-4" /> : <Play className="h-4 w-4" />
          }
        >
          {props.investigating
            ? 'Running investigation'
            : props.trace.length > 0
              ? 'Replay investigation'
              : 'Run investigation'}
        </Button>
      </div>

      <div className="grid gap-3 border-b border-border-subtle bg-surface-base p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-interactive">
            <Sparkles className="h-3.5 w-3.5" /> Operator prompt
          </div>
          <p className="text-sm leading-relaxed text-text-primary">{props.activeCase.prompt}</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface-panel p-3 font-mono text-xs text-text-secondary sm:min-w-56">
          <span className="block uppercase text-text-muted">Investigation window · UTC</span>
          <strong className="mt-1 block text-text-primary">
            {formatWindow(props.activeCase.from)}
          </strong>
          <strong className="block text-text-primary">→ {formatWindow(props.activeCase.to)}</strong>
          <span className="mt-2 block">{props.activeCase.channel} · FAST-01</span>
        </div>
      </div>

      <ol
        className="grid grid-cols-4 border-b border-border-subtle"
        aria-label="Investigation progress"
      >
        {stages.map((stage, index) => (
          <li
            key={stage}
            className={`flex items-center justify-center gap-2 border-r border-border-subtle px-2 py-3 text-xs font-semibold last:border-r-0 ${index <= activeStage ? 'text-interactive' : 'text-text-muted'}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${index < activeStage ? 'bg-status-success' : index === activeStage ? 'bg-interactive' : 'bg-border-strong'}`}
            />
            {stage}
          </li>
        ))}
      </ol>

      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-mono text-xs text-text-muted">
            <Database className="h-3.5 w-3.5 text-data-fg" />
            Live evidence trace · {props.trace.length} events
            {props.reconnecting && <Badge variant="warning">Reconnecting</Badge>}
          </div>
          <div
            className="flex rounded-lg border border-border-subtle bg-surface-base p-1"
            aria-label="Trace filters"
          >
            {(['all', 'query', 'reasoning'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={props.filter === filter}
                onClick={() => props.onFilter(filter)}
                className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive ${props.filter === filter ? 'bg-surface-hover text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
              >
                {filter === 'query' ? 'Queries' : filter}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-72 space-y-3 rounded-lg border border-border-subtle bg-surface-base p-3">
          {visibleEvents.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-surface-panel">
                <Database className="h-5 w-5 text-data-fg" />
              </span>
              <p className="text-sm font-bold text-text-primary">Forensic pipeline ready</p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-text-muted">
                Run this case to stream real MCP calls, SQL, query results, reasoning, Vision
                evidence, and the grounded conclusion.
              </p>
            </div>
          ) : (
            visibleEvents.map((event, index) => (
              <InvestigationEventItem
                key={`${event.timestamp}-${event.type}-${index}`}
                event={event}
              />
            ))
          )}
        </div>

        {props.finalDiagnosis && (
          <div className="mt-4">
            <GroundedDiagnosisCard
              diagnosis={props.finalDiagnosis}
              grounding={props.grounding}
              remediation={props.remediation}
              remediationLoading={props.remediationLoading}
              remediationApproving={props.remediationApproving}
              remediationError={props.remediationError}
              onApproveRemediation={props.onApproveRemediation}
              onRefreshRemediation={props.onRefreshRemediation}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
