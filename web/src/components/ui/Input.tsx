import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  icon,
  iconRight,
  className = '',
  disabled,
  ...props
}) => {
  return (
    <div className="relative flex items-center w-full">
      {icon && (
        <span className="absolute left-3 text-text-muted flex items-center pointer-events-none">
          {icon}
        </span>
      )}
      <input
        disabled={disabled}
        className={`w-full bg-surface-scrim text-text-primary placeholder:text-text-muted border border-border-subtle rounded-md py-1.5 px-3 text-xs font-mono transition-colors duration-fast focus:outline-hidden focus:border-interactive focus:ring-1 focus:ring-interactive-border disabled:opacity-50 ${
          icon ? 'pl-8' : ''
        } ${iconRight ? 'pr-8' : ''} ${className}`}
        {...props}
      />
      {iconRight && (
        <span className="absolute right-3 text-text-muted flex items-center pointer-events-none">
          {iconRight}
        </span>
      )}
    </div>
  );
};
