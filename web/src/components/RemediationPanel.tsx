import React from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { RemediationUnavailableState } from './remediation/RemediationUnavailableState.js';
import { RemediationStagedState } from './remediation/RemediationStagedState.js';
import { RemediationEmittedState } from './remediation/RemediationEmittedState.js';
import { Button } from './ui/index.js';
import type { RemediationState } from '../types.js';

interface RemediationPanelProps {
  remediation: RemediationState | null;
  loading: boolean;
  approving: boolean;
  error: string | null;
  onApprove: () => Promise<void>;
  onRefresh?: (() => Promise<void>) | undefined;
  isReviewing: boolean;
  onCancelReview: () => void;
}

export const RemediationPanel: React.FC<RemediationPanelProps> = ({
  remediation,
  loading,
  approving,
  error,
  onApprove,
  onRefresh,
  isReviewing,
  onCancelReview,
}) => {
  if (!remediation && !loading && !error) {
    return null;
  }

  return (
    <div aria-live="polite" aria-busy={loading || undefined}>
      {loading && (
        <div
          role="status"
          className="mx-5 mb-5 mt-4 flex items-center gap-2 rounded-inset border border-border-subtle bg-surface-card p-3.5 font-sans text-section text-text-secondary"
        >
          <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-interactive" />
          Loading remediation proposal…
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mx-5 mb-5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-inset border border-status-critical-border bg-status-critical-surface p-3.5 font-sans text-section text-status-critical"
        >
          <span>
            <strong className="font-bold">Remediation error:</strong> {error}
          </span>
          {onRefresh && (
            <Button
              variant="critical"
              size="sm"
              onClick={() => void onRefresh()}
              disabled={loading}
              icon={<RotateCw aria-hidden="true" className="size-3" />}
              className="shrink-0 font-sans"
            >
              Retry
            </Button>
          )}
        </div>
      )}

      {remediation?.status === 'unavailable' && (
        <RemediationUnavailableState reason={remediation.reason} />
      )}

      {remediation?.status === 'staged' && (
        <RemediationStagedState
          proposal={remediation.proposal}
          isReviewing={isReviewing}
          approving={approving}
          onCancelReview={onCancelReview}
          onApprove={onApprove}
        />
      )}

      {remediation?.status === 'emitted' && (
        <RemediationEmittedState proposal={remediation.proposal} emission={remediation.emission} />
      )}
    </div>
  );
};
