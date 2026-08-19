import React, { useState } from 'react';
import { ShieldCheck, Copy, Check, Zap, Clock, CheckCircle2 } from 'lucide-react';
import { Button, Badge, Card } from './ui/index.js';

interface GroundedDiagnosisCardProps {
  diagnosis: string;
  onRemediate?: ((action: 'reroute' | 'buffer') => void) | undefined;
}

export const GroundedDiagnosisCard: React.FC<GroundedDiagnosisCardProps> = ({
  diagnosis,
  onRemediate,
}) => {
  const [copied, setCopied] = useState(false);
  const [appliedAction, setAppliedAction] = useState<string | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(diagnosis);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = (action: 'reroute' | 'buffer') => {
    setAppliedAction(action);
    if (onRemediate) onRemediate(action);
  };

  // Helper to render backticks in text as styled code pills
  const renderFormattedText = (text: string) => {
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        const code = part.slice(1, -1);
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 mx-0.5 rounded bg-interactive-surface text-interactive border border-interactive-border font-mono text-[12px] font-semibold"
          >
            {code}
          </code>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <Card variant="panel" glow="interactive" className="p-5 flex flex-col gap-4 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-interactive" />
          <h3 className="text-xs font-bold text-interactive uppercase tracking-wider">
            Grounded Forensic Diagnosis
          </h3>
          <Badge variant="success" size="sm">
            VERIFIED &bull; GROUNDED
          </Badge>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          icon={
            copied ? (
              <Check className="w-3.5 h-3.5 text-status-success" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )
          }
        >
          {copied ? 'Copied' : 'Copy Report'}
        </Button>
      </div>

      <div className="text-xs text-text-primary leading-relaxed font-sans space-y-2.5">
        {diagnosis.split('\n\n').map((paragraph, pIdx) => (
          <p key={pIdx} className="leading-relaxed">
            {renderFormattedText(paragraph)}
          </p>
        ))}
      </div>

      {/* Operator Remediation Staging Actions */}
      <div className="pt-2 border-t border-border-subtle flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono font-bold text-text-muted uppercase tracking-wider">
            Remediation &amp; Mitigation Options
          </span>
          {appliedAction && (
            <span className="text-[11px] font-mono text-status-success font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Remediation policy staged for operator review
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Button
            variant="critical"
            size="md"
            onClick={() => handleApply('reroute')}
            icon={<Zap className="w-3.5 h-3.5 text-status-critical" />}
            className="justify-between"
          >
            <span>Stage Reroute Policy: Degrade SSP</span>
            <Badge variant="critical" size="sm">
              MITIGATION
            </Badge>
          </Button>

          <Button
            variant="secondary"
            size="md"
            onClick={() => handleApply('buffer')}
            icon={<Clock className="w-3.5 h-3.5 text-interactive" />}
            className="justify-between"
          >
            <span>Stage Buffer Policy (+200ms)</span>
            <Badge variant="primary" size="sm">
              SLA POLICY
            </Badge>
          </Button>
        </div>
      </div>
    </Card>
  );
};
