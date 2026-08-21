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
  neutral: 'text-text-secondary',
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
        className={`min-w-0 p-5 border-l border-border-subtle max-lg:border-t max-lg:border-l-0 ${className}`}
      >
        <div className="flex items-center justify-between text-compact font-mono uppercase tracking-label text-text-muted">
          <span>{label}</span>
          {icon ? (
            <span
              aria-hidden="true"
              className="grid size-6.25 place-items-center rounded-md bg-surface-card text-text-muted"
            >
              {icon}
            </span>
          ) : null}
        </div>
        {loading ? (
          <div
            className="my-1.5 h-6 w-28 animate-pulse rounded bg-surface-hover"
            aria-hidden="true"
          />
        ) : (
          <div
            className={`mt-3 font-mono text-metric font-semibold leading-none tracking-metric ${toneValueClasses[tone]}`}
          >
            {value ?? '—'}
          </div>
        )}
        <div className="mt-2.5 flex min-w-0 items-center justify-between gap-2 text-compact">
          <span className="truncate text-text-muted">{detail}</span>
          {tag ? <span className="shrink-0 font-semibold text-text-secondary">{tag}</span> : null}
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
        <p className="font-mono text-compact uppercase tracking-label text-text-muted">{label}</p>
        {icon ? (
          <span
            aria-hidden="true"
            className="grid size-6.25 place-items-center rounded-md bg-surface-card text-text-muted"
          >
            {icon}
          </span>
        ) : null}
      </div>
      {loading ? (
        <div className="mt-2 h-5 w-24 animate-pulse rounded bg-surface-hover" aria-hidden="true" />
      ) : (
        <p
          className={`mt-2 font-mono text-lg font-semibold tracking-tight ${toneValueClasses[tone]}`}
        >
          {value ?? '—'}
        </p>
      )}
      {!loading && (detail || tag) ? (
        <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2 text-compact">
          {detail ? <span className="truncate text-text-muted">{detail}</span> : null}
          {tag ? <span className="shrink-0 font-semibold text-text-secondary">{tag}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
