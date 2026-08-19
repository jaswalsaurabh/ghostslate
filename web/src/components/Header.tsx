import React from 'react';
import {
  Activity,
  Radio,
  Server,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sun,
  Moon,
} from 'lucide-react';
import type { SystemHealth } from '../types.js';
import { useTheme } from '../hooks/use-theme.js';

interface HeaderProps {
  health: SystemHealth | null;
  healthLoading: boolean;
  healthError: string | null;
}

export const Header: React.FC<HeaderProps> = ({ health, healthLoading, healthError }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    /* Note: bg-surface-panel/95 provides one-off translucency over sticky backdrop-blur */
    <header className="border-b border-border-subtle bg-surface-panel/95 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-sticky backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center">
          <div className="h-2.5 w-2.5 rounded-full bg-interactive shadow-[0_0_10px_var(--color-interactive)]" />
          <div className="absolute h-4 w-4 rounded-full bg-interactive animate-ping opacity-40" />
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold tracking-wider text-text-primary flex items-center gap-2">
            GhostSlate AI
          </h1>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-card text-text-secondary border border-border-subtle flex items-center gap-1">
            <Radio className="w-3 h-3 text-interactive" />
            War Room Forensics
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs font-mono">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-card border border-border-subtle">
          <span className="text-text-muted text-[11px] uppercase tracking-wider font-semibold">
            Target Feed:
          </span>
          <span className="text-interactive font-semibold flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-interactive animate-pulse" />
            FAST-01 (Sports HD)
          </span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-card border border-border-subtle">
          <Server className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-text-muted text-[11px] uppercase tracking-wider font-semibold">
            Server:
          </span>
          {healthLoading && (
            <span className="text-status-warning flex items-center gap-1 font-semibold">
              <Loader2 className="w-3 h-3 animate-spin" />
              Connecting...
            </span>
          )}
          {healthError && (
            <span className="text-status-critical flex items-center gap-1 font-semibold">
              <AlertCircle className="w-3 h-3 text-status-critical" />
              Offline ({healthError})
            </span>
          )}
          {health && (
            <span className="text-status-success flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
              ONLINE ({health.uptimeSeconds}s)
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface-card hover:bg-surface-hover border border-border-subtle text-text-secondary hover:text-text-primary transition-colors duration-fast cursor-pointer"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-interactive" />
              <span className="text-[11px] font-semibold uppercase">Light</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-interactive" />
              <span className="text-[11px] font-semibold uppercase">Dark</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
