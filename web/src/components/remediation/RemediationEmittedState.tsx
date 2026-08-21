import React from 'react';
import { Check } from 'lucide-react';
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
  <div className="-mt-5 mx-5 mb-5 flex items-start gap-3 rounded-b-inset border border-status-success-border bg-status-success-surface p-4 text-compact shadow-sm">
    <span className="grid size-5 place-items-center rounded-full bg-status-success text-status-success-fg shrink-0 mt-0.5">
      <Check className="size-3" />
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-xs font-bold text-status-success">Remediation emitted once</strong>
        <span className="font-mono text-micro text-text-muted">
          ID: {emission.emissionId.slice(0, 8)}…
        </span>
      </div>
      <p className="m-0 mt-1 text-detail leading-normal text-text-secondary">
        Policy <strong className="font-mono text-text-primary">{proposal.action}</strong> away from{' '}
        <strong className="font-mono text-status-critical">{proposal.target.sspId}</strong> recorded
        for this investigation. Repeated operator approval is a no-op returning this immutable
        record.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2 font-mono text-micro text-text-muted">
        <span>Approved at: {emission.approvedAt}</span>
        <span>·</span>
        <span>Emitted at: {emission.emittedAt}</span>
      </div>
      <details className="mt-3 rounded-md border border-status-success-border bg-surface-panel">
        <summary className="cursor-pointer px-3 py-2 font-mono text-caption font-bold text-status-success">
          View immutable record
        </summary>
        <div className="border-t border-border-subtle p-3">
          <dl className="m-0 grid gap-2 font-mono text-caption sm:grid-cols-2">
            <div>
              <dt className="text-micro uppercase text-text-muted">Emission ID</dt>
              <dd className="m-0 break-all text-text-primary">{emission.emissionId}</dd>
            </div>
            <div>
              <dt className="text-micro uppercase text-text-muted">Run key</dt>
              <dd className="m-0 break-all text-text-secondary">{emission.runKey}</dd>
            </div>
          </dl>
          <RemediationProposalDetails proposal={proposal} />
        </div>
      </details>
    </div>
  </div>
);
