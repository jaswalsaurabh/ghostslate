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
            className="px-1.5 py-0.5 mx-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-500/30 font-mono text-[12px] font-semibold"
          >
            {code}
          </code>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className="bg-linear-to-br from-(--surface-card) via-(--surface-panel) to-(--surface-card) p-5 rounded-xl border border-(--accent-primary)/40 shadow-[0_0_20px_rgba(56,189,248,0.1)] flex flex-col gap-3 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-(--accent-primary)/20 pb-3">
        <div className="flex items-center gap-2 text-xs font-bold text-(--accent-primary) uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-(--accent-primary)" />
          <span>Grounded Forensic Diagnosis</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono lowercase">
            verified
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs font-mono text-(--text-secondary) hover:text-white px-2.5 py-1 rounded bg-(--surface-panel) border border-(--border-subtle) hover:border-(--accent-primary)/40 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
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

      <div className="text-xs text-slate-100 leading-relaxed font-sans space-y-2.5">
        {diagnosis.split('\n\n').map((paragraph, pIdx) => (
          <p key={pIdx} className="leading-relaxed">
            {renderFormattedText(paragraph)}
          </p>
        ))}
      </div>
    </div>
  );
};
