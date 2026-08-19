import React, { useState } from 'react';
import { ShieldCheck, Copy, Check } from 'lucide-react';

interface GroundedDiagnosisCardProps {
  diagnosis: string;
}

export const GroundedDiagnosisCard: React.FC<GroundedDiagnosisCardProps> = ({ diagnosis }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(diagnosis);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    <div className="bg-linear-to-br from-surface-card via-surface-panel to-surface-card p-5 rounded-xl border border-interactive-border shadow-[0_0_20px_var(--color-interactive-subtle)] flex flex-col gap-3 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-interactive-subtle pb-3">
        <div className="flex items-center gap-2 text-xs font-bold text-interactive uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-interactive" />
          <span>Grounded Forensic Diagnosis</span>
          <span className="px-2 py-0.5 rounded-full bg-status-success-surface text-status-success border border-status-success-border text-[10px] font-mono lowercase">
            verified
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs font-mono text-text-secondary hover:text-text-primary px-2.5 py-1 rounded bg-surface-panel border border-border-subtle hover:border-interactive-border transition-colors duration-fast"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-status-success" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Report</span>
            </>
          )}
        </button>
      </div>

      <div className="text-xs text-text-primary leading-relaxed font-sans space-y-2.5">
        {diagnosis.split('\n\n').map((paragraph, pIdx) => (
          <p key={pIdx} className="leading-relaxed">
            {renderFormattedText(paragraph)}
          </p>
        ))}
      </div>
    </div>
  );
};
