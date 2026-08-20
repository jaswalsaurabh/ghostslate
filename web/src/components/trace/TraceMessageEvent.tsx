import { AlertOctagon, Brain, Database, Terminal } from 'lucide-react';
import type { InvestigationTraceEvent } from '../../types.js';

export function TraceMessageEvent({
  event,
}: {
  event: Extract<InvestigationTraceEvent, { type: 'status' | 'reasoning' | 'error' }>;
}) {
  const time = event.timestamp.split('T')[1]?.slice(0, 8) ?? '';
  if (event.type === 'error') {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-status-critical-border bg-status-critical-surface p-3 text-xs text-status-critical"
      >
        <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <strong>Investigation error</strong>
          <p className="mt-1 font-mono">{String(event.data?.error ?? 'Unknown error')}</p>
        </div>
      </div>
    );
  }

  if (event.type === 'reasoning') {
    const text = String(
      event.data?.hypothesis ?? event.data?.message ?? event.data?.text ?? 'Reasoning update',
    );
    return (
      <article className="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-reasoning-border bg-reasoning-surface p-3">
        <Brain className="mt-0.5 h-4 w-4 text-reasoning-fg" />
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <strong className="text-reasoning-fg">Narrowing hypothesis</strong>
            <span className="font-mono text-text-muted">
              {time} · turn {String(event.data?.turn ?? '—')}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-text-primary">{text}</p>
        </div>
      </article>
    );
  }

  const message = String(event.data?.message ?? 'Pipeline status updated');
  const connecting =
    message.toLowerCase().includes('mcp') || message.toLowerCase().includes('connecting');
  return (
    <div className="grid grid-cols-[4.5rem_auto_1fr] items-center gap-2 py-1 text-xs">
      <time className="font-mono text-text-muted">{time}</time>
      {connecting ? (
        <Database className="h-3.5 w-3.5 text-data-fg" />
      ) : (
        <Terminal className="h-3.5 w-3.5 text-interactive" />
      )}
      <span className="text-text-secondary">{message}</span>
    </div>
  );
}
