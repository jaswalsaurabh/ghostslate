import React from 'react';
import {
  Activity,
  Server,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sun,
  Moon,
  Database,
} from 'lucide-react';
import type { SystemHealth } from '../types.js';
import { useTheme } from '../hooks/use-theme.js';
import { Button } from './ui/index.js';

interface HeaderProps {
  health: SystemHealth | null;
  healthLoading: boolean;
  healthError: string | null;
}

export const Header: React.FC<HeaderProps> = ({ health, healthLoading, healthError }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="border-b border-border-subtle bg-surface-panel/95 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-sticky backdrop-blur-md shadow-sm">
      {/* Brand Section */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-linear-to-br from-interactive to-interactive-border flex items-center justify-center text-interactive-fg shadow-[0_0_15px_var(--color-interactive-subtle)] font-mono font-bold text-sm">
          GS
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-extrabold tracking-tight text-text-primary">
              GhostSlate AI
            </h1>
          </div>
          <p className="text-[11px] font-mono text-text-muted">
            FAST / SSAI Intelligent Forensics &bull; ClickHouse MCP + Gemini Vision
          </p>
        </div>
      </div>

      {/* Target Feed & Status Section */}
      <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
        {/* Active Feed Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-card border border-border-subtle shadow-xs">
          <span className="w-2 h-2 rounded-full bg-status-critical animate-ping opacity-75 shrink-0" />
          <span className="text-text-muted text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap">
            Target Feed:
          </span>
          <span className="text-interactive font-bold flex items-center gap-1 whitespace-nowrap">
            <Activity className="w-3.5 h-3.5 text-interactive shrink-0" />
            FAST-01 (Sports HD)
          </span>
        </div>

        {/* ClickHouse MCP Pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-card border border-border-subtle">
          <Database className="w-3.5 h-3.5 text-data-fg" />
          <span className="text-text-muted text-[10px] uppercase font-semibold">MCP:</span>
          {healthLoading && (
            <span className="text-status-warning flex items-center gap-1 font-semibold">
              <Loader2 className="w-3 h-3 animate-spin" />
              Connecting...
            </span>
          )}
          {!healthLoading && health?.mcp?.connected && (
            <span className="text-data-fg font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
              ONLINE ({health.mcp.latencyMs ?? 0}ms)
            </span>
          )}
          {!healthLoading && (!health?.mcp?.connected || healthError) && (
            <span className="text-status-critical flex items-center gap-1 font-semibold">
              <AlertCircle className="w-3 h-3 text-status-critical" />
              OFFLINE
            </span>
          )}
        </div>

        {/* Server Health Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-card border border-border-subtle">
          <Server className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-text-muted text-[10px] uppercase font-semibold">API:</span>
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

        {/* Theme Switcher Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          icon={
            theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-interactive" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-interactive" />
            )
          }
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>
      </div>
    </header>
  );
};
