import { useState } from 'react';
import { AlertOctagon, Check, Copy, Database, Eye } from 'lucide-react';
import type { InvestigationTraceEvent } from '../../types.js';
import { ClickHouseResultViewer } from '../ClickHouseResultViewer.js';
import { Button } from '../ui/index.js';

function eventTime(timestamp: string) {
  return timestamp.split('T')[1]?.slice(0, 8) ?? '';
}

function SqlDisclosure({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <details className="group mt-2 overflow-hidden rounded-md border border-status-success-border/40 bg-status-success-surface/40">
      <summary className="flex cursor-pointer select-none items-center justify-between px-2.5 py-1.5 font-sans text-forensic-meta font-bold text-status-success">
        <span>Executed SQL</span>
        <span className="font-normal text-text-muted group-open:hidden">Show</span>
        <span className="hidden font-normal text-text-muted group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-border-subtle bg-surface-base/80 p-2.5">
        <div className="mb-1.5 flex justify-end">
          <Button
            onClick={() => void copy()}
            variant="secondary"
            size="sm"
            aria-live="polite"
            className="font-sans text-xs"
            icon={
              copied ? (
                <Check aria-hidden="true" className="size-3.5 text-status-success" />
              ) : (
                <Copy aria-hidden="true" className="size-3.5" />
              )
            }
          >
            {copied ? 'Copied' : 'Copy SQL'}
          </Button>
        </div>
        <pre className="m-0 max-h-48 overflow-auto font-mono text-forensic-code leading-relaxed text-text-primary whitespace-pre-wrap">
          {sql}
        </pre>
      </div>
    </details>
  );
}

export function TraceToolEvent({
  event,
}: {
  event: Extract<InvestigationTraceEvent, { type: 'tool_call' | 'tool_result' | 'vision_call' }>;
}) {
  const time = eventTime(event.timestamp);

  if (event.type === 'vision_call') {
    const { name, args } = event.data;
    return (
      <article className="evidence-event-grid py-2.5 border-t border-border-subtle">
        <span className="grid size-6 place-items-center rounded-md bg-interactive-surface text-interactive shrink-0 mt-0.5">
          <Eye className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-2 font-sans text-forensic-heading font-bold text-text-primary">
            <span>Vision tool · {name}</span>
            <span className="font-mono text-forensic-meta font-normal text-text-muted">
              <time dateTime={event.timestamp}>{time}</time> · {String(args.video_file ?? '')} @{' '}
              {String(args.timestamp_seconds ?? '')}s
            </span>
          </div>
          <p className="m-0 font-sans text-forensic-meta leading-evidence text-text-secondary">
            Gemini Vision sampled multimodal frame for visual anomaly detection.
          </p>
        </div>
      </article>
    );
  }

  if (event.type === 'tool_call') {
    const { name, args } = event.data;
    const sql = typeof args.query === 'string' ? args.query : null;
    return (
      <article className="evidence-event-grid py-2.5 border-t border-border-subtle">
        <span className="grid size-6 place-items-center rounded-md bg-status-success-surface text-status-success shrink-0 mt-0.5">
          <Database className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-2 font-sans text-forensic-heading font-bold text-text-primary">
            <span>MCP tool · {name}</span>
            <span className="font-mono text-forensic-meta font-normal text-text-muted">
              <time dateTime={event.timestamp}>{time}</time> · mcp-clickhouse
            </span>
          </div>
          {sql ? (
            <SqlDisclosure sql={sql} />
          ) : (
            <p className="m-0 font-mono text-forensic-code text-text-muted">
              Arguments · {JSON.stringify(args)}
            </p>
          )}
        </div>
      </article>
    );
  }

  const { name, sql, result, isError, durationMs, rowsReturned, rowsScanned } = event.data;

  if (isError) {
    return (
      <article className="evidence-event-grid py-2.5 border-t border-border-subtle" role="alert">
        <span className="grid size-6 place-items-center rounded-md bg-status-critical-surface text-status-critical shrink-0 mt-0.5">
          <AlertOctagon className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-2 font-sans text-forensic-heading font-bold text-status-critical">
            <span>{name} failed</span>
            <time
              dateTime={event.timestamp}
              className="font-mono text-forensic-meta font-normal text-status-critical"
            >
              {time}
            </time>
          </div>
          <pre className="m-0 overflow-auto font-mono text-forensic-code text-status-critical whitespace-pre-wrap">
            {String(result ?? 'Unknown error')}
          </pre>
        </div>
      </article>
    );
  }

  if (name === 'finalize_investigation') {
    return (
      <article className="evidence-event-grid py-2.5 border-t border-border-subtle">
        <span className="grid size-6 place-items-center rounded-md bg-status-success-surface text-status-success shrink-0 mt-0.5">
          <Check className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-2 font-sans text-forensic-heading font-bold text-status-success">
            <span>MCP tool · finalize_investigation</span>
            <span className="font-mono text-forensic-meta font-normal text-text-muted">
              <time dateTime={event.timestamp}>{time}</time> ·{' '}
              {durationMs ? `${durationMs} ms` : 'completed'}
            </span>
          </div>
          <p className="m-0 font-sans text-forensic-meta leading-evidence text-text-secondary">
            Grounding completed. Every numeric claim maps to returned ClickHouse evidence.
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="evidence-event-grid py-2.5 border-t border-border-subtle">
      <span className="grid size-6 place-items-center rounded-md bg-status-success-surface text-status-success shrink-0 mt-0.5">
        <Database className="size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="mb-1 flex items-center justify-between gap-2 font-sans text-forensic-heading font-bold text-text-primary">
          <span>MCP query completed · {name}</span>
          <span className="font-mono text-forensic-meta font-normal text-text-muted">
            <time dateTime={event.timestamp}>{time}</time>
            {durationMs ? ` · ${durationMs} ms` : ''}
          </span>
        </div>
        {sql && name !== 'run_query' && <SqlDisclosure sql={sql} />}
        <ClickHouseResultViewer
          rawResult={String(result ?? '')}
          durationMs={typeof durationMs === 'number' ? durationMs : undefined}
          rowsReturned={typeof rowsReturned === 'number' ? rowsReturned : undefined}
          rowsScanned={typeof rowsScanned === 'number' ? rowsScanned : undefined}
        />
      </div>
    </article>
  );
}
