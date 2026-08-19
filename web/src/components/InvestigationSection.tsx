import React, { useRef, useEffect } from 'react';
import {
  Sparkles,
  Loader2,
  Terminal,
  Brain,
  Wrench,
  AlertOctagon,
  Copy,
  Check,
  Search,
  Database,
} from 'lucide-react';
import type { InvestigationTraceEvent } from '../types.js';
import { ClickHouseResultViewer } from './ClickHouseResultViewer.js';
import { GroundedDiagnosisCard } from './GroundedDiagnosisCard.js';

interface InvestigationSectionProps {
  investigating: boolean;
  onRunInvestigation: () => void;
  investigationTrace: InvestigationTraceEvent[];
  finalDiagnosis: string | null;
}

export const InvestigationSection: React.FC<InvestigationSectionProps> = ({
  investigating,
  onRunInvestigation,
  investigationTrace,
  finalDiagnosis,
}) => {
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [investigationTrace, finalDiagnosis]);

  const handleCopySql = (sql: string, index: number) => {
    navigator.clipboard.writeText(sql);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <section className="lg:col-span-7 bg-(--surface-panel) border border-(--border-subtle) rounded-xl p-5 flex flex-col gap-4 shadow-xl">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-(--border-subtle) pb-3 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold font-mono px-1.5 py-0.5 rounded bg-(--accent-primary)/10 text-(--accent-primary) border border-(--accent-primary)/30">
              02 &amp; 03
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-(--accent-primary)">
              ClickHouse MCP Core + Forensic Agent Loop
            </h2>
          </div>
          <p className="text-xs text-(--text-muted) mt-0.5">
            Official mcp-clickhouse queries, ASOF correlation &amp; grounded diagnosis
          </p>
        </div>

        <button
          type="button"
          onClick={onRunInvestigation}
          disabled={investigating}
          className="px-4 py-2 rounded-lg bg-(--accent-primary) hover:bg-sky-400 text-black text-xs font-bold transition-all shadow-[0_0_15px_rgba(56,189,248,0.35)] hover:shadow-[0_0_20px_rgba(56,189,248,0.5)] disabled:opacity-50 flex items-center gap-2"
        >
          {investigating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-black" />
              <span>Running Forensics...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-black" />
              <span>Run Forensic Investigation</span>
            </>
          )}
        </button>
      </div>

      {/* Investigation Trace Log Container */}
      <div
        ref={logContainerRef}
        className="flex-1 bg-(--surface-base) rounded-lg p-4 border border-(--border-subtle) font-mono text-xs overflow-y-auto max-h-130 min-h-90 flex flex-col gap-3"
      >
        {investigationTrace.length === 0 ? (
          <div className="text-(--text-muted) italic text-center my-auto py-12 flex flex-col items-center gap-3">
            <div className="p-3 rounded-full bg-(--surface-card) border border-(--border-subtle)">
              <Search className="w-6 h-6 text-(--accent-primary)" />
            </div>
            <div className="max-w-md text-center">
              <p className="font-semibold text-white text-xs mb-1">
                ClickHouse MCP Forensic Pipeline Ready
              </p>
              <p className="text-[11px] text-(--text-muted)">
                Click &quot;Run Forensic Investigation&quot; to trigger the Gemini reasoning loop
                over ClickHouse MCP via JSON-RPC / SSE.
              </p>
            </div>
          </div>
        ) : (
          investigationTrace.map((ev, i) => {
            const time = ev.timestamp ? ev.timestamp.split('T')[1]?.slice(0, 8) : '';

            // Status message
            if (ev.type === 'status') {
              const msg = String(ev.data?.message || '');
              const isReasoning = msg.toLowerCase().includes('reasoning');
              const isConnecting =
                msg.toLowerCase().includes('connecting') || msg.toLowerCase().includes('mcp');

              return (
                <div
                  key={i}
                  className="flex items-center gap-2 text-(--text-secondary) text-xs py-0.5"
                >
                  <span className="text-[10px] font-mono text-(--text-muted)">[{time}]</span>
                  {isReasoning ? (
                    <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  ) : isConnecting ? (
                    <Database className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  ) : (
                    <Terminal className="w-3.5 h-3.5 text-(--accent-primary) shrink-0" />
                  )}
                  <span className="text-slate-300">{msg}</span>
                </div>
              );
            }

            // MCP Tool Call
            if (ev.type === 'tool_call') {
              const sql = String(
                (ev.data?.args as Record<string, unknown>)?.query ||
                  JSON.stringify(ev.data?.args, null, 2),
              );
              return (
                <div
                  key={i}
                  className="bg-(--surface-card) p-3 rounded-lg border border-(--border-strong) flex flex-col gap-2 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-(--accent-primary) font-bold text-xs">
                      <Wrench className="w-3.5 h-3.5" />
                      <span>
                        MCP Tool Call:{' '}
                        <span className="font-mono text-white">{String(ev.data?.name)}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-(--text-muted)">[{time}]</span>
                      <button
                        type="button"
                        onClick={() => handleCopySql(sql, i)}
                        title="Copy SQL Query"
                        className="p-1 rounded bg-black/40 hover:bg-(--surface-hover) border border-(--border-subtle) text-(--text-secondary) hover:text-white transition-colors"
                      >
                        {copiedIndex === i ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="bg-black/60 rounded-md p-2.5 border border-white/5 overflow-x-auto">
                    <code className="text-sky-300 text-xs font-mono whitespace-pre-wrap wrap-break-word leading-relaxed">
                      {sql}
                    </code>
                  </div>
                </div>
              );
            }

            // ClickHouse Tool Result / Error Result
            if (ev.type === 'tool_result') {
              if (ev.data?.isError) {
                return (
                  <div
                    key={i}
                    className="bg-red-950/40 p-3 rounded-lg border border-red-800/60 text-red-300 flex items-start gap-2 text-xs shadow-md"
                  >
                    <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1 font-mono wrap-break-word">
                      <span className="font-bold text-red-200">
                        Tool Error{ev.data?.name ? ` (${String(ev.data.name)})` : ''}:{' '}
                      </span>
                      <pre className="mt-1 text-xs text-red-300 whitespace-pre-wrap font-mono">
                        {String(ev.data?.result || '')}
                      </pre>
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className="flex flex-col">
                  <ClickHouseResultViewer rawResult={String(ev.data?.result || '')} />
                </div>
              );
            }

            // Reasoning / Narrowing Hypothesis
            if (ev.type === 'reasoning') {
              const text = String(
                ev.data?.reasoning ||
                  ev.data?.hypothesis ||
                  ev.data?.message ||
                  ev.data?.text ||
                  JSON.stringify(ev.data),
              );
              return (
                <div
                  key={i}
                  className="bg-purple-950/30 p-3 rounded-lg border border-purple-800/40 text-purple-200 flex flex-col gap-1.5 text-xs shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-purple-300 font-bold text-xs">
                      <Brain className="w-3.5 h-3.5 text-purple-400" />
                      <span>Narrowing Hypothesis / Reasoning</span>
                    </div>
                    <span className="text-[10px] font-mono text-(--text-muted)">[{time}]</span>
                  </div>
                  <p className="text-purple-100/90 leading-relaxed font-sans whitespace-pre-wrap wrap-break-word">
                    {text}
                  </p>
                </div>
              );
            }

            // Error
            if (ev.type === 'error') {
              return (
                <div
                  key={i}
                  className="bg-red-950/40 p-3 rounded-lg border border-red-800/60 text-red-300 flex items-start gap-2 text-xs shadow-md"
                >
                  <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1 font-mono wrap-break-word">
                    <span className="font-bold text-red-200">Investigation Error: </span>
                    {String(ev.data?.error)}
                  </div>
                </div>
              );
            }

            return null;
          })
        )}
      </div>

      {/* Grounded Forensic Diagnosis Result */}
      {finalDiagnosis && <GroundedDiagnosisCard diagnosis={finalDiagnosis} />}
    </section>
  );
};
