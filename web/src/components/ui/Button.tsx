import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant =
  'primary' | 'secondary' | 'critical' | 'warning' | 'success' | 'ghost' | 'outline';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  icon,
  iconRight,
  className = '',
  ...props
}) => {
  // Base classes with semantic tokens
  const baseClasses =
    'inline-flex items-center justify-center font-bold tracking-tight rounded-md transition-all duration-fast cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base';

  // Variant mappings using semantic classes only
  const variantClasses: Record<ButtonVariant, string> = {
    primary: 'bg-interactive hover:brightness-110 text-interactive-fg shadow-glow-interactive',
    secondary:
      'bg-surface-card hover:bg-surface-hover text-text-primary border border-border-subtle hover:border-interactive-border',
    critical:
      'bg-status-critical-surface hover:bg-status-critical-subtle text-status-critical border border-status-critical-border hover:shadow-glow-critical',
    warning:
      'bg-status-warning-surface hover:bg-status-warning-subtle text-status-warning border border-status-warning-border',
    success:
      'bg-status-success-surface hover:bg-status-success-subtle text-status-success border border-status-success-border',
    ghost: 'bg-transparent hover:bg-surface-hover text-text-secondary hover:text-text-primary',
    outline: 'bg-transparent border border-border-strong text-text-primary hover:bg-surface-hover',
  };

  // Size mappings
  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'text-xs px-2.5 py-1 gap-1.5',
    md: 'text-xs px-3.5 py-2 gap-2',
    lg: 'text-sm px-4.5 py-2.5 gap-2.5',
    icon: 'size-8 p-1.5 text-xs',
  };

  return (
    <button
      aria-busy={loading || undefined}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || loading}
      type="button"
      {...props}
    >
      {loading ? (
        <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin shrink-0" />
      ) : (
        icon && <span className="shrink-0 flex items-center">{icon}</span>
      )}
      {children && <span>{children}</span>}
      {!loading && iconRight && <span className="shrink-0 flex items-center">{iconRight}</span>}
    </button>
  );
};
