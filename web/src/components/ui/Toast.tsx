import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { IconButton } from './IconButton.js';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastProps {
  title: string;
  children?: ReactNode;
  tone?: ToastTone;
  onDismiss?: () => void;
  className?: string;
}

const toneClasses: Record<ToastTone, string> = {
  info: 'border-interactive-border text-interactive',
  success: 'border-status-success-border text-status-success',
  error: 'border-status-critical-border text-status-critical',
};

const icons: Record<ToastTone, ReactNode> = {
  info: <Info aria-hidden="true" className="size-4" />,
  success: <CircleCheck aria-hidden="true" className="size-4" />,
  error: <CircleAlert aria-hidden="true" className="size-4" />,
};

export function Toast({ title, children, tone = 'info', onDismiss, className = '' }: ToastProps) {
  return (
    <aside
      aria-atomic="true"
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`flex w-full max-w-sm items-start gap-3 rounded-lg border bg-surface-panel p-3 text-text-primary shadow-panel ${toneClasses[tone]} ${className}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span className="mt-0.5 shrink-0">{icons[tone]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-text-primary">{title}</p>
        {children ? <div className="mt-1 text-xs text-text-secondary">{children}</div> : null}
      </div>
      {onDismiss ? (
        <IconButton icon={<X aria-hidden="true" />} label="Dismiss" onClick={onDismiss} />
      ) : null}
    </aside>
  );
}

export interface ToastRegionProps {
  children: ReactNode;
}

export function ToastRegion({ children }: ToastRegionProps) {
  return (
    <div className="fixed inset-x-4 bottom-4 z-toast flex max-w-sm flex-col gap-2 sm:right-4 sm:left-auto sm:w-full">
      {children}
    </div>
  );
}
