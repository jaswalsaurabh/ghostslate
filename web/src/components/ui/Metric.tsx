import type { ReactNode } from 'react';
import { Tooltip } from './Tooltip.js';

export type MetricTone = 'neutral' | 'critical' | 'warning' | 'success' | 'interactive';

export interface MetricProps {
  label: string;
  value?: ReactNode;
  detail?: ReactNode;
  detailTooltip?: ReactNode;
  tag?: ReactNode;
  tagTooltip?: ReactNode;
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
  detailTooltip,
  tag,
  tagTooltip,
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
        className={`min-w-0 p-4 sm:px-6 sm:py-4.5 ${className}`}
      >
        <div className="flex items-center justify-between font-mono text-forensic-meta font-bold uppercase tracking-label text-text-muted">
          <span>{label}</span>
          {icon ? (
            <span
              aria-hidden="true"
              className="grid size-6 place-items-center rounded-md bg-surface-card text-text-muted"
            >
              {icon}
            </span>
          ) : null}
        </div>
        {loading ? (
          <div
            className="my-2 h-7 w-28 animate-pulse rounded bg-surface-hover"
            aria-hidden="true"
          />
        ) : (
          <div
            className={`mt-2 font-mono text-xl sm:text-metric font-bold leading-none tracking-metric ${toneValueClasses[tone]}`}
          >
            {value ?? '—'}
          </div>
        )}
        <div className="mt-2.5 flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1 font-sans text-section">
          {detail ? (
            <Tooltip content={detailTooltip ?? detail} placement="top">
              <span className="truncate text-text-muted cursor-help underline decoration-dotted decoration-border-strong/60 underline-offset-2 hover:decoration-border-strong hover:text-text-primary transition-colors duration-fast">
                {detail}
              </span>
            </Tooltip>
          ) : (
            <span className="truncate text-text-muted" />
          )}
          {tag ? (
            tagTooltip ? (
              <Tooltip content={tagTooltip} placement="top">
                <span className="shrink-0 font-mono text-forensic-meta font-bold uppercase text-text-secondary cursor-help">
                  {tag}
                </span>
              </Tooltip>
            ) : (
              <span className="shrink-0 font-mono text-forensic-meta font-bold uppercase text-text-secondary">
                {tag}
              </span>
            )
          ) : null}
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
        <p className="font-mono text-forensic-meta font-bold uppercase tracking-label text-text-muted">
          {label}
        </p>
        {icon ? (
          <span
            aria-hidden="true"
            className="grid size-6 place-items-center rounded-md bg-surface-card text-text-muted"
          >
            {icon}
          </span>
        ) : null}
      </div>
      {loading ? (
        <div className="mt-2 h-5 w-24 animate-pulse rounded bg-surface-hover" aria-hidden="true" />
      ) : (
        <p className={`mt-2 font-mono text-lg font-bold tracking-tight ${toneValueClasses[tone]}`}>
          {value ?? '—'}
        </p>
      )}
      {!loading && (detail || tag) ? (
        <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2 font-sans text-section">
          {detail ? (
            <Tooltip content={detailTooltip ?? detail} placement="top">
              <span className="truncate text-text-muted cursor-help underline decoration-dotted decoration-border-strong/60 underline-offset-2 hover:decoration-border-strong hover:text-text-primary transition-colors duration-fast">
                {detail}
              </span>
            </Tooltip>
          ) : null}
          {tag ? (
            tagTooltip ? (
              <Tooltip content={tagTooltip} placement="top">
                <span className="shrink-0 font-mono text-forensic-meta font-bold uppercase text-text-secondary cursor-help">
                  {tag}
                </span>
              </Tooltip>
            ) : (
              <span className="shrink-0 font-mono text-forensic-meta font-bold uppercase text-text-secondary">
                {tag}
              </span>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
