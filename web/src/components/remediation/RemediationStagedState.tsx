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
    <div className="mx-5 mb-5 mt-4 rounded-inset border border-status-warning-border bg-status-warning-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="block font-sans text-forensic-meta font-bold uppercase tracking-widest text-text-muted">
            Staged · not emitted
          </span>
          <h3 className="m-0 mt-1 font-sans text-forensic-title font-bold text-text-primary">
            Review cohort reroute
          </h3>
        </div>
        <span className="rounded-md border border-status-warning-border px-2.5 py-1 font-sans text-forensic-meta font-bold text-status-warning">
          Operator approval required
        </span>
      </div>

      <RemediationProposalDetails proposal={proposal} />

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-border-subtle">
        <p className="m-0 font-sans text-forensic-meta text-text-muted">
          Approval is recorded and emitted once as an immutable operational event.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={onCancelReview}
            disabled={approving}
            variant="secondary"
            size="sm"
            className="font-sans"
            icon={<X aria-hidden="true" className="size-2.5" />}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void onApprove()}
            loading={approving}
            variant="warning"
            size="sm"
            className="font-sans"
            icon={<Send aria-hidden="true" className="size-2.5" />}
          >
            {approving ? 'Emitting...' : 'Confirm and emit'}
          </Button>
        </div>
      </div>
    </div>
  );
};
