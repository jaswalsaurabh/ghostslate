import { useCallback, useState } from 'react';
import {
  DEFAULT_INVESTIGATION_CASE_ID,
  INVESTIGATION_CASES,
  type InvestigationCaseConfig,
  type InvestigationCaseId,
} from '../config/index.js';

export interface UseInvestigationCaseResult {
  activeCaseId: InvestigationCaseId;
  activeCase: InvestigationCaseConfig;
  selectCase: (id: InvestigationCaseId) => void;
}

export function useInvestigationCase(
  initialCaseId: InvestigationCaseId = DEFAULT_INVESTIGATION_CASE_ID,
): UseInvestigationCaseResult {
  const [activeCaseId, setActiveCaseId] = useState<InvestigationCaseId>(initialCaseId);
  const selectCase = useCallback((id: InvestigationCaseId) => setActiveCaseId(id), []);

  return {
    activeCaseId,
    activeCase: INVESTIGATION_CASES[activeCaseId],
    selectCase,
  };
}
