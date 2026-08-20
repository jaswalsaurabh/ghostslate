import React from 'react';
import { ShieldAlert, AlertTriangle, Info } from 'lucide-react';
import { Badge } from '../ui/index.js';
import type { RemediationUnavailableReason } from '../../types.js';

interface RemediationUnavailableStateProps {
  reason: RemediationUnavailableReason;
}

export const RemediationUnavailableState: React.FC<RemediationUnavailableStateProps> = ({
  reason,
}) => {
  const configs = {
    UNGROUNDED: {
      badge: 'critical' as const,
      badgeText: 'BLOCKED',
      title: 'Grounding Validation Failure',
      titleClass: 'text-status-critical',
      icon: <ShieldAlert className="w-4 h-4 text-status-critical shrink-0 mt-0.5" />,
      desc: 'Approval blocked because the diagnosis failed grounding validation.',
    },
    INSUFFICIENT_EVIDENCE: {
      badge: 'warning' as const,
      badgeText: 'NO ACTION',
      title: 'Insufficient Evidence',
      titleClass: 'text-text-primary',
      icon: <AlertTriangle className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />,
      desc: 'No remediation is available because no cohort met the minimum evidence threshold.',
    },
    NO_INCIDENT: {
      badge: 'success' as const,
      badgeText: 'NOMINAL',
      title: 'Nominal Traffic',
      titleClass: 'text-text-primary',
      icon: <Info className="w-4 h-4 text-interactive shrink-0 mt-0.5" />,
      desc: 'No remediation is required because no incident cohort was selected.',
    },
  }[reason];

  return (
    <div className="p-3.5 rounded-lg bg-surface-base border border-border-subtle text-xs flex items-start gap-2.5">
      {configs.icon}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant={configs.badge} size="sm">
            {configs.badgeText}
          </Badge>
          <span className={`font-bold text-xs ${configs.titleClass}`}>{configs.title}</span>
        </div>
        <p className="text-text-secondary text-[11px]">{configs.desc}</p>
      </div>
    </div>
  );
};
