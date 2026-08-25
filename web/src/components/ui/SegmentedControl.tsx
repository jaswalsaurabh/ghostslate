import type { ReactNode } from 'react';

export interface SegmentedControlOption<Value extends string> {
  value: Value;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<Value extends string> {
  label: string;
  options: readonly SegmentedControlOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onValueChange,
  size = 'md',
  className = '',
}: SegmentedControlProps<Value>) {
  const sizeClass = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs';

  return (
    <div
      aria-label={label}
      className={`inline-flex gap-0.5 rounded-md border border-border-subtle bg-surface-card p-1 ${className}`}
      role="group"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            className={`${sizeClass} rounded-sm font-semibold transition-[background-color,box-shadow,color] duration-fast hover:shadow-border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? 'bg-surface-panel text-text-primary shadow-sm'
                : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
            }`}
            onClick={() => onValueChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
