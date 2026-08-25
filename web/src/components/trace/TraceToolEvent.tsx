import { useState } from 'react';
import { AlertOctagon, Check, Copy, Database, Eye } from 'lucide-react';
import type { InvestigationTraceEvent } from '../../types.js';
import { ClickHouseResultViewer } from '../ClickHouseResultViewer.js';
import { Button } from '../ui/index.js';
import { TraceEventShell } from './TraceEventShell.js';

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
  if (event.type === 'vision_call') {
    const { name, args } = event.data;
    return (
      <TraceEventShell
        icon={<Eye className="size-3.5" aria-hidden="true" />}
        iconClassName="bg-interactive-surface text-interactive"
        timestamp={event.timestamp}
        title={`Vision tool · ${name}`}
        meta={`${String(args.video_file ?? '')} @ ${String(args.timestamp_seconds ?? '')}s`}
      >
        <p className="m-0 font-sans text-forensic-meta leading-evidence text-text-secondary">
          Gemini Vision sampled multimodal frame for visual anomaly detection.
        </p>
      </TraceEventShell>
    );
  }

  if (event.type === 'tool_call') {
    const { name, args } = event.data;
    const sql = typeof args.query === 'string' ? args.query : null;
    return (
      <TraceEventShell
        icon={<Database className="size-3.5" aria-hidden="true" />}
        iconClassName="bg-status-success-surface text-status-success"
        timestamp={event.timestamp}
        title={`MCP tool · ${name}`}
        meta="mcp-clickhouse"
      >
        {sql ? (
          <SqlDisclosure sql={sql} />
        ) : (
          <p className="m-0 font-mono text-forensic-code text-text-muted">
            Arguments · {JSON.stringify(args)}
          </p>
        )}
      </TraceEventShell>
    );
  }

  const { name, sql, result, isError, durationMs, rowsReturned, rowsScanned } = event.data;

  if (isError) {
    return (
      <TraceEventShell
        icon={<AlertOctagon className="size-3.5" aria-hidden="true" />}
        iconClassName="bg-status-critical-surface text-status-critical"
        timestamp={event.timestamp}
        title={`${name} failed`}
        role="alert"
        titleClassName="text-status-critical"
        timeClassName="text-status-critical"
      >
        <pre className="m-0 overflow-auto font-mono text-forensic-code text-status-critical whitespace-pre-wrap">
          {String(result ?? 'Unknown error')}
        </pre>
      </TraceEventShell>
    );
  }

  if (name === 'finalize_investigation') {
    return (
      <TraceEventShell
        icon={<Check className="size-3.5" aria-hidden="true" />}
        iconClassName="bg-status-success-surface text-status-success"
        timestamp={event.timestamp}
        title="MCP tool · finalize_investigation"
        meta={durationMs ? `${durationMs} ms` : 'completed'}
        titleClassName="text-status-success"
      >
        <p className="m-0 font-sans text-forensic-meta leading-evidence text-text-secondary">
          Grounding completed. Every numeric claim maps to returned ClickHouse evidence.
        </p>
      </TraceEventShell>
    );
  }

  return (
    <TraceEventShell
      icon={<Database className="size-3.5" aria-hidden="true" />}
      iconClassName="bg-status-success-surface text-status-success"
      timestamp={event.timestamp}
      title={`MCP query completed · ${name}`}
      meta={durationMs ? `${durationMs} ms` : undefined}
    >
      {sql && name !== 'run_query' && <SqlDisclosure sql={sql} />}
      <ClickHouseResultViewer
        rawResult={String(result ?? '')}
        durationMs={typeof durationMs === 'number' ? durationMs : undefined}
        rowsReturned={typeof rowsReturned === 'number' ? rowsReturned : undefined}
        rowsScanned={typeof rowsScanned === 'number' ? rowsScanned : undefined}
      />
    </TraceEventShell>
  );
}
