import type { ReactNode } from 'react';

export function eventTime(timestamp: string) {
  return timestamp.split('T')[1]?.slice(0, 8) ?? '';
}

interface TraceEventShellProps {
  icon: ReactNode;
  iconClassName: string;
  timestamp: string;
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  role?: 'alert';
  titleClassName?: string;
  timeClassName?: string;
}

export function TraceEventShell({
  icon,
  iconClassName,
  timestamp,
  title,
  meta,
  children,
  role,
  titleClassName = 'text-text-primary',
  timeClassName = 'text-text-muted',
}: TraceEventShellProps) {
  return (
    <article className="evidence-event-grid border-t border-border-subtle py-2.5" role={role}>
      <span
        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ${iconClassName}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div
          className={`mb-1 flex items-center justify-between gap-2 font-sans text-forensic-heading font-bold ${titleClassName}`}
        >
          <span>{title}</span>
          <span className={`font-mono text-forensic-meta font-normal ${timeClassName}`}>
            <time dateTime={timestamp}>{eventTime(timestamp)}</time>
            {meta ? <> · {meta}</> : null}
          </span>
        </div>
        {children}
      </div>
    </article>
  );
}
