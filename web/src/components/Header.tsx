import { AlertCircle, CheckCircle2, Cloud, Database, Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/use-theme.js';
import type { SystemHealth } from '../types.js';
import { Button, StatusIndicator } from './ui/index.js';

export type VertexRuntimeState = 'idle' | 'running' | 'verified' | 'error';

interface HeaderProps {
  health: SystemHealth | null;
  healthLoading: boolean;
  healthError: string | null;
  vertexState: VertexRuntimeState;
}

export function Header({ health, healthLoading, healthError, vertexState }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const mcpConnected = Boolean(health?.mcp?.connected);
  const vertexCopy = {
    idle: 'Runtime idle',
    running: 'Vertex active',
    verified: 'Vertex verified',
    error: 'Vertex error',
  }[vertexState];
  const vertexTone =
    vertexState === 'verified'
      ? 'success'
      : vertexState === 'running'
        ? 'warning'
        : vertexState === 'error'
          ? 'error'
          : 'idle';

  return (
    <header className="sticky top-0 z-sticky border-b border-border-subtle bg-surface-panel/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <img
          src="/brand/ghostslate-lockup.png"
          alt="GhostSlate"
          className="brand-lockup h-8 w-auto"
        />

        <div className="flex flex-wrap items-center justify-end gap-2 font-mono text-xs">
          <StatusIndicator
            icon={<Cloud className="h-3.5 w-3.5 text-text-muted" />}
            label={vertexCopy}
            tone={vertexTone}
            className="hidden sm:inline-flex"
          />

          <StatusIndicator
            icon={<Database className="h-3.5 w-3.5 text-data-fg" />}
            label={
              healthLoading
                ? 'MCP checking'
                : mcpConnected
                  ? 'ClickHouse MCP connected'
                  : 'MCP unavailable'
            }
            tone={healthLoading ? 'warning' : mcpConnected ? 'success' : 'error'}
            loading={healthLoading}
          />

          <StatusIndicator
            icon={
              healthError ? (
                <AlertCircle className="h-3.5 w-3.5 text-status-critical" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
              )
            }
            label={healthError ? 'API offline' : health ? 'API online' : 'API checking'}
            tone={healthError ? 'error' : health ? 'success' : 'idle'}
            className="hidden md:inline-flex"
          />

          <Button
            variant="secondary"
            size="sm"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            icon={theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          />
        </div>
      </div>
    </header>
  );
}
