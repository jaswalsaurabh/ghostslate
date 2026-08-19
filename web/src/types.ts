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
    [key: string]: unknown;
  };
}
