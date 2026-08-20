import React from 'react';

export type CardVariant = 'panel' | 'card' | 'elevated' | 'scrim' | 'data';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  glow?: boolean | 'interactive' | 'critical' | 'success';
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'card',
  glow = false,
  hoverable = false,
  className = '',
  ...props
}) => {
  const baseClasses = 'rounded-xl transition-all duration-base';

  const variantClasses: Record<CardVariant, string> = {
    panel: 'bg-surface-panel backdrop-blur-md border border-border-subtle shadow-md',
    card: 'bg-surface-card border border-border-subtle',
    elevated: 'bg-surface-panel border border-border-strong shadow-lg',
    scrim: 'bg-surface-scrim border border-border-subtle backdrop-blur-sm',
    data: 'bg-data-surface border border-data-border',
  };

  const hoverClasses = hoverable ? 'hover:bg-surface-hover hover:border-border-strong' : '';

  const glowClasses =
    glow === true || glow === 'interactive'
      ? 'shadow-glow-interactive border-interactive-border'
      : glow === 'critical'
        ? 'shadow-glow-critical border-status-critical-border'
        : glow === 'success'
          ? 'shadow-glow-success border-status-success-border'
          : '';

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${hoverClasses} ${glowClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
