import React, { useState } from 'react';
import { Terminal, Brain, Wrench, AlertOctagon, Copy, Check, Database, Eye } from 'lucide-react';
import type { InvestigationTraceEvent, ClassificationType, SlateType } from '../types.js';
import { ClickHouseResultViewer } from './ClickHouseResultViewer.js';
import { FrameEvidenceCard } from './FrameEvidenceCard.js';
import { Card } from './ui/index.js';

interface InvestigationEventItemProps {
  event: InvestigationTraceEvent;
}

export const InvestigationEventItem: React.FC<InvestigationEventItemProps> = ({ event: ev }) => {
  const [copied, setCopied] = useState(false);
  const time = ev.timestamp ? ev.timestamp.split('T')[1]?.slice(0, 8) : '';

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (ev.type === 'status') {
    const msg = String(ev.data?.message || '');
    const isReasoning = msg.toLowerCase().includes('reasoning');
    const isConnecting =
      msg.toLowerCase().includes('connecting') || msg.toLowerCase().includes('mcp');

    return (
      <div className="flex items-center gap-2 text-text-secondary text-xs py-0.5 animate-fadeIn">
        <span className="text-[10px] font-mono text-text-muted">[{time}]</span>
        {isReasoning ? (
          <Brain className="w-3.5 h-3.5 text-reasoning-fg shrink-0" />
        ) : isConnecting ? (
          <Database className="w-3.5 h-3.5 text-interactive shrink-0" />
        ) : (
          <Terminal className="w-3.5 h-3.5 text-interactive shrink-0" />
        )}
        <span className="text-text-primary">{msg}</span>
      </div>
    );
  }

  if (ev.type === 'tool_call') {
    const sql = String(
      (ev.data?.args as Record<string, unknown>)?.query || JSON.stringify(ev.data?.args, null, 2),
    );
    return (
      <Card
        variant="card"
        className="p-3 border-border-strong flex flex-col gap-2 shadow-xs animate-fadeIn"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-interactive font-bold text-xs">
            <Wrench className="w-3.5 h-3.5" />
            <span>
              MCP Tool Call:{' '}
              <span className="font-mono text-text-primary">{String(ev.data?.name)}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-muted">[{time}]</span>
            <button
              type="button"
              onClick={() => handleCopy(sql)}
              title="Copy SQL Query"
              className="p-1 rounded bg-surface-scrim hover:bg-surface-hover border border-border-subtle text-text-secondary hover:text-text-primary transition-colors duration-fast cursor-pointer"
            >
              {copied ? (
                <Check className="w-3 h-3 text-status-success" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        <div className="bg-surface-scrim rounded-md p-2.5 border border-border-subtle overflow-x-auto">
          <code className="text-interactive text-xs font-mono whitespace-pre-wrap wrap-break-word leading-relaxed">
            {sql}
          </code>
        </div>
      </Card>
    );
  }

  if (ev.type === 'vision_call') {
    const args = (ev.data?.args as Record<string, unknown>) || {};
    return (
      <Card
        variant="card"
        className="p-3 border-border-strong flex items-center justify-between gap-2 shadow-xs animate-fadeIn"
      >
        <div className="flex items-center gap-2 text-interactive font-bold text-xs">
          <Eye className="w-3.5 h-3.5" />
          <span>
            Vision Tool Call:{' '}
            <span className="font-mono text-text-primary">
              {String(args.video_file ?? '')} @ {String(args.timestamp_seconds ?? '')}s
            </span>
          </span>
        </div>
        <span className="text-[10px] font-mono text-text-muted">[{time}]</span>
      </Card>
    );
  }

  if (ev.type === 'tool_result') {
    if (ev.data?.isError) {
      return (
        <div className="bg-status-critical-surface p-3 rounded-lg border border-status-critical-border text-status-critical flex items-start gap-2 text-xs shadow-md animate-fadeIn">
          <AlertOctagon className="w-4 h-4 text-status-critical shrink-0 mt-0.5" />
          <div className="flex-1 font-mono wrap-break-word">
            <span className="font-bold text-status-critical">
              Tool Error{ev.data?.name ? ` (${String(ev.data.name)})` : ''}:{' '}
            </span>
            <pre className="mt-1 text-xs text-status-critical whitespace-pre-wrap font-mono">
              {String(ev.data?.result || '')}
            </pre>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col animate-fadeIn">
        <ClickHouseResultViewer
          rawResult={String(ev.data?.result || '')}
          durationMs={typeof ev.data?.durationMs === 'number' ? ev.data.durationMs : undefined}
          rowsReturned={
            typeof ev.data?.rowsReturned === 'number' ? ev.data.rowsReturned : undefined
          }
          rowsScanned={typeof ev.data?.rowsScanned === 'number' ? ev.data.rowsScanned : undefined}
        />
      </div>
    );
  }

  if (ev.type === 'frame_classified') {
    const d = ev.data ?? {};
    const args = (d.args as Record<string, unknown>) || {};
    return (
      <div className="animate-fadeIn">
        <FrameEvidenceCard
          classification={d.classification as ClassificationType}
          confidence={Number(d.confidence ?? 0)}
          slateType={(d.slate_type ?? null) as SlateType}
          textDetected={String(d.text_detected ?? '')}
          visualSummary={String(d.visual_summary ?? '')}
          timestampSeconds={d.timestampSeconds as number | undefined}
          videoFile={args.video_file as string | undefined}
          frameBase64={d.frameBase64 as string | undefined}
          cached={Boolean(d.cached)}
        />
      </div>
    );
  }

  if (ev.type === 'reasoning') {
    const text = String(
      ev.data?.reasoning ||
        ev.data?.hypothesis ||
        ev.data?.message ||
        ev.data?.text ||
        JSON.stringify(ev.data),
    );
    return (
      <div className="bg-reasoning-surface p-3 rounded-lg border border-reasoning-border text-reasoning-fg flex flex-col gap-1.5 text-xs shadow-xs animate-fadeIn">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-reasoning-fg font-bold text-xs">
            <Brain className="w-3.5 h-3.5 text-reasoning-fg" />
            <span>Narrowing Hypothesis / Reasoning</span>
          </div>
          <span className="text-[10px] font-mono text-text-muted">[{time}]</span>
        </div>
        <p className="text-text-primary leading-relaxed font-sans whitespace-pre-wrap wrap-break-word">
          {text}
        </p>
      </div>
    );
  }

  if (ev.type === 'error') {
    return (
      <div className="bg-status-critical-surface p-3 rounded-lg border border-status-critical-border text-status-critical flex items-start gap-2 text-xs shadow-md animate-fadeIn">
        <AlertOctagon className="w-4 h-4 text-status-critical shrink-0 mt-0.5" />
        <div className="flex-1 font-mono wrap-break-word">
          <span className="font-bold text-status-critical">Investigation Error: </span>
          {String(ev.data?.error)}
        </div>
      </div>
    );
  }

  return null;
};
