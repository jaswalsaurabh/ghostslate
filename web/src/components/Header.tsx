import { Moon, Sun } from 'lucide-react';
import type { Theme } from '../hooks/use-theme.js';
import type { SystemHealth } from '../types.js';
import { IconButton, StatusIndicator, type StatusTone } from './ui/index.js';

export type VertexRuntimeState = 'idle' | 'running' | 'verified' | 'error';

interface HeaderProps {
  health: SystemHealth | null;
  healthLoading: boolean;
  healthError: string | null;
  vertexState: VertexRuntimeState;
  theme: Theme;
  onToggleTheme: () => void;
}

export function Header({
  health,
  healthLoading,
  healthError,
  vertexState,
  theme,
  onToggleTheme,
}: HeaderProps) {
  const mcpConnected = Boolean(health?.mcp?.connected);
  const vertexCopy = {
    idle: 'Vertex AI idle',
    running: 'Vertex AI running',
    verified: 'Vertex AI ready',
    error: 'Vertex AI error',
  }[vertexState];
  const vertexTone =
    vertexState === 'verified'
      ? 'ready'
      : vertexState === 'running'
        ? 'running'
        : vertexState === 'error'
          ? 'error'
          : 'idle';
  const mobileHealth = (() => {
    if (healthLoading || (!health && !healthError)) {
      return { label: 'Checking…', tone: 'warning', loading: true } as const;
    }
    if (healthError) {
      return { label: 'API issue', tone: 'error', loading: false } as const;
    }
    if (!mcpConnected) {
      return { label: 'MCP error', tone: 'error', loading: false } as const;
    }
    return { label: 'API + MCP', tone: 'ready', loading: false } as const;
  })() satisfies { label: string; tone: StatusTone; loading: boolean };

  return (
    <header className="sticky top-0 z-sticky h-17 border-b border-border-subtle bg-surface-base/88 backdrop-blur-header">
      <div className="war-room-shell flex h-full min-w-0 items-center justify-between gap-4 sm:gap-6">
        <div className="min-w-0 shrink-0">
          <img
            src="/brand/ghostslate-lockup.png"
            alt="GhostSlate"
            className="brand-lockup h-13.5 w-auto object-contain max-sm:h-12"
          />
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <StatusIndicator
            label={mobileHealth.label}
            tone={mobileHealth.tone}
            loading={mobileHealth.loading}
            className="px-2 whitespace-nowrap sm:hidden"
          />

          <span className="hidden sm:block">
            <StatusIndicator label={vertexCopy} tone={vertexTone} />
          </span>

          <span className="hidden sm:block">
            <StatusIndicator
              label={
                healthLoading
                  ? 'ClickHouse MCP checking'
                  : mcpConnected
                    ? 'ClickHouse MCP connected'
                    : 'ClickHouse MCP unavailable'
              }
              tone={healthLoading ? 'warning' : mcpConnected ? 'ready' : 'error'}
              loading={healthLoading}
            />
          </span>

          <span className="hidden md:block">
            <StatusIndicator
              label={healthError ? 'API offline' : health ? 'API online' : 'API checking'}
              tone={healthError ? 'error' : health ? 'ready' : 'idle'}
            />
          </span>

          <IconButton
            label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={onToggleTheme}
            variant="secondary"
            className="h-8.5 w-8.5 shrink-0"
            icon={
              theme === 'dark' ? (
                <Sun aria-hidden="true" className="h-4.25 w-4.25" />
              ) : (
                <Moon aria-hidden="true" className="h-4.25 w-4.25" />
              )
            }
          />
        </div>
      </div>
    </header>
  );
}
