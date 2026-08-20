import { z } from 'zod';

export const finiteNonNegative = z.number().finite().nonnegative();
export const optionalNonNegative = finiteNonNegative.optional();
export const apiValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const apiErrorSchema = z.object({
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
});

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().min(1),
  uptimeSeconds: finiteNonNegative,
  service: z.string().min(1),
  mcp: z
    .object({
      connected: z.boolean(),
      latencyMs: optionalNonNegative,
    })
    .optional(),
});

export const frameClassificationSchema = z.object({
  classification: z.enum(['slate', 'ad', 'content']),
  confidence: z.number().finite().min(0).max(1),
  slate_type: z.enum(['looping_card', 'black_screen', 'static_logo']).nullable(),
  text_detected: z.string(),
  visual_summary: z.string(),
  contentHash: z.string().min(1),
  cached: z.boolean(),
  timestampSeconds: optionalNonNegative,
  frameBase64: z.string().optional(),
  latencyMs: optionalNonNegative,
});

export const visionResponseSchema = z.object({
  success: z.literal(true),
  latencyMs: finiteNonNegative,
  data: frameClassificationSchema,
});

export const investigationStartResponseSchema = z.object({
  runKey: z.string().min(1),
  created: z.boolean(),
});

export const groundingReportSchema = z.object({
  grounded: z.boolean(),
  violations: z.array(
    z.object({
      claim: z.string(),
      context: z.string(),
    }),
  ),
  checkedClaims: z.number().int().nonnegative(),
});

export const remediationProposalSchema = z.object({
  action: z.literal('reroute_ssp_cohort'),
  target: z.object({
    channelId: z.string(),
    sspId: z.string(),
    deviceClass: z.string(),
    codec: z.string(),
    daypart: z.string(),
  }),
  window: z.object({
    from: z.string(),
    to: z.string(),
  }),
  evidence: z.object({
    cues: finiteNonNegative,
    unmonetizedImpressions: finiteNonNegative,
    unmonetizedPct: finiteNonNegative,
    p95AuctionMs: finiteNonNegative,
    stitcherDeadlineMs: finiteNonNegative,
  }),
});

export const remediationEmissionSchema = z.object({
  emissionId: z.string(),
  runKey: z.string(),
  approvedAt: z.string(),
  emittedAt: z.string(),
});

export const remediationStateSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('unavailable'),
    reason: z.enum(['UNGROUNDED', 'INSUFFICIENT_EVIDENCE', 'NO_INCIDENT']),
  }),
  z.object({
    status: z.literal('staged'),
    proposal: remediationProposalSchema,
  }),
  z.object({
    status: z.literal('emitted'),
    proposal: remediationProposalSchema,
    emission: remediationEmissionSchema,
  }),
]);

export const evidenceCandidateSchema = z.object({
  basis: z.enum(['selected_incident', 'maximum_observed']),
  channelId: z.string(),
  sspId: z.string(),
  deviceClass: z.string(),
  codec: z.string(),
  daypart: z.string(),
  cues: finiteNonNegative,
  totalAttempts: finiteNonNegative,
  unmonetizedImpressions: finiteNonNegative,
  unmonetizedPct: finiteNonNegative,
  p95AuctionMs: finiteNonNegative,
  cpmUsd: finiteNonNegative.nullable(),
});

export const evidenceSummarySchema = z.object({
  outcome: z.enum(['incident', 'no_incident']),
  reason: z.enum([
    'ISOLATED_ANOMALY',
    'INSUFFICIENT_SAMPLE_SIZE',
    'BELOW_FAILURE_THRESHOLD',
    'LONE_COHORT',
    'DIFFUSE_VARIATION',
    'NO_DATA',
  ]),
  candidate: evidenceCandidateSchema,
  revenueLossUsd: finiteNonNegative.nullable(),
  thresholds: z.object({
    minimumCues: finiteNonNegative,
    incidentFailurePct: finiteNonNegative,
    cohortDispersionPp: finiteNonNegative,
    stitcherDeadlineMs: finiteNonNegative,
    hardAuctionTimeoutMs: finiteNonNegative,
  }),
  query: z.object({
    rowsReturned: finiteNonNegative,
    rowsScanned: finiteNonNegative.nullable(),
    durationMs: finiteNonNegative.nullable(),
  }),
});

export const metricVariantSchema = z.enum([
  'critical',
  'warning',
  'success',
  'interactive',
  'neutral',
]);

export const groundedKpiPayloadSchema = z.object({
  evidenceSummary: evidenceSummarySchema.nullable().optional(),
  revenueLoss: z.string().nullable().optional(),
  revenueLossSubtext: z.string().nullable().optional(),
  revenueLossVariant: metricVariantSchema.default('neutral'),
  revenueLossTag: z.string().nullable().optional(),
  slateBleedRate: z.string().nullable().optional(),
  slateBleedSubtext: z.string().nullable().optional(),
  slateBleedVariant: metricVariantSchema.default('neutral'),
  slateBleedTag: z.string().nullable().optional(),
  offendingSsp: z.string().nullable().optional(),
  sspLatency: z.string().nullable().optional(),
  sspSubtext: z.string().nullable().optional(),
  sspVariant: metricVariantSchema.default('neutral'),
  scannedLogs: z.string().nullable().optional(),
  scannedLogsSubtext: z.string().nullable().optional(),
  scannedLogsTag: z.string().nullable().optional(),
  isGroundedFromMcp: z.boolean().default(false),
  rateCardFromQuery: z.boolean().default(false),
});

export const getRemediationResponseSchema = z.object({
  remediation: remediationStateSchema,
});

export const approveRemediationResponseSchema = z.object({
  created: z.boolean(),
  remediation: z.object({
    status: z.literal('emitted'),
    proposal: remediationProposalSchema,
    emission: remediationEmissionSchema,
  }),
});

export const mcpQueryDataSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(apiValueSchema)),
});
