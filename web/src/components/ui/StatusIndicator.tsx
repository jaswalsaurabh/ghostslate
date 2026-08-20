import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type StatusTone = 'idle' | 'ready' | 'running' | 'success' | 'warning' | 'error';

export interface StatusIndicatorProps {
  label: string;
  detail?: string;
  tone?: StatusTone;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
}

const toneClasses: Record<StatusTone, string> = {
  idle: 'border-border-subtle bg-surface-card text-text-muted',
  ready: 'border-status-success-border bg-status-success-surface text-status-success',
  running: 'border-interactive-border bg-interactive-surface text-interactive',
  success: 'border-status-success-border bg-status-success-surface text-status-success',
  warning: 'border-status-warning-border bg-status-warning-surface text-status-warning',
  error: 'border-status-critical-border bg-status-critical-surface text-status-critical',
};

const dotClasses: Record<StatusTone, string> = {
  idle: 'bg-text-muted',
  ready: 'bg-status-success',
  running: 'animate-pulse bg-interactive',
  success: 'bg-status-success',
  warning: 'bg-status-warning',
  error: 'bg-status-critical',
};

export function StatusIndicator({
  label,
  detail,
  tone = 'idle',
  icon,
  loading = false,
  className = '',
}: StatusIndicatorProps) {
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-2 rounded-md border px-2.5 font-mono text-xs uppercase tracking-wide ${toneClasses[tone]} ${className}`}
      role="status"
    >
      {icon}
      {loading ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-status-warning" aria-hidden="true" />
      ) : (
        <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dotClasses[tone]}`} />
      )}
      <span>{label}</span>
      {detail ? <span className="text-text-secondary">{detail}</span> : null}
    </span>
  );
}
