import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import { ConflictError } from '../errors/domain-error.js';
import type { DiagnosisEvidence, GroundingReport } from './grounding.service.js';
import type { InvestigationRun } from './investigation-runs.service.js';
import { STITCHER_DEADLINE_MS } from './incident.constants.js';

export type RemediationUnavailableReason = 'UNGROUNDED' | 'INSUFFICIENT_EVIDENCE' | 'NO_INCIDENT';

export interface RemediationProposal {
  action: 'reroute_ssp_cohort';
  target: {
    channelId: string;
    sspId: string;
    deviceClass: string;
    codec: string;
    daypart: string;
  };
  window: {
    from: string;
    to: string;
  };
  evidence: {
    cues: number;
    unmonetizedImpressions: number;
    unmonetizedPct: number;
    p95AuctionMs: number;
    stitcherDeadlineMs: number;
  };
}

export type RemediationDecision =
  | {
      status: 'unavailable';
      reason: RemediationUnavailableReason;
    }
  | {
      status: 'staged';
      proposal: RemediationProposal;
    };

export interface RemediationEmission {
  emissionId: string;
  runKey: string;
  approvedAt: string;
  emittedAt: string;
}

export interface EmittedRemediationState {
  status: 'emitted';
  proposal: RemediationProposal;
  emission: RemediationEmission;
}

export type RemediationState = RemediationDecision | EmittedRemediationState;

/**
 * Pure server-owned decision builder for remediation proposals.
 * Grounded evidence and constants exclusively own all identifiers and values.
 */
export function buildRemediationDecision(
  evidence: DiagnosisEvidence,
  grounding: GroundingReport,
): RemediationDecision {
  if (!grounding.grounded) {
    return {
      status: 'unavailable',
      reason: 'UNGROUNDED',
    };
  }

  if (evidence.rows.length === 0) {
    return {
      status: 'unavailable',
      reason: 'INSUFFICIENT_EVIDENCE',
    };
  }

  if (!evidence.incident) {
    return {
      status: 'unavailable',
      reason: 'NO_INCIDENT',
    };
  }

  const { context, incident } = evidence;
  return {
    status: 'staged',
    proposal: {
      action: 'reroute_ssp_cohort',
      target: {
        channelId: incident.channelId,
        sspId: incident.sspId,
        deviceClass: incident.deviceClass,
        codec: incident.codec,
        daypart: incident.daypart,
      },
      window: {
        from: context.from,
        to: context.to,
      },
      evidence: {
        cues: incident.cues,
        unmonetizedImpressions: incident.unmonetizedImpressions,
        unmonetizedPct: incident.unmonetizedPct,
        p95AuctionMs: incident.p95AuctionMs,
        stitcherDeadlineMs: STITCHER_DEADLINE_MS,
      },
    },
  };
}

export class RemediationService {
  private readonly emissions = new Map<string, EmittedRemediationState>();

  constructor(
    private readonly logger: Pick<Logger, 'info'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getState(runKey: string, run: InvestigationRun): RemediationState {
    const existing = this.emissions.get(runKey);
    if (existing) {
      return existing;
    }

    if (run.status === 'running') {
      throw new ConflictError('Investigation is still running');
    }

    if (run.status === 'failed') {
      throw new ConflictError(
        run.error ? `Investigation failed: ${run.error}` : 'Investigation failed',
      );
    }

    if (!run.result) {
      throw new ConflictError('Investigation has no completed result');
    }

    return run.result.remediation;
  }

  approve(
    runKey: string,
    run: InvestigationRun,
  ): {
    created: boolean;
    remediation: EmittedRemediationState;
  } {
    const existing = this.emissions.get(runKey);
    if (existing) {
      return {
        created: false,
        remediation: existing,
      };
    }

    if (run.status === 'running') {
      throw new ConflictError('Investigation is still running');
    }

    if (run.status === 'failed') {
      throw new ConflictError(
        run.error ? `Investigation failed: ${run.error}` : 'Investigation failed',
      );
    }

    if (!run.result) {
      throw new ConflictError('Investigation has no completed result');
    }

    const decision = run.result.remediation;
    if (decision.status === 'unavailable') {
      switch (decision.reason) {
        case 'UNGROUNDED':
          throw new ConflictError(
            'Cannot approve remediation: diagnosis failed grounding validation',
          );
        case 'INSUFFICIENT_EVIDENCE':
          throw new ConflictError('Cannot approve remediation: insufficient qualifying evidence');
        case 'NO_INCIDENT':
          throw new ConflictError('Cannot approve remediation: no incident cohort was selected');
        default:
          throw new ConflictError('Cannot approve remediation: remediation is unavailable');
      }
    }

    const proposal = decision.proposal;
    const emissionId = createHash('sha256').update(`${runKey}|reroute_ssp_cohort`).digest('hex');

    const isoNow = this.now().toISOString();
    const approvedAt = isoNow;
    const emittedAt = isoNow;

    const emission: RemediationEmission = {
      emissionId,
      runKey,
      approvedAt,
      emittedAt,
    };

    const emittedState: EmittedRemediationState = {
      status: 'emitted',
      proposal,
      emission,
    };

    this.emissions.set(runKey, emittedState);

    this.logger.info(
      {
        event: 'remediation_emitted',
        runKey,
        emissionId,
        remediation: proposal,
        approvedAt,
        emittedAt,
      },
      'Operator-approved remediation emitted',
    );

    return {
      created: true,
      remediation: emittedState,
    };
  }
}
