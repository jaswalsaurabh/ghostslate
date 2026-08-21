import { z } from 'zod';
import type {
  FrameClassificationData,
  InvestigationRunResponse,
  InvestigationTraceEvent,
  RemediationState,
  SystemHealth,
} from '../types.js';
import {
  apiErrorSchema,
  approveRemediationResponseSchema,
  getRemediationResponseSchema,
  healthResponseSchema,
  investigationStartResponseSchema,
  visionResponseSchema,
} from './schemas.js';
import { investigationEventSchema } from './event-schemas.js';

export interface VisionClassificationResponse {
  success: true;
  latencyMs: number;
  data: FrameClassificationData;
}

export interface ApproveRemediationResponse {
  created: boolean;
  remediation: Extract<RemediationState, { status: 'emitted' }>;
}

function decode<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid ${label} received from server.`);
  }
  return result.data;
}

export function decodeHealthResponse(value: unknown): SystemHealth {
  return decode(healthResponseSchema, value, 'health response');
}

export function decodeVisionResponse(value: unknown): VisionClassificationResponse {
  return decode(visionResponseSchema, value, 'Vision response');
}

export function decodeInvestigationStartResponse(value: unknown): InvestigationRunResponse {
  return decode(investigationStartResponseSchema, value, 'investigation response');
}

export function decodeInvestigationEvent(value: unknown): InvestigationTraceEvent {
  return decode(investigationEventSchema, value, 'investigation event');
}

export function decodeGetRemediationResponse(value: unknown): { remediation: RemediationState } {
  return decode(getRemediationResponseSchema, value, 'remediation response');
}

export function decodeApproveRemediationResponse(value: unknown): ApproveRemediationResponse {
  return decode(approveRemediationResponseSchema, value, 'approval response');
}

export async function getApiErrorMessage(response: Response): Promise<string> {
  const fallback = `HTTP ${response.status}`;
  try {
    const result = apiErrorSchema.safeParse(await response.json());
    return result.success && result.data.error?.message ? result.data.error.message : fallback;
  } catch {
    return fallback;
  }
}
