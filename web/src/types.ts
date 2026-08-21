export interface SystemHealth {
  status: 'ok';
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  mcp?:
    | {
        connected: boolean;
        latencyMs?: number | undefined;
      }
    | undefined;
}

export type ClassificationType = 'slate' | 'ad' | 'content';
export type SlateType = 'looping_card' | 'black_screen' | 'static_logo' | null;

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.9,
  MEDIUM: 0.7,
} as const;

export interface FrameClassificationData {
  classification: ClassificationType;
  confidence: number;
  slate_type: SlateType;
  text_detected: string;
  visual_summary: string;
  contentHash: string;
  cached: boolean;
  timestampSeconds?: number | undefined;
  frameBase64?: string | undefined;
  latencyMs?: number | undefined;
}

export interface McpQueryData {
  columns: string[];
  rows: (string | number | boolean | null)[][];
}

export interface GroundingViolation {
  claim: string;
  context: string;
}

export interface GroundingReport {
  grounded: boolean;
  violations: GroundingViolation[];
  checkedClaims: number;
}

export type EvidenceOutcome = 'incident' | 'no_incident';

export type EvidenceGateReason =
  | 'ISOLATED_ANOMALY'
  | 'INSUFFICIENT_SAMPLE_SIZE'
  | 'BELOW_FAILURE_THRESHOLD'
  | 'LONE_COHORT'
  | 'DIFFUSE_VARIATION'
  | 'NO_DATA';

export interface EvidenceCandidate {
  basis: 'selected_incident' | 'maximum_observed';
  channelId: string;
  sspId: string;
  deviceClass: string;
  codec: string;
  daypart: string;
  cues: number;
  totalAttempts: number;
  unmonetizedImpressions: number;
  unmonetizedPct: number;
  p95AuctionMs: number;
  cpmUsd: number | null;
}

export interface EvidenceThresholds {
  minimumCues: number;
  incidentFailurePct: number;
  cohortDispersionPp: number;
  stitcherDeadlineMs: number;
  hardAuctionTimeoutMs: number;
}

export interface EvidenceQueryMetadata {
  rowsReturned: number;
  rowsScanned: number | null;
  durationMs: number | null;
}

export interface InvestigationEvidenceSummary {
  outcome: EvidenceOutcome;
  reason: EvidenceGateReason;
  candidate: EvidenceCandidate;
  revenueLossUsd: number | null;
  thresholds: EvidenceThresholds;
  query: EvidenceQueryMetadata;
}

export interface InvestigationRunResponse {
  runKey: string;
  created: boolean;
}

export type MetricVariant = 'critical' | 'warning' | 'success' | 'interactive' | 'neutral';

export interface GroundedKpiPayload {
  evidenceSummary?: InvestigationEvidenceSummary | null | undefined;
  revenueLoss?: string | null | undefined;
  revenueLossSubtext?: string | null | undefined;
  revenueLossVariant?: MetricVariant | undefined;
  revenueLossTag?: string | null | undefined;
  slateBleedRate?: string | null | undefined;
  slateBleedSubtext?: string | null | undefined;
  slateBleedVariant?: MetricVariant | undefined;
  slateBleedTag?: string | null | undefined;
  offendingSsp?: string | null | undefined;
  sspLatency?: string | null | undefined;
  sspSubtext?: string | null | undefined;
  sspVariant?: MetricVariant | undefined;
  scannedLogs?: string | null | undefined;
  scannedLogsSubtext?: string | null | undefined;
  scannedLogsTag?: string | null | undefined;
  isGroundedFromMcp?: boolean | undefined;
  rateCardFromQuery?: boolean | undefined;
}

export type InvestigationTraceEvent =
  | {
      type: 'status';
      timestamp: string;
      data?: { message?: string | undefined } | undefined;
    }
  | {
      type: 'tool_call';
      timestamp: string;
      data: { name: string; args: Record<string, unknown> };
    }
  | {
      type: 'tool_result';
      timestamp: string;
      data: {
        name: string;
        sql?: string | undefined;
        result?: string | undefined;
        isError?: boolean | undefined;
        durationMs?: number | undefined;
        rowsReturned?: number | undefined;
        rowsScanned?: number | undefined;
      };
    }
  | {
      type: 'vision_call';
      timestamp: string;
      data: { name: string; args: Record<string, unknown> };
    }
  | {
      type: 'frame_classified';
      timestamp: string;
      data: FrameClassificationData & {
        name?: string | undefined;
        args?: Record<string, unknown> | undefined;
        durationMs?: number | undefined;
        latencyMs?: number | undefined;
      };
    }
  | {
      type: 'metrics';
      timestamp: string;
      data?: GroundedKpiPayload | undefined;
    }
  | {
      type: 'reasoning';
      timestamp: string;
      data: {
        hypothesis?: string | undefined;
        text?: string | undefined;
        message?: string | undefined;
        turn?: number | undefined;
      };
    }
  | {
      type: 'diagnosis';
      timestamp: string;
      data: {
        diagnosis?: string | undefined;
        grounding?: GroundingReport | undefined;
        remediation?: RemediationState | undefined;
      };
    }
  | {
      type: 'error';
      timestamp: string;
      data?: { error?: string | undefined; message?: string | undefined } | undefined;
    }
  | {
      type: 'done';
      timestamp: string;
      data?: Record<string, unknown> | undefined;
    };

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
