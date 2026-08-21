import React from 'react';
import type { RemediationProposal } from '../../types.js';

interface RemediationProposalDetailsProps {
  proposal: RemediationProposal;
}

export const RemediationProposalDetails: React.FC<RemediationProposalDetailsProps> = ({
  proposal,
}) => (
  <div className="grid grid-cols-4 gap-2.5 my-3 max-md:grid-cols-2 max-sm:grid-cols-1 font-sans text-section">
    <div className="rounded-md border border-border-subtle bg-surface-panel p-2.5">
      <span className="block font-sans text-forensic-meta font-bold uppercase tracking-micro text-text-muted">
        Action
      </span>
      <strong className="mt-1 block truncate font-mono text-section font-semibold text-text-primary">
        {proposal.action}
      </strong>
    </div>
    <div className="rounded-md border border-border-subtle bg-surface-panel p-2.5">
      <span className="block font-sans text-forensic-meta font-bold uppercase tracking-micro text-text-muted">
        Target SSP
      </span>
      <strong className="mt-1 block truncate font-mono text-section font-semibold text-status-critical">
        {proposal.target.channelId} · {proposal.target.sspId}
      </strong>
    </div>
    <div className="rounded-md border border-border-subtle bg-surface-panel p-2.5">
      <span className="block font-sans text-forensic-meta font-bold uppercase tracking-micro text-text-muted">
        Cohort
      </span>
      <strong className="mt-1 block truncate font-mono text-section font-semibold text-text-primary">
        {proposal.target.deviceClass} · {proposal.target.codec} · {proposal.target.daypart}
      </strong>
    </div>
    <div className="rounded-md border border-border-subtle bg-surface-panel p-2.5">
      <span className="block font-sans text-forensic-meta font-bold uppercase tracking-micro text-text-muted">
        Evidence
      </span>
      <strong className="mt-1 block font-mono text-section font-semibold text-status-critical">
        {proposal.evidence.cues} cues · {proposal.evidence.unmonetizedImpressions.toLocaleString()}{' '}
        unmonetized impressions · {proposal.evidence.unmonetizedPct}%
      </strong>
    </div>
    <div className="rounded-md border border-border-subtle bg-surface-panel p-2.5">
      <span className="block font-sans text-forensic-meta font-bold uppercase tracking-micro text-text-muted">
        Latency / Deadline
      </span>
      <strong className="mt-1 block truncate font-mono text-section font-semibold text-text-primary">
        {Math.round(proposal.evidence.p95AuctionMs)} ms / {proposal.evidence.stitcherDeadlineMs} ms
      </strong>
    </div>
    <div className="col-span-3 rounded-md border border-border-subtle bg-surface-panel p-2.5 max-md:col-span-1">
      <span className="block font-sans text-forensic-meta font-bold uppercase tracking-micro text-text-muted">
        Window (UTC)
      </span>
      <strong className="mt-1 block truncate font-mono text-section font-semibold text-text-secondary">
        {proposal.window.from} → {proposal.window.to}
      </strong>
    </div>
  </div>
);
