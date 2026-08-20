import React, { useRef, useEffect } from 'react';
import { Sparkles, Search } from 'lucide-react';
import type { InvestigationTraceEvent, GroundingReport } from '../types.js';
import { GroundedDiagnosisCard } from './GroundedDiagnosisCard.js';
import { InvestigationEventItem } from './InvestigationEventItem.js';
import { Button, Badge, Card } from './ui/index.js';

interface InvestigationSectionProps {
  investigating: boolean;
  reconnecting?: boolean;
  onRunInvestigation: () => void;
  investigationTrace: InvestigationTraceEvent[];
  finalDiagnosis: string | null;
  groundingReport?: GroundingReport | undefined;
  onRemediate?: (action: 'reroute' | 'buffer') => void;
}

export const InvestigationSection: React.FC<InvestigationSectionProps> = ({
  investigating,
  reconnecting = false,
  onRunInvestigation,
  investigationTrace,
  finalDiagnosis,
  groundingReport,
  onRemediate,
}) => {
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [investigationTrace, finalDiagnosis]);

  return (
    <Card variant="panel" className="lg:col-span-7 p-5 flex flex-col gap-4 shadow-xl">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-border-subtle pb-3 gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="primary" size="sm">
            MODULE 02 &amp; 03
          </Badge>
          {reconnecting && (
            <Badge variant="warning" size="sm" pulse>
              Reconnecting to stream...
            </Badge>
          )}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-interactive">
              ClickHouse MCP Core + Forensic Agent Loop
            </h2>
            <p className="text-[11px] text-text-muted">
              Official mcp-clickhouse queries, ASOF correlation &amp; grounded diagnosis
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={onRunInvestigation}
          loading={investigating}
          icon={<Sparkles className="w-4 h-4 text-interactive-fg" />}
        >
          {investigating ? 'Running Forensics...' : 'Run Forensic Investigation'}
        </Button>
      </div>

      {/* Investigation Trace Log Container */}
      <div
        ref={logContainerRef}
        className="flex-1 bg-surface-base rounded-lg p-4 border border-border-subtle font-mono text-xs overflow-y-auto max-h-130 min-h-90 flex flex-col gap-3"
      >
        {investigationTrace.length === 0 ? (
          <div className="text-text-muted italic text-center my-auto py-12 flex flex-col items-center gap-3">
            <div className="p-3.5 rounded-full bg-surface-card border border-border-subtle">
              <Search className="w-6 h-6 text-interactive" />
            </div>
            <div className="max-w-md text-center">
              <p className="font-bold text-text-primary text-xs mb-1">
                ClickHouse MCP Forensic Pipeline Ready
              </p>
              <p className="text-[11px] text-text-muted">
                Click &quot;Run Forensic Investigation&quot; to trigger the Gemini reasoning loop
                over ClickHouse MCP via JSON-RPC / SSE.
              </p>
            </div>
          </div>
        ) : (
          investigationTrace.map((ev, i) => <InvestigationEventItem key={i} event={ev} />)
        )}
      </div>

      {/* Grounded Forensic Diagnosis Result */}
      {finalDiagnosis && (
        <GroundedDiagnosisCard
          diagnosis={finalDiagnosis}
          grounding={groundingReport}
          onRemediate={onRemediate}
        />
      )}
    </Card>
  );
};
