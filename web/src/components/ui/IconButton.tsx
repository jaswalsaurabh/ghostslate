import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button.js';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children' | 'size'
> {
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  loading?: boolean;
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  loading = false,
  ...props
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      title={label}
      icon={icon}
      loading={loading}
      size="icon"
      variant={variant}
      {...props}
    />
  );
}
