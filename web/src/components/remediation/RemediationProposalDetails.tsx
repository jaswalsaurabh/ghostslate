import React from 'react';
import type { RemediationProposal } from '../../types.js';

interface RemediationProposalDetailsProps {
  proposal: RemediationProposal;
}

export const RemediationProposalDetails: React.FC<RemediationProposalDetailsProps> = ({
  proposal,
}) => (
  <div className="space-y-3 font-mono text-[11px]">
    {/* Target Cohort & Action Grid */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div className="p-2 bg-surface-card rounded border border-border-subtle">
        <span className="text-text-muted block text-[10px] uppercase">Action</span>
        <span className="font-bold text-text-primary">{proposal.action}</span>
      </div>
      <div className="p-2 bg-surface-card rounded border border-border-subtle">
        <span className="text-text-muted block text-[10px] uppercase">Channel &bull; SSP</span>
        <span className="font-bold text-status-critical">
          {proposal.target.channelId} &bull; {proposal.target.sspId}
        </span>
      </div>
      <div className="p-2 bg-surface-card rounded border border-border-subtle">
        <span className="text-text-muted block text-[10px] uppercase">Device Class</span>
        <span className="font-bold text-text-primary">{proposal.target.deviceClass}</span>
      </div>
      <div className="p-2 bg-surface-card rounded border border-border-subtle">
        <span className="text-text-muted block text-[10px] uppercase">Codec &bull; Daypart</span>
        <span className="font-bold text-text-primary">
          {proposal.target.codec} &bull; {proposal.target.daypart}
        </span>
      </div>
    </div>

    {/* Authoritative Telemetry Evidence Grid (Raw Numeric Values) */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div className="p-2 bg-surface-card rounded border border-border-subtle">
        <span className="text-text-muted block text-[10px] uppercase">Unmonetized Pct</span>
        <span className="font-bold text-status-critical">{proposal.evidence.unmonetizedPct}%</span>
      </div>
      <div className="p-2 bg-surface-card rounded border border-border-subtle">
        <span className="text-text-muted block text-[10px] uppercase">Unmonetized Imp</span>
        <span className="font-bold text-text-primary">
          {proposal.evidence.unmonetizedImpressions}
        </span>
      </div>
      <div className="p-2 bg-surface-card rounded border border-border-subtle">
        <span className="text-text-muted block text-[10px] uppercase">p95 / Deadline</span>
        <span className="font-bold text-text-primary">
          {proposal.evidence.p95AuctionMs}ms / {proposal.evidence.stitcherDeadlineMs}ms
        </span>
      </div>
      <div className="p-2 bg-surface-card rounded border border-border-subtle">
        <span className="text-text-muted block text-[10px] uppercase">Cues Analyzed</span>
        <span className="font-bold text-text-primary">{proposal.evidence.cues}</span>
      </div>
    </div>

    {/* Investigation Window (UTC) */}
    <div className="p-2 bg-surface-card rounded border border-border-subtle text-text-muted flex flex-wrap items-center justify-between gap-2">
      <div>
        <span className="uppercase text-[10px]">Window (UTC): </span>
        <span className="text-text-secondary">
          {proposal.window.from} &rarr; {proposal.window.to}
        </span>
      </div>
    </div>
  </div>
);
