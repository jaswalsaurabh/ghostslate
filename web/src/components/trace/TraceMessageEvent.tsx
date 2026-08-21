import { AlertOctagon, Database, Sparkles, Terminal } from 'lucide-react';
import type { InvestigationTraceEvent } from '../../types.js';

export function TraceMessageEvent({
  event,
}: {
  event: Extract<InvestigationTraceEvent, { type: 'status' | 'reasoning' | 'error' }>;
}) {
  const time = event.timestamp.split('T')[1]?.slice(0, 8) ?? '';

  if (event.type === 'error') {
    return (
      <article className="evidence-event-grid py-2.5 border-t border-border-subtle" role="alert">
        <span className="grid size-6 place-items-center rounded-md bg-status-critical-surface text-status-critical shrink-0 mt-0.5">
          <AlertOctagon className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-2 font-sans text-forensic-heading font-bold text-status-critical">
            <span>Investigation error</span>
            <time
              dateTime={event.timestamp}
              className="font-mono text-forensic-meta font-normal text-status-critical"
            >
              {time}
            </time>
          </div>
          <p className="m-0 font-mono text-forensic-code text-status-critical">
            {String(event.data?.error ?? 'Unknown error')}
          </p>
        </div>
      </article>
    );
  }

  if (event.type === 'reasoning') {
    const text = String(
      event.data?.hypothesis ?? event.data?.message ?? event.data?.text ?? 'Reasoning update',
    );
    const turn = event.data?.turn;
    return (
      <article className="evidence-event-grid py-2.5 border-t border-border-subtle">
        <span className="grid size-6 place-items-center rounded-md bg-reasoning-surface text-reasoning-fg shrink-0 mt-0.5">
          <Sparkles className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between gap-2.5 font-sans text-forensic-heading font-bold text-text-primary">
            <span>{turn === 1 ? 'Working hypothesis stated' : 'Hypothesis narrowed'}</span>
            <span className="font-mono text-forensic-meta font-normal text-text-muted">
              <time dateTime={event.timestamp}>{time}</time> ·{' '}
              {turn ? `Gemini turn ${turn}` : 'Gemini reasoning'}
            </span>
          </div>
          <p className="m-0 font-sans text-forensic-body leading-evidence text-text-secondary">
            {text}
          </p>
        </div>
      </article>
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
