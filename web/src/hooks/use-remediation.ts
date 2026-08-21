import { useState, useEffect, useCallback, useRef } from 'react';
import {
  decodeApproveRemediationResponse,
  decodeGetRemediationResponse,
  getApiErrorMessage,
} from '../api/index.js';
import type { RemediationState } from '../types.js';

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
        throw new Error(await getApiErrorMessage(response));
      }

      const decoded = decodeGetRemediationResponse(await response.json());

      if (activeRunKeyRef.current === targetRunKey) {
        setRemediation(decoded.remediation);
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
        throw new Error(await getApiErrorMessage(response));
      }

      const decoded = decodeApproveRemediationResponse(await response.json());

      if (activeRunKeyRef.current === runKey) {
        setRemediation(decoded.remediation);
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
