import type { ChangeEvent, ReactNode } from 'react';

export interface SelectOption<Value extends string> {
  value: Value;
  label: ReactNode;
  disabled?: boolean;
}

export interface SelectProps<Value extends string> {
  label: string;
  options: readonly SelectOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  layout?: 'stacked' | 'inline';
}

export function Select<Value extends string>({
  label,
  options,
  value,
  onValueChange,
  description,
  disabled = false,
  className = '',
  layout = 'stacked',
}: SelectProps<Value>) {
  const descriptionId =
    description && layout === 'stacked'
      ? `${label.toLowerCase().replace(/\s+/g, '-')}-description`
      : undefined;
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onValueChange(event.currentTarget.value as Value);
  };

  return (
    <label
      className={`inline-flex ${
        layout === 'inline' ? 'min-w-0 flex-row items-center gap-2' : 'min-w-52 flex-col gap-1'
      } ${className}`}
    >
      <span className="shrink-0 font-mono text-forensic-meta font-bold uppercase tracking-label text-text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={handleChange}
        disabled={disabled}
        aria-describedby={descriptionId}
        className={`min-h-9 w-full appearance-auto rounded-md border border-border-subtle bg-surface-card px-2.5 py-1.5 font-mono text-section font-semibold text-text-primary shadow-sm transition-[border-color,box-shadow] duration-fast hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive disabled:cursor-not-allowed disabled:opacity-60 ${layout === 'inline' ? 'min-w-44' : ''}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {description && layout === 'stacked' ? (
        <span
          id={descriptionId}
          className="max-w-64 font-sans text-caption leading-section text-text-muted"
        >
          {description}
        </span>
      ) : null}
    </label>
  );
}
