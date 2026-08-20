import React, { useState } from 'react';
import { CheckCircle2, Loader2, AlertOctagon, RotateCcw } from 'lucide-react';
import { Button } from './ui/index.js';
import { RemediationUnavailableState } from './remediation/RemediationUnavailableState.js';
import { RemediationStagedState } from './remediation/RemediationStagedState.js';
import { RemediationEmittedState } from './remediation/RemediationEmittedState.js';
import type { RemediationState } from '../types.js';

interface RemediationPanelProps {
  remediation: RemediationState | null;
  loading: boolean;
  approving: boolean;
  error: string | null;
  onApprove: () => Promise<void>;
  onRefresh?: (() => Promise<void>) | undefined;
}

export const RemediationPanel: React.FC<RemediationPanelProps> = ({
  remediation,
  loading,
  approving,
  error,
  onApprove,
  onRefresh,
}) => {
  const [isReviewing, setIsReviewing] = useState<boolean>(false);

  return (
    <div className="pt-3 border-t border-border-subtle flex flex-col gap-3 font-sans">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono font-bold text-text-muted uppercase tracking-wider">
          Operator-Approved Remediation
        </span>
        <div aria-live="polite" className="text-[11px] font-mono">
          {loading && (
            <span className="text-text-muted flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading remediation policy...
            </span>
          )}
          {!loading && remediation?.status === 'emitted' && (
            <span className="text-status-success font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Remediation policy emitted
            </span>
          )}
        </div>
      </div>

      {/* Loading State without existing remediation */}
      {loading && !remediation && (
        <div className="p-4 rounded-lg bg-surface-base border border-border-subtle text-xs text-text-muted flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-interactive" />
          <span>Loading remediation policy...</span>
        </div>
      )}

      {/* Error alert with retry action */}
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3 bg-surface-subtle border border-status-critical-border rounded-lg text-xs flex flex-col gap-2 animate-fadeIn"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-status-critical font-bold uppercase tracking-wider text-[11px]">
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Remediation Error</span>
            </div>
            {onRefresh && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void onRefresh()}
                disabled={loading || approving}
                icon={<RotateCcw className="w-3 h-3 text-interactive" />}
              >
                Retry
              </Button>
            )}
          </div>
          <p className="font-mono text-[11px] text-text-secondary">{error}</p>
        </div>
      )}

      {/* Unavailable State */}
      {!loading && remediation?.status === 'unavailable' && (
        <RemediationUnavailableState reason={remediation.reason} />
      )}

      {/* Staged State */}
      {!loading && remediation?.status === 'staged' && (
        <RemediationStagedState
          proposal={remediation.proposal}
          isReviewing={isReviewing}
          approving={approving}
          onStartReview={() => setIsReviewing(true)}
          onCancelReview={() => setIsReviewing(false)}
          onApprove={onApprove}
        />
      )}

      {/* Emitted State */}
      {!loading && remediation?.status === 'emitted' && (
        <RemediationEmittedState proposal={remediation.proposal} emission={remediation.emission} />
      )}
    </div>
  );
};
