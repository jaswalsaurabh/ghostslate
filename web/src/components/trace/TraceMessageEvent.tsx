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
        <time className="pt-0.5 font-mono text-caption text-text-muted">{time}</time>
        <span className="grid size-6 place-items-center rounded-md bg-status-critical-surface text-status-critical shrink-0">
          <AlertOctagon className="size-3" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="mt-0.5 mb-1 text-detail font-bold text-status-critical">
            Investigation error
          </div>
          <p className="m-0 font-mono text-compact text-status-critical">
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
        <time className="pt-0.5 font-mono text-caption text-text-muted">{time}</time>
        <span className="grid size-6 place-items-center rounded-md bg-reasoning-surface text-reasoning-fg shrink-0">
          <Sparkles className="size-3" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="mt-0.5 mb-1.5 flex items-center justify-between gap-2.5 text-detail font-bold text-text-primary">
            <span>{turn === 1 ? 'Working hypothesis stated' : 'Hypothesis narrowed'}</span>
            <span className="font-mono text-caption font-normal text-text-muted">
              {turn ? `Gemini turn ${turn}` : 'Gemini reasoning'}
            </span>
          </div>
          <p className="m-0 text-compact leading-evidence text-text-secondary">{text}</p>
        </div>
      </article>
    );
  }

  const message = String(event.data?.message ?? 'Pipeline status updated');
  const isConnecting =
    message.toLowerCase().includes('mcp') || message.toLowerCase().includes('connecting');

  return (
    <article className="evidence-event-grid py-2.5 border-t border-border-subtle">
      <time className="pt-0.5 font-mono text-caption text-text-muted">{time}</time>
      <span className="grid size-6 place-items-center rounded-md bg-surface-card text-text-secondary shrink-0">
        {isConnecting ? (
          <Database className="size-3 text-data-fg" aria-hidden="true" />
        ) : (
          <Terminal className="size-3 text-interactive" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0">
        <p className="m-0 mt-0.5 text-compact leading-evidence text-text-secondary">{message}</p>
      </div>
    </article>
  );
}
