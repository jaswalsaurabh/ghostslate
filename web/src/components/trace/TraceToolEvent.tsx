import { useState } from 'react';
import { AlertOctagon, Check, Copy, Eye, Wrench } from 'lucide-react';
import type { InvestigationTraceEvent } from '../../types.js';
import { ClickHouseResultViewer } from '../ClickHouseResultViewer.js';
import { Card, IconButton } from '../ui/index.js';

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
    <div className="rounded-md border border-data-border bg-data-surface">
      <div className="flex items-center justify-between gap-2 border-b border-data-border px-3 py-2">
        <span className="font-mono text-xs font-semibold text-data-fg">Executed SQL</span>
        <IconButton
          label="Copy SQL"
          icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          onClick={() => void copy()}
        />
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed text-text-primary">
        {sql}
      </pre>
    </div>
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
      <Card variant="card" className="flex items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2 text-xs">
          <Eye className="h-4 w-4 text-interactive" />
          <strong className="text-text-primary">Vision tool · {name}</strong>
          <span className="font-mono text-text-muted">
            {String(args.video_file ?? '')} @ {String(args.timestamp_seconds ?? '')}s
          </span>
        </div>
        <time className="shrink-0 font-mono text-xs text-text-muted">
          {eventTime(event.timestamp)}
        </time>
      </Card>
    );
  }

  if (event.type === 'tool_call') {
    const { name, args } = event.data;
    const sql = typeof args.query === 'string' ? args.query : null;
    return (
      <Card variant="card" className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <Wrench className="h-4 w-4 text-interactive" />
            <strong className="text-text-primary">MCP tool · {name}</strong>
          </div>
          <time className="font-mono text-xs text-text-muted">{eventTime(event.timestamp)}</time>
        </div>
        {sql ? (
          <SqlDisclosure sql={sql} />
        ) : (
          <p className="font-mono text-xs text-text-muted">Arguments · {JSON.stringify(args)}</p>
        )}
      </Card>
    );
  }

  const { name, sql, result, isError, durationMs, rowsReturned, rowsScanned } = event.data;

  if (isError) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-status-critical-border bg-status-critical-surface p-3 text-xs text-status-critical"
      >
        <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <strong>{name} failed</strong>
          <pre className="mt-1 whitespace-pre-wrap font-mono">
            {String(result ?? 'Unknown error')}
          </pre>
        </div>
      </div>
    );
  }

  if (name === 'finalize_investigation') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-status-success-border bg-status-success-surface p-3 text-xs">
        <span className="flex items-center gap-2 font-semibold text-status-success">
          <Check className="h-4 w-4" />
          MCP tool · finalize_investigation
        </span>
        <span className="font-mono text-text-muted">{durationMs ?? '—'} ms</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sql && name !== 'run_query' && <SqlDisclosure sql={sql} />}
      <ClickHouseResultViewer
        rawResult={String(result ?? '')}
        durationMs={typeof durationMs === 'number' ? durationMs : undefined}
        rowsReturned={typeof rowsReturned === 'number' ? rowsReturned : undefined}
        rowsScanned={typeof rowsScanned === 'number' ? rowsScanned : undefined}
      />
    </div>
  );
}
