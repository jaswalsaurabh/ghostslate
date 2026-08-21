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
  idle: 'border-border-subtle bg-surface-panel text-text-secondary',
  ready: 'border-border-subtle bg-surface-panel text-text-secondary',
  running: 'border-interactive-border bg-interactive-surface text-interactive',
  success: 'border-border-subtle bg-surface-panel text-text-secondary',
  warning: 'border-status-warning-border bg-status-warning-surface text-status-warning',
  error: 'border-status-critical-border bg-status-critical-surface text-status-critical',
};

const dotClasses: Record<StatusTone, string> = {
  idle: 'bg-text-muted shadow-text-muted-halo',
  ready: 'motion-safe:animate-pulse bg-status-success shadow-status-success-halo',
  running: 'motion-safe:animate-pulse bg-interactive shadow-interactive-halo',
  success: 'bg-status-success shadow-status-success-halo',
  warning: 'motion-safe:animate-pulse bg-status-warning shadow-status-warning-halo',
  error: 'bg-status-critical shadow-status-critical-halo',
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
      className={`inline-flex h-8.5 items-center gap-1.75 rounded-md border px-2.5 font-mono text-compact uppercase tracking-micro select-none ${toneClasses[tone]} ${className}`}
      role="status"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-status-warning" aria-hidden="true" />
      ) : icon ? (
        icon
      ) : (
        <span
          aria-hidden="true"
          className={`size-1.75 shrink-0 rounded-full ${dotClasses[tone]}`}
        />
      )}
      <span>{label}</span>
      {detail ? <span className="text-text-secondary">{detail}</span> : null}
    </span>
  );
}
