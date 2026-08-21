import React from 'react';
import { Check } from 'lucide-react';
import type { RemediationUnavailableReason } from '../../types.js';

interface RemediationUnavailableStateProps {
  reason: RemediationUnavailableReason;
}

export const RemediationUnavailableState: React.FC<RemediationUnavailableStateProps> = ({
  reason,
}) => {
  const isNominal = reason === 'NO_INCIDENT';
  const isUngrounded = reason === 'UNGROUNDED';

  return (
    <div
      className={`-mt-5 mx-5 mb-5 flex items-start gap-3 rounded-b-inset border p-4 text-compact shadow-sm ${
        isUngrounded
          ? 'border-status-critical-border bg-status-critical-surface'
          : 'border-status-success-border bg-status-success-surface'
      }`}
    >
      <span
        className={`grid size-5 place-items-center rounded-full shrink-0 mt-0.5 ${
          isUngrounded
            ? 'bg-status-critical text-status-critical-fg'
            : 'bg-status-success text-status-success-fg'
        }`}
      >
        <Check className="size-3" />
      </span>
      <div className="min-w-0 flex-1">
        <strong
          className={`text-xs font-bold ${
            isUngrounded ? 'text-status-critical' : 'text-status-success'
          }`}
        >
          {isNominal
            ? 'No remediation required'
            : isUngrounded
              ? 'Grounding validation blocked remediation'
              : 'No remediation available'}
        </strong>
        <p className="m-0 mt-1 text-detail leading-normal text-text-secondary">
          {isNominal
            ? 'No incident was established from the available evidence. The agent declined to stage remediation.'
            : isUngrounded
              ? 'The agent generated unverified claims that did not match ClickHouse evidence. Remediation emission is blocked.'
              : 'Telemetry did not cross the minimum evidence threshold to justify an automated reroute.'}
        </p>
      </div>
    </div>
  );
};
