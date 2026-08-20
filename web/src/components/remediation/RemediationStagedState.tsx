import React from 'react';
import { Zap, Send, X } from 'lucide-react';
import { Button, Badge } from '../ui/index.js';
import { RemediationProposalDetails } from './RemediationProposalDetails.js';
import type { RemediationProposal } from '../../types.js';

interface RemediationStagedStateProps {
  proposal: RemediationProposal;
  isReviewing: boolean;
  approving: boolean;
  onStartReview: () => void;
  onCancelReview: () => void;
  onApprove: () => Promise<void>;
}

export const RemediationStagedState: React.FC<RemediationStagedStateProps> = ({
  proposal,
  isReviewing,
  approving,
  onStartReview,
  onCancelReview,
  onApprove,
}) => (
  <div className="p-4 rounded-lg bg-surface-base border border-border-subtle space-y-3.5">
    <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
      <div className="flex items-center gap-2">
        <Badge variant="warning" size="sm">
          STAGED
        </Badge>
        <span className="text-xs font-bold text-text-primary">Action: {proposal.action}</span>
      </div>
      <Badge variant="neutral" size="sm">
        {proposal.target.channelId}
      </Badge>
    </div>

    {/* Shared Authoritative Proposal & Telemetry Details */}
    <RemediationProposalDetails proposal={proposal} />

    <p className="text-[11px] text-text-muted italic font-sans">
      This emits an operator-approved proposal only. It does not modify ad infrastructure.
    </p>

    {!isReviewing ? (
      <div className="pt-1">
        <Button
          variant="critical"
          size="md"
          onClick={onStartReview}
          icon={<Zap className="w-3.5 h-3.5 text-status-critical" />}
        >
          Review Reroute Policy
        </Button>
      </div>
    ) : (
      <div className="p-3 bg-surface-card rounded-lg border border-border-strong space-y-2.5 animate-fadeIn">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-text-primary flex items-center gap-1.5 font-sans">
            <Zap className="w-3.5 h-3.5 text-status-warning" />
            Confirm Policy Emission
          </span>
          <Badge variant="warning" size="sm">
            OPERATOR APPROVAL REQUIRED
          </Badge>
        </div>

        <p className="text-xs text-text-secondary font-sans">
          Execute <strong className="text-text-primary font-mono">{proposal.action}</strong> away
          from <strong className="text-text-primary font-mono">{proposal.target.sspId}</strong> for{' '}
          <strong className="text-text-primary font-mono">{proposal.target.deviceClass}</strong> (
          <span className="font-mono">{proposal.target.codec}</span>) on{' '}
          <strong className="text-text-primary font-mono">{proposal.target.channelId}</strong>.
        </p>

        <p className="text-[11px] font-mono text-status-warning">
          Warning: Approval is recorded and emitted once as an immutable operational event.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="primary"
            size="sm"
            loading={approving}
            disabled={approving}
            onClick={() => void onApprove()}
            icon={<Send className="w-3.5 h-3.5 text-interactive-fg" />}
          >
            {approving ? 'Emitting Policy...' : 'Approve & Emit'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={approving}
            onClick={onCancelReview}
            icon={<X className="w-3.5 h-3.5" />}
          >
            Cancel
          </Button>
        </div>
      </div>
    )}
  </div>
);
