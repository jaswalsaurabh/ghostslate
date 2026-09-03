import { AlertOctagon, Database, Sparkles, Terminal } from 'lucide-react';
import type { InvestigationTraceEvent } from '../../types.js';
import { TraceEventShell, eventTime } from './TraceEventShell.js';

export function TraceMessageEvent({
  event,
}: {
  event: Extract<InvestigationTraceEvent, { type: 'status' | 'reasoning' | 'error' }>;
}) {
  const time = eventTime(event.timestamp);

  if (event.type === 'error') {
    return (
      <TraceEventShell
        icon={<AlertOctagon className="size-3.5" aria-hidden="true" />}
        iconClassName="bg-status-critical-surface text-status-critical"
        timestamp={event.timestamp}
        title="Investigation error"
        role="alert"
        titleClassName="text-status-critical"
        timeClassName="text-status-critical"
      >
        <p className="m-0 font-mono text-forensic-code text-status-critical">
          {String(event.data?.error ?? 'Unknown error')}
        </p>
      </TraceEventShell>
    );
  }

  if (event.type === 'reasoning') {
    const text = String(
      event.data?.hypothesis ?? event.data?.message ?? event.data?.text ?? 'Reasoning update',
    );
    const turn = event.data?.turn;
    return (
      <TraceEventShell
        icon={<Sparkles className="size-3.5" aria-hidden="true" />}
        iconClassName="bg-reasoning-surface text-reasoning-fg"
        timestamp={event.timestamp}
        title={turn === 1 ? 'Working hypothesis stated' : 'Hypothesis narrowed'}
        meta={turn ? `Gemini turn ${turn}` : 'Gemini reasoning'}
      >
        <p className="m-0 font-sans text-forensic-body leading-evidence text-text-secondary">
          {text}
        </p>
      </TraceEventShell>
    );
  }

  const message = String(event.data?.message ?? 'Pipeline status updated');
  const isConnecting =
    message.toLowerCase().includes('mcp') || message.toLowerCase().includes('connecting');

  return (
    <article className="evidence-event-grid py-2.5 border-t border-border-subtle">
      <span className="grid size-6 place-items-center rounded-md bg-surface-card text-text-secondary shrink-0 mt-0.5">
        {isConnecting ? (
          <Database className="size-3.5 text-data-fg" aria-hidden="true" />
        ) : (
          <Terminal className="size-3.5 text-interactive" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex items-center justify-between gap-2">
        <p className="m-0 font-sans text-forensic-body leading-evidence text-text-secondary">
          {message}
        </p>
        <time
          dateTime={event.timestamp}
          className="shrink-0 font-mono text-forensic-meta text-text-muted"
        >
          {time}
        </time>
      </div>
    </article>
  );
}
