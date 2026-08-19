export interface SystemHealth {
  status: string;
  service: string;
  uptimeSeconds: number;
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

export interface InvestigationTraceEvent {
  type:
    | 'status'
    | 'tool_call'
    | 'tool_result'
    | 'vision_call'
    | 'frame_classified'
    | 'reasoning'
    | 'diagnosis'
    | 'error'
    | 'done';
  timestamp: string;
  data?: {
    message?: string;
    name?: string;
    args?: Record<string, unknown>;
    result?: string;
    isError?: boolean;
    error?: string;
    diagnosis?: string;
    [key: string]: unknown;
  };
}
