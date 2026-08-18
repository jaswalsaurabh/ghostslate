import React, { useState, useEffect } from 'react';

interface SystemHealth {
  status: string;
  service: string;
  uptimeSeconds: number;
}

export const App: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SystemHealth>;
      })
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-(--surface-base) text-(--text-primary) flex flex-col">
      <header className="border-b border-(--border-subtle) bg-(--surface-panel) px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-(--accent-primary) animate-pulse" />
          <h1 className="text-lg font-semibold tracking-wide">GhostSlate AI</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-(--surface-card) text-(--text-secondary) font-mono border border-(--border-subtle)">
            War Room Forensics
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-(--text-secondary)">
          <span>Status:</span>
          {loading && <span className="text-(--accent-warn)">Connecting...</span>}
          {error && <span className="text-(--accent-danger)">Offline ({error})</span>}
          {health && (
            <span className="text-(--accent-success) flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-(--accent-success)" />
              {health.service} (uptime: {health.uptimeSeconds}s)
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="bg-(--surface-panel) border border-(--border-subtle) rounded-lg p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-(--text-secondary)">
            1. Stream Vision Ingestion
          </h2>
          <p className="text-xs text-(--text-muted)">
            Real-time frame sampling & Gemini multimodal classification (Slate vs Ad vs Content).
          </p>
          <div className="mt-auto bg-(--surface-card) p-3 rounded border border-(--border-subtle) text-xs font-mono text-(--text-secondary)">
            Target: FAST Channel 01 (HLS)
          </div>
        </section>

        <section className="bg-(--surface-panel) border border-(--border-subtle) rounded-lg p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-(--text-secondary)">
            2. ClickHouse MCP Core
          </h2>
          <p className="text-xs text-(--text-muted)">
            SCTE-35 cue correlation via ASOF JOIN, multi-dimensional cohort isolation, and rate-card
            loss attribution.
          </p>
          <div className="mt-auto bg-(--surface-card) p-3 rounded border border-(--border-subtle) text-xs font-mono text-(--text-secondary)">
            Engine: ClickHouse Cloud + mcp-clickhouse
          </div>
        </section>

        <section className="bg-(--surface-panel) border border-(--border-subtle) rounded-lg p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-(--text-secondary)">
            3. Forensic Agent Loop
          </h2>
          <p className="text-xs text-(--text-muted)">
            Iterative reasoning trace, grounded revenue bleed quantification, and human-in-the-loop
            remediation.
          </p>
          <div className="mt-auto bg-(--surface-card) p-3 rounded border border-(--border-subtle) text-xs font-mono text-(--text-secondary)">
            Model: Gemini on Vertex AI
          </div>
        </section>
      </main>
    </div>
  );
};
