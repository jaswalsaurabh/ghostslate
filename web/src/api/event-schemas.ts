import { z } from 'zod';
import {
  frameClassificationSchema,
  groundedKpiPayloadSchema,
  groundingReportSchema,
  optionalNonNegative,
  remediationStateSchema,
} from './schemas.js';

export const statusEventSchema = z.object({
  type: z.literal('status'),
  timestamp: z.string().min(1),
  data: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
});

export const toolCallEventSchema = z.object({
  type: z.literal('tool_call'),
  timestamp: z.string().min(1),
  data: z.object({
    name: z.string(),
    args: z.record(z.string(), z.unknown()).default({}),
  }),
});

export const toolResultEventSchema = z.object({
  type: z.literal('tool_result'),
  timestamp: z.string().min(1),
  data: z.object({
    name: z.string(),
    sql: z.string().optional(),
    result: z.string().optional(),
    isError: z.boolean().optional(),
    durationMs: optionalNonNegative,
    rowsReturned: optionalNonNegative,
    rowsScanned: optionalNonNegative,
  }),
});

export const visionCallEventSchema = z.object({
  type: z.literal('vision_call'),
  timestamp: z.string().min(1),
  data: z.object({
    name: z.string(),
    args: z.record(z.string(), z.unknown()).default({}),
  }),
});

export const frameClassifiedEventSchema = z.object({
  type: z.literal('frame_classified'),
  timestamp: z.string().min(1),
  data: frameClassificationSchema.extend({
    name: z.string().optional(),
    args: z.record(z.string(), z.unknown()).optional(),
    durationMs: optionalNonNegative,
    latencyMs: optionalNonNegative,
  }),
});

export const metricsEventSchema = z.object({
  type: z.literal('metrics'),
  timestamp: z.string().min(1),
  data: groundedKpiPayloadSchema.optional(),
});

export const reasoningEventSchema = z.object({
  type: z.literal('reasoning'),
  timestamp: z.string().min(1),
  data: z.object({
    hypothesis: z.string().optional(),
    text: z.string().optional(),
    message: z.string().optional(),
    turn: z.number().int().positive().optional(),
  }),
});

export const diagnosisEventSchema = z.object({
  type: z.literal('diagnosis'),
  timestamp: z.string().min(1),
  data: z.object({
    diagnosis: z.string().optional(),
    grounding: groundingReportSchema.optional(),
    remediation: remediationStateSchema.optional(),
  }),
});

export const errorEventSchema = z.object({
  type: z.literal('error'),
  timestamp: z.string().min(1),
  data: z
    .object({
      error: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
});

export const doneEventSchema = z.object({
  type: z.literal('done'),
  timestamp: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const investigationEventSchema = z.discriminatedUnion('type', [
  statusEventSchema,
  toolCallEventSchema,
  toolResultEventSchema,
  visionCallEventSchema,
  frameClassifiedEventSchema,
  metricsEventSchema,
  reasoningEventSchema,
  diagnosisEventSchema,
  errorEventSchema,
  doneEventSchema,
]);
