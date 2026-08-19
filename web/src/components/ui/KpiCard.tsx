import React from 'react';

export type KpiVariant = 'critical' | 'warning' | 'success' | 'interactive' | 'neutral';

export interface KpiCardProps {
  label: string;
  value: string;
  subtext?: string;
  variant?: KpiVariant;
  icon?: React.ReactNode;
  valueTag?: React.ReactNode;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subtext,
  variant = 'neutral',
  icon,
  valueTag,
}) => {
  const accentBorderClasses: Record<KpiVariant, string> = {
    critical: 'border-l-status-critical',
    warning: 'border-l-status-warning',
    success: 'border-l-status-success',
    interactive: 'border-l-interactive',
    neutral: 'border-l-border-strong',
  };

  const iconWrapClasses: Record<KpiVariant, string> = {
    critical: 'text-status-critical bg-status-critical-surface border-status-critical-border',
    warning: 'text-status-warning bg-status-warning-surface border-status-warning-border',
    success: 'text-status-success bg-status-success-surface border-status-success-border',
    interactive: 'text-interactive bg-interactive-surface border-interactive-border',
    neutral: 'text-text-muted bg-surface-card border-border-subtle',
  };

  return (
    <div
      className={`bg-surface-panel backdrop-blur-md border border-border-subtle border-l-4 ${accentBorderClasses[variant]} rounded-lg p-3.5 flex items-center justify-between gap-3 shadow-sm hover:-translate-y-0.5 transition-transform duration-fast`}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-0.5">
          {label}
        </span>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-lg font-extrabold font-mono text-text-primary tracking-tight">
            {value}
          </span>
          {valueTag && <span className="text-xs font-semibold">{valueTag}</span>}
        </div>
        {subtext && (
          <span className="text-[11px] text-text-secondary mt-0.5 truncate">{subtext}</span>
        )}
      </div>

      {icon && (
        <div
          className={`w-9 h-9 rounded-md flex items-center justify-center border shrink-0 ${iconWrapClasses[variant]}`}
        >
          {icon}
        </div>
      )}
    </div>
  );
};
