import React from 'react';
import { Badge } from '../ui/index.js';
import { RemediationProposalDetails } from './RemediationProposalDetails.js';
import type { RemediationProposal, RemediationEmission } from '../../types.js';

interface RemediationEmittedStateProps {
  proposal: RemediationProposal;
  emission: RemediationEmission;
}

export const RemediationEmittedState: React.FC<RemediationEmittedStateProps> = ({
  proposal,
  emission,
}) => (
  <div className="p-4 rounded-lg bg-surface-base border border-status-success-border space-y-3 shadow-[0_0_15px_var(--color-status-success-subtle)] animate-fadeIn">
    {/* Header with Badges and Direct Action String */}
    <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="success" size="sm">
          APPROVED
        </Badge>
        <Badge variant="success" size="sm">
          EMITTED
        </Badge>
        <span className="text-xs font-bold text-text-primary">Action: {proposal.action}</span>
      </div>
      <span className="text-[11px] font-mono text-status-success font-semibold">
        Immutable Emission Record
      </span>
    </div>

    {/* Immutable Emission Metadata Grid */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
      <div className="p-2 bg-surface-card rounded border border-border-subtle">
        <span className="text-text-muted block text-[10px] uppercase">Emission ID</span>
        <span className="text-interactive break-all">{emission.emissionId}</span>
      </div>
      <div className="p-2 bg-surface-card rounded border border-border-subtle">
        <span className="text-text-muted block text-[10px] uppercase">Run Key</span>
        <span className="text-text-secondary break-all">{emission.runKey}</span>
      </div>
    </div>

    {/* Separate UTC Timestamps */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
      <div className="p-2 bg-surface-card rounded border border-border-subtle">
        <span className="text-text-muted block text-[10px] uppercase">Approved At (UTC)</span>
        <span className="text-text-primary">{emission.approvedAt}</span>
      </div>
      <div className="p-2 bg-surface-card rounded border border-border-subtle">
        <span className="text-text-muted block text-[10px] uppercase">Emitted At (UTC)</span>
        <span className="text-text-primary">{emission.emittedAt}</span>
      </div>
    </div>

    {/* Shared Authoritative Proposal & Telemetry Details (Raw Numeric Values) */}
    <RemediationProposalDetails proposal={proposal} />

    <p className="text-[11px] text-text-muted italic font-sans">
      Remediation policy has been emitted. Repeating the approval returns this original record
      without side-effects.
    </p>
  </div>
);
