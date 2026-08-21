import React from 'react';
import { AlertOctagon, CheckCircle2 } from 'lucide-react';
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
    <section
      className={`mx-5 mb-5 mt-4 overflow-hidden rounded-inset border shadow-sm ${
        isUngrounded
          ? 'border-status-critical-border bg-status-critical-surface'
          : 'border-status-success-border bg-status-success-surface'
      }`}
      aria-label="Remediation status"
    >
      <div
        className={`flex items-center gap-2 border-b px-4 py-2.5 ${
          isUngrounded ? 'border-status-critical-border/40' : 'border-status-success-border/40'
        }`}
      >
        {isUngrounded ? (
          <AlertOctagon className="size-4.5 text-status-critical shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-4.5 text-status-success shrink-0" aria-hidden="true" />
        )}
        <strong
          className={`font-sans text-forensic-heading font-bold ${
            isUngrounded ? 'text-status-critical' : 'text-status-success'
          }`}
        >
          {isNominal
            ? 'No remediation required'
            : isUngrounded
              ? 'Grounding validation blocked remediation'
              : 'No remediation available'}
        </strong>
      </div>

      <div className="p-4">
        <p className="m-0 font-sans text-section leading-relaxed text-text-secondary">
          {isNominal
            ? 'No incident was established from the available evidence. The agent declined to stage remediation.'
            : isUngrounded
              ? 'The agent generated unverified claims that did not match ClickHouse evidence. Remediation emission is blocked.'
              : 'Telemetry did not cross the minimum evidence threshold to justify an automated reroute.'}
        </p>
      </div>
    </section>
  );
};
