import { useState, useEffect, useCallback, useRef } from 'react';
import { z } from 'zod';
import type { RemediationState } from '../types.js';

const RemediationProposalSchema = z.object({
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
    cues: z.number(),
    unmonetizedImpressions: z.number(),
    unmonetizedPct: z.number(),
    p95AuctionMs: z.number(),
    stitcherDeadlineMs: z.number(),
  }),
});

const RemediationEmissionSchema = z.object({
  emissionId: z.string(),
  runKey: z.string(),
  approvedAt: z.string(),
  emittedAt: z.string(),
});

const RemediationStateSchema: z.ZodType<RemediationState> = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('unavailable'),
    reason: z.enum(['UNGROUNDED', 'INSUFFICIENT_EVIDENCE', 'NO_INCIDENT']),
  }),
  z.object({
    status: z.literal('staged'),
    proposal: RemediationProposalSchema,
  }),
  z.object({
    status: z.literal('emitted'),
    proposal: RemediationProposalSchema,
    emission: RemediationEmissionSchema,
  }),
]);

const GetRemediationResponseSchema = z.object({
  remediation: RemediationStateSchema,
});

const ApproveRemediationResponseSchema = z.object({
  created: z.boolean(),
  remediation: z.object({
    status: z.literal('emitted'),
    proposal: RemediationProposalSchema,
    emission: RemediationEmissionSchema,
  }),
});

export interface UseRemediationOptions {
  runKey: string | null;
  ready: boolean;
}

export interface UseRemediationResult {
  remediation: RemediationState | null;
  loading: boolean;
  approving: boolean;
  error: string | null;
  approve: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useRemediation({ runKey, ready }: UseRemediationOptions): UseRemediationResult {
  const [remediation, setRemediation] = useState<RemediationState | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [approving, setApproving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeRunKeyRef = useRef<string | null>(runKey);
  activeRunKeyRef.current = runKey;

  const fetchRemediation = useCallback(async (targetRunKey: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/investigate/runs/${encodeURIComponent(targetRunKey)}/remediation`,
      );

      if (activeRunKeyRef.current !== targetRunKey) {
        return;
      }

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}`;
        try {
          const errData = (await response.json()) as {
            error?: { code?: string; message?: string };
          };
          if (errData?.error?.message) {
            errMessage = errData.error.message;
          }
        } catch {
          // ignore parse error
        }
        throw new Error(errMessage);
      }

      const json: unknown = await response.json();
      const parsed = GetRemediationResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error('Invalid remediation response received from server.');
      }

      if (activeRunKeyRef.current === targetRunKey) {
        setRemediation(parsed.data.remediation);
      }
    } catch (err: unknown) {
      if (activeRunKeyRef.current === targetRunKey) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    } finally {
      if (activeRunKeyRef.current === targetRunKey) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!runKey || !ready) {
      setRemediation(null);
      setLoading(false);
      setApproving(false);
      setError(null);
      return;
    }

    void fetchRemediation(runKey);
  }, [runKey, ready, fetchRemediation]);

  const refresh = useCallback(async () => {
    if (runKey && ready) {
      await fetchRemediation(runKey);
    }
  }, [runKey, ready, fetchRemediation]);

  const approve = useCallback(async () => {
    if (!runKey || approving) {
      return;
    }

    setApproving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/investigate/runs/${encodeURIComponent(runKey)}/remediation/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );

      if (activeRunKeyRef.current !== runKey) {
        return;
      }

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}`;
        try {
          const errData = (await response.json()) as {
            error?: { code?: string; message?: string };
          };
          if (errData?.error?.message) {
            errMessage = errData.error.message;
          }
        } catch {
          // ignore parse error
        }
        throw new Error(errMessage);
      }

      const json: unknown = await response.json();
      const parsed = ApproveRemediationResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error('Invalid approval response received from server.');
      }

      if (activeRunKeyRef.current === runKey) {
        setRemediation(parsed.data.remediation);
      }
    } catch (err: unknown) {
      if (activeRunKeyRef.current === runKey) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    } finally {
      if (activeRunKeyRef.current === runKey) {
        setApproving(false);
      }
    }
  }, [runKey, approving]);

  return {
    remediation,
    loading,
    approving,
    error,
    approve,
    refresh,
  };
}
