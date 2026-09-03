import { useCallback, useEffect, useMemo, useState } from 'react';
import { decodeScenarioCatalog, getApiErrorMessage } from '../api/index.js';
import type {
  InvestigationCaseConfig,
  InvestigationCaseId,
  InvestigationScenarioCatalog,
} from '../config/index.js';

export interface UseInvestigationCaseResult {
  activeCaseId: InvestigationCaseId | null;
  activeCase: InvestigationCaseConfig | null;
  cases: readonly InvestigationCaseConfig[];
  loading: boolean;
  error: string | null;
  selectCase: (id: InvestigationCaseId) => void;
}

export function useInvestigationCase(): UseInvestigationCaseResult {
  const [catalog, setCatalog] = useState<InvestigationScenarioCatalog | null>(null);
  const [activeCaseId, setActiveCaseId] = useState<InvestigationCaseId | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/investigation-scenarios', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await getApiErrorMessage(response));
        const decoded = decodeScenarioCatalog(await response.json());
        setCatalog(decoded);
        setActiveCaseId(decoded.defaultScenarioId);
        setError(null);
      } catch (caught: unknown) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const activeCase = useMemo(
    () => catalog?.scenarios.find((scenario) => scenario.id === activeCaseId) ?? null,
    [activeCaseId, catalog],
  );

  const selectCase = useCallback(
    (id: InvestigationCaseId) => {
      if (catalog?.scenarios.some((scenario) => scenario.id === id)) setActiveCaseId(id);
    },
    [catalog],
  );

  return {
    activeCaseId,
    activeCase,
    cases: catalog?.scenarios ?? [],
    loading,
    error,
    selectCase,
  };
}
