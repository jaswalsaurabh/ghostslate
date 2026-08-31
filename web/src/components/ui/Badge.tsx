import React from 'react';

export type BadgeVariant =
  | 'primary'
  | 'critical'
  | 'warning'
  | 'success'
  | 'reasoning'
  | 'neutral'
  | 'data';

export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  pulse?: boolean;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'sm',
  pulse = false,
  icon,
  className = '',
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center font-mono font-semibold tracking-wide rounded border select-none whitespace-nowrap shrink-0';

  const sizeClasses: Record<BadgeSize, string> = {
    sm: 'text-xs px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  };

  const variantClasses: Record<BadgeVariant, string> = {
    primary: 'bg-interactive-surface text-interactive border-interactive-border',
    critical: 'bg-status-critical-surface text-status-critical border-status-critical-border',
    warning: 'bg-status-warning-surface text-status-warning border-status-warning-border',
    success: 'bg-status-success-surface text-status-success border-status-success-border',
    reasoning: 'bg-reasoning-surface text-reasoning-fg border-reasoning-border',
    neutral: 'bg-surface-card text-text-secondary border-border-subtle',
    data: 'bg-data-surface text-data-fg border-data-border',
  };

  const pulseColorClasses: Record<BadgeVariant, string> = {
    primary: 'bg-interactive',
    critical: 'bg-status-critical',
    warning: 'bg-status-warning',
    success: 'bg-status-success',
    reasoning: 'bg-reasoning-fg',
    neutral: 'bg-text-secondary',
    data: 'bg-data-fg',
  };

  return (
    <span
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${pulse ? 'animate-pulse' : ''} ${className}`}
      {...props}
    >
      {pulse && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pulseColorClasses[variant]}`} />
      )}
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      {children}
    </span>
  );
};
