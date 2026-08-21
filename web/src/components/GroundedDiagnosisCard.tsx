import React, { useState } from 'react';
import { AlertOctagon, Check, Copy, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button, MarkdownText } from './ui/index.js';
import { RemediationPanel } from './RemediationPanel.js';
import type { EvidenceOutcome, GroundingReport, RemediationState } from '../types.js';

interface GroundedDiagnosisCardProps {
  diagnosis: string;
  outcome?: EvidenceOutcome | undefined;
  grounding?: GroundingReport | undefined;
  remediation?: RemediationState | null | undefined;
  remediationLoading?: boolean | undefined;
  remediationApproving?: boolean | undefined;
  remediationError?: string | null | undefined;
  onApproveRemediation?: (() => Promise<void>) | undefined;
  onRefreshRemediation?: (() => Promise<void>) | undefined;
  hasClickHouseEvidence: boolean;
  hasVisionEvidence: boolean;
  hasRateCardEvidence: boolean;
}

export const GroundedDiagnosisCard: React.FC<GroundedDiagnosisCardProps> = ({
  diagnosis,
  outcome,
  grounding,
  remediation = null,
  remediationLoading = false,
  remediationApproving = false,
  remediationError = null,
  onApproveRemediation,
  onRefreshRemediation,
  hasClickHouseEvidence,
  hasVisionEvidence,
  hasRateCardEvidence,
}) => {
  const [isReviewing, setIsReviewing] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyReport = async () => {
    await navigator.clipboard.writeText(diagnosis);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  const isGrounded = grounding?.grounded === true;
  const outcomeStyle =
    outcome === 'no_incident'
      ? 'border-status-success-border bg-linear-to-br from-status-success-surface/70 via-surface-panel to-surface-panel'
      : outcome === 'incident'
        ? 'border-interactive-border bg-linear-to-br from-interactive-surface/70 via-surface-panel to-surface-panel'
        : 'border-border-subtle bg-surface-panel';

  return (
    <>
      <section
        className={`mx-5 mb-5 overflow-hidden rounded-inset border shadow-sm ${outcomeStyle}`}
        aria-labelledby="diagnosis-card-title"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2.5">
          <div className="flex items-center gap-2">
            {isGrounded ? (
              <ShieldCheck className="size-4.5 text-status-success shrink-0" aria-hidden="true" />
            ) : grounding ? (
              <ShieldAlert className="size-4.5 text-status-critical shrink-0" aria-hidden="true" />
            ) : (
              <Shield className="size-4.5 text-text-muted shrink-0" aria-hidden="true" />
            )}
            <span
              id="diagnosis-card-title"
              className="font-sans text-forensic-heading font-bold uppercase tracking-wider text-text-primary"
            >
              Grounded diagnosis
            </span>
          </div>

          <div className="flex items-center gap-2">
            {grounding ? (
              grounding.grounded ? (
                <span className="flex items-center gap-1 rounded-md border border-status-success-border bg-status-success-surface px-2 py-1 font-mono text-forensic-meta font-bold text-status-success">
                  {grounding.checkedClaims} claims verified
                </span>
              ) : (
                <span className="rounded-md border border-status-critical-border bg-status-critical-surface px-2 py-1 font-mono text-forensic-meta font-bold text-status-critical">
                  {grounding.violations.length} ungrounded claim
                  {grounding.violations.length > 1 ? 's' : ''}
                </span>
              )
            ) : (
              <span className="rounded-md border border-border-subtle bg-surface-card px-2 py-1 font-sans text-forensic-meta font-bold text-text-muted">
                Grounding unavailable
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              aria-live="polite"
              onClick={() => void copyReport()}
              icon={
                copied ? (
                  <Check aria-hidden="true" className="size-3.5 text-status-success" />
                ) : (
                  <Copy aria-hidden="true" className="size-3.5" />
                )
              }
            >
              {copied ? 'Copied' : 'Copy report'}
            </Button>
          </div>
        </div>

        <div className="p-4">
          <div className="text-diagnosis leading-diagnosis text-text-secondary">
            <MarkdownText content={diagnosis} />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Evidence summary tags">
            {hasClickHouseEvidence && (
              <span className="rounded-md border border-border-subtle bg-surface-card px-2 py-1 font-sans text-forensic-meta text-text-secondary">
                ClickHouse · observed query result
              </span>
            )}
            {hasVisionEvidence && (
              <span className="rounded-md border border-border-subtle bg-surface-card px-2 py-1 font-sans text-forensic-meta text-text-secondary">
                Vision · Gemini multimodal
              </span>
            )}
            {hasRateCardEvidence && (
              <span className="rounded-md border border-border-subtle bg-surface-card px-2 py-1 font-sans text-forensic-meta text-text-secondary">
                Rate card · queried CPM
              </span>
            )}
            {grounding && (
              <span className="rounded-md border border-border-subtle bg-surface-card px-2 py-1 font-mono text-forensic-meta text-text-secondary">
                Grounding · {grounding.violations.length} violations
              </span>
            )}
          </div>

          {/* Violation Alert Banner if claims were not grounded */}
          {grounding && !grounding.grounded && grounding.violations.length > 0 && (
            <div
              className="mt-3 rounded-lg border border-status-critical-border bg-status-critical-surface p-3 text-forensic-meta text-status-critical"
              role="alert"
            >
              <div className="flex items-center gap-1.5 font-sans font-bold uppercase tracking-wider text-forensic-meta">
                <AlertOctagon className="size-3.5" />
                <span>Unverified Claims Detected by Grounding Engine</span>
              </div>
              <div className="mt-2 space-y-1 font-mono text-forensic-code text-text-secondary">
                {grounding.violations.map((v, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <span className="font-bold text-status-critical">Claim:</span>
                    <span className="font-bold text-text-primary">{v.claim}</span>
                    <span className="text-text-muted">— in: “{v.context}”</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Remediation trigger row if staged */}
          {remediation?.status === 'staged' && !isReviewing && (
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3 font-sans text-forensic-meta text-text-secondary">
              <span>Suggested action: reroute this cohort only. Operator approval required.</span>
              <Button
                onClick={() => setIsReviewing(true)}
                variant="success"
                size="sm"
                className="shrink-0 font-sans uppercase tracking-wider"
              >
                Review remediation
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Operator Remediation Attached Section */}
      <RemediationPanel
        remediation={remediation}
        loading={remediationLoading}
        approving={remediationApproving}
        error={remediationError}
        onApprove={onApproveRemediation ?? (async () => {})}
        onRefresh={onRefreshRemediation}
        isReviewing={isReviewing}
        onCancelReview={() => setIsReviewing(false)}
      />
    </>
  );
};
