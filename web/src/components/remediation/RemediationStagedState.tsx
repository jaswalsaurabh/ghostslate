import React from 'react';
import { Send, X } from 'lucide-react';
import { Button } from '../ui/index.js';
import { RemediationProposalDetails } from './RemediationProposalDetails.js';
import type { RemediationProposal } from '../../types.js';

interface RemediationStagedStateProps {
  proposal: RemediationProposal;
  isReviewing: boolean;
  approving: boolean;
  onCancelReview: () => void;
  onApprove: () => Promise<void>;
}

export const RemediationStagedState: React.FC<RemediationStagedStateProps> = ({
  proposal,
  isReviewing,
  approving,
  onCancelReview,
  onApprove,
}) => {
  if (!isReviewing) {
    return null;
  }

  return (
    <div className="-mt-5 mx-5 mb-5 rounded-b-inset border border-status-warning-border bg-status-warning-surface p-4 text-compact shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="block font-mono text-micro uppercase tracking-widest text-text-muted">
            Staged · not emitted
          </span>
          <h3 className="m-0 mt-1 font-sans text-xs font-bold text-text-primary">
            Review cohort reroute
          </h3>
        </div>
        <span className="rounded-md border border-status-warning-border px-2 py-1 font-mono text-caption font-bold text-status-warning">
          Operator approval required
        </span>
      </div>

      <RemediationProposalDetails proposal={proposal} />

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-border-subtle">
        <p className="m-0 text-caption text-text-muted">
          Approval is recorded and emitted once as an immutable operational event.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={onCancelReview}
            disabled={approving}
            variant="secondary"
            size="sm"
            className="font-mono"
            icon={<X aria-hidden="true" className="size-2.5" />}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void onApprove()}
            loading={approving}
            variant="warning"
            size="sm"
            className="font-mono"
            icon={<Send aria-hidden="true" className="size-2.5" />}
          >
            {approving ? 'Emitting...' : 'Confirm and emit'}
          </Button>
        </div>
      </div>
    </div>
  );
};
