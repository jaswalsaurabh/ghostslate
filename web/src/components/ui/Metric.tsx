import type { ReactNode } from 'react';

export type MetricTone = 'neutral' | 'critical' | 'warning' | 'success' | 'interactive';

export interface MetricProps {
  label: string;
  value?: ReactNode;
  detail?: ReactNode;
  tag?: ReactNode;
  icon?: ReactNode;
  tone?: MetricTone;
  variant?: 'card' | 'panel' | 'column';
  loading?: boolean;
  className?: string;
}

const toneValueClasses: Record<MetricTone, string> = {
  neutral: 'text-text-primary',
  critical: 'text-status-critical',
  warning: 'text-status-warning',
  success: 'text-status-success',
  interactive: 'text-interactive',
};

const toneBorderClasses: Record<MetricTone, string> = {
  neutral: 'border-border-subtle',
  critical: 'border-status-critical-border',
  warning: 'border-status-warning-border',
  success: 'border-status-success-border',
  interactive: 'border-interactive-border',
};

export function Metric({
  label,
  value,
  detail,
  tag,
  icon,
  tone = 'neutral',
  variant = 'column',
  loading = false,
  className = '',
}: MetricProps) {
  if (variant === 'column') {
    return (
      <section
        aria-busy={loading || undefined}
        className={`min-w-0 border-t border-border-subtle p-4 sm:border-l sm:border-t-0 ${className}`}
      >
        <div className="mb-3 flex items-center justify-between text-text-muted">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
            {label}
          </span>
          {icon}
        </div>
        {loading ? (
          <div
            className="my-1 h-8 w-28 animate-pulse rounded bg-surface-hover"
            aria-hidden="true"
          />
        ) : (
          <div className={`font-mono text-2xl font-bold tracking-tight ${toneValueClasses[tone]}`}>
            {value ?? '—'}
          </div>
        )}
        <div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-xs">
          <span className="truncate text-text-secondary">{detail}</span>
          {tag ? <span className="shrink-0 font-mono text-text-muted">{tag}</span> : null}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-busy={loading || undefined}
      className={`min-w-0 rounded-lg border bg-surface-panel p-3 shadow-sm ${toneBorderClasses[tone]} ${className}`}
    >
      <div className="flex items-center justify-between text-text-muted">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </p>
        {icon}
      </div>
      {loading ? (
        <div className="mt-2 h-5 w-24 animate-pulse rounded bg-surface-hover" aria-hidden="true" />
      ) : (
        <p className={`mt-1 font-mono text-lg font-bold tracking-tight ${toneValueClasses[tone]}`}>
          {value ?? '—'}
        </p>
      )}
      {!loading && (detail || tag) ? (
        <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs">
          {detail ? <span className="truncate text-text-secondary">{detail}</span> : null}
          {tag ? <span className="shrink-0 font-mono text-text-muted">{tag}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
