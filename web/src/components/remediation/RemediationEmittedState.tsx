import React from 'react';
import { CheckCircle2 } from 'lucide-react';
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
  <section
    className="mx-5 mb-5 mt-4 overflow-hidden rounded-inset border border-status-success-border bg-status-success-surface shadow-sm"
    aria-label="Remediation emission record"
  >
    <div className="flex items-center justify-between gap-2 border-b border-status-success-border/40 px-4 py-2.5 bg-status-success-surface">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-4.5 text-status-success shrink-0" aria-hidden="true" />
        <strong className="font-sans text-forensic-heading font-bold text-status-success">
          Remediation emitted once
        </strong>
      </div>
      <span className="font-mono text-forensic-meta text-text-muted">
        ID: {emission.emissionId.slice(0, 8)}…
      </span>
    </div>

    <div className="p-4">
      <p className="m-0 font-sans text-section leading-relaxed text-text-secondary">
        Policy{' '}
        <strong className="font-mono font-semibold text-text-primary">{proposal.action}</strong>{' '}
        away from{' '}
        <strong className="font-mono font-semibold text-status-critical">
          {proposal.target.sspId}
        </strong>{' '}
        recorded for this investigation. Repeated operator approval is a no-op returning this
        immutable record.
      </p>

      <div className="mt-2.5 flex flex-wrap gap-2 font-mono text-forensic-meta text-text-muted">
        <span>Approved at: {emission.approvedAt}</span>
        <span>·</span>
        <span>Emitted at: {emission.emittedAt}</span>
      </div>

      <details className="mt-3 overflow-hidden rounded-md border border-status-success-border bg-surface-panel">
        <summary className="cursor-pointer px-3 py-2 font-sans text-section font-bold text-status-success">
          View immutable record
        </summary>
        <div className="border-t border-border-subtle p-3">
          <dl className="m-0 grid gap-3 font-mono text-section sm:grid-cols-2">
            <div>
              <dt className="font-sans text-forensic-meta font-bold uppercase text-text-muted">
                Emission ID
              </dt>
              <dd className="m-0 break-all font-mono text-section text-text-primary">
                {emission.emissionId}
              </dd>
            </div>
            <div>
              <dt className="font-sans text-forensic-meta font-bold uppercase text-text-muted">
                Run key
              </dt>
              <dd className="m-0 break-all font-mono text-section text-text-secondary">
                {emission.runKey}
              </dd>
            </div>
          </dl>
          <RemediationProposalDetails proposal={proposal} />
        </div>
      </details>
    </div>
  </section>
);
