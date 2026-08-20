export interface SystemHealth {
  status: string;
  service: string;
  uptimeSeconds: number;
  mcp?: {
    connected: boolean;
    latencyMs?: number;
  };
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
  timestampSeconds?: number;
  frameBase64?: string;
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

export interface InvestigationRunResponse {
  runKey: string;
  created: boolean;
}

export interface InvestigationTraceEvent {
  type:
    | 'status'
    | 'tool_call'
    | 'tool_result'
    | 'vision_call'
    | 'frame_classified'
    | 'metrics'
    | 'reasoning'
    | 'diagnosis'
    | 'error'
    | 'done';
  timestamp: string;
  data?: {
    message?: string;
    name?: string;
    args?: Record<string, unknown>;
    sql?: string;
    result?: string;
    rowsReturned?: number;
    rowsScanned?: number;
    durationMs?: number;
    isError?: boolean;
    error?: string;
    diagnosis?: string;
    hypothesis?: string;
    turn?: number;
    grounding?: GroundingReport;
    remediation?: RemediationDecision;
    [key: string]: unknown;
  };
}

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
