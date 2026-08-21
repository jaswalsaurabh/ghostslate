import { useCallback, useEffect, useState } from 'react';
import { decodeHealthResponse, getApiErrorMessage } from '../api/index.js';
import type { SystemHealth } from '../types.js';

const HEALTH_POLL_INTERVAL_MS = 15_000;

export interface UseHealthResult {
  health: SystemHealth | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useHealth(): UseHealthResult {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/health');
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response));
      }
      const decoded = decodeHealthResponse(await response.json());
      setHealth(decoded);
      setError(null);
    } catch (caught: unknown) {
      setHealth(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), HEALTH_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { health, loading, error, refresh };
}
