import { useState, useRef, useEffect, useCallback } from 'react';
import {
  decodeInvestigationEvent,
  decodeInvestigationStartResponse,
  getApiErrorMessage,
} from '../api/index.js';
import type { InvestigationTraceEvent, GroundingReport } from '../types.js';

export interface UseInvestigationStreamResult {
  runKey: string | null;
  executionMode: 'live' | 'cached_replay' | null;
  investigating: boolean;
  reconnecting: boolean;
  investigationTrace: InvestigationTraceEvent[];
  finalDiagnosis: string | null;
  groundingReport: GroundingReport | undefined;
  startInvestigation: (input: { scenarioId: string; prompt: string }) => Promise<void>;
  resetInvestigation: () => void;
}

export function useInvestigationStream(): UseInvestigationStreamResult {
  const [runKey, setRunKey] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState<'live' | 'cached_replay' | null>(null);
  const [investigating, setInvestigating] = useState<boolean>(false);
  const [reconnecting, setReconnecting] = useState<boolean>(false);
  const [investigationTrace, setInvestigationTrace] = useState<InvestigationTraceEvent[]>([]);
  const [finalDiagnosis, setFinalDiagnosis] = useState<string | null>(null);
  const [groundingReport, setGroundingReport] = useState<GroundingReport | undefined>(undefined);

  const eventSourceRef = useRef<EventSource | null>(null);
  const startAbortControllerRef = useRef<AbortController | null>(null);

  const closeStream = useCallback(() => {
    if (startAbortControllerRef.current) {
      startAbortControllerRef.current.abort();
      startAbortControllerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      closeStream();
    };
  }, [closeStream]);

  const resetInvestigation = useCallback(() => {
    closeStream();
    setRunKey(null);
    setExecutionMode(null);
    setInvestigating(false);
    setReconnecting(false);
    setInvestigationTrace([]);
    setFinalDiagnosis(null);
    setGroundingReport(undefined);
  }, [closeStream]);

  const startInvestigation = useCallback(
    async (input: { scenarioId: string; prompt: string }) => {
      closeStream();
      const controller = new AbortController();
      startAbortControllerRef.current = controller;

      setRunKey(null);
      setExecutionMode(null);
      setInvestigating(true);
      setReconnecting(false);
      setInvestigationTrace([]);
      setFinalDiagnosis(null);
      setGroundingReport(undefined);

      // Local accumulator array populated from SSE events
      let receivedEvents: InvestigationTraceEvent[] = [];

      const pushEvent = (ev: InvestigationTraceEvent) => {
        receivedEvents.push(ev);
        setInvestigationTrace([...receivedEvents]);
      };

      try {
        const response = await fetch('/api/investigate/spike', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response));
        }

        const runResponse = decodeInvestigationStartResponse(await response.json());
        if (startAbortControllerRef.current !== controller || controller.signal.aborted) {
          return;
        }

        const { runKey: currentRunKey } = runResponse;
        setRunKey(currentRunKey);
        setExecutionMode(runResponse.created ? 'live' : 'cached_replay');

        const es = new EventSource(
          `/api/investigate/runs/${encodeURIComponent(currentRunKey)}/stream`,
        );
        eventSourceRef.current = es;

        es.onopen = () => {
          // On connection or reconnection, server replays buffer from index 0.
          // Reset local event buffer so replay replaces rather than appending duplicates.
          receivedEvents = [];
          setInvestigationTrace([]);
          setReconnecting(false);
        };

        es.onmessage = (event) => {
          try {
            const raw: unknown = JSON.parse(String(event.data));
            const parsed = decodeInvestigationEvent(raw);
            if (parsed.type === 'done') {
              closeStream();
              setReconnecting(false);
              setInvestigating(false);
              return;
            }

            pushEvent(parsed);

            if (parsed.type === 'diagnosis' && parsed.data?.diagnosis) {
              setFinalDiagnosis(String(parsed.data.diagnosis));
              if (parsed.data?.grounding) {
                setGroundingReport(parsed.data.grounding);
              }
            }

            if (parsed.type === 'error') {
              closeStream();
              setReconnecting(false);
              setInvestigating(false);
            }
          } catch (parseErr) {
            console.error('Failed to parse SSE event:', parseErr);
          }
        };

        es.onerror = () => {
          if (es.readyState === EventSource.CONNECTING) {
            setReconnecting(true);
          } else if (es.readyState === EventSource.CLOSED) {
            closeStream();
            setReconnecting(false);
            setInvestigating(false);
            pushEvent({
              type: 'error',
              timestamp: new Date().toISOString(),
              data: { error: 'Stream connection closed (run expired or server restart).' },
            });
          }
        };
      } catch (err: unknown) {
        if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        closeStream();
        setReconnecting(false);
        setInvestigating(false);
        pushEvent({
          type: 'error',
          timestamp: new Date().toISOString(),
          data: { error: msg },
        });
      }
    },
    [closeStream],
  );

  return {
    runKey,
    executionMode,
    investigating,
    reconnecting,
    investigationTrace,
    finalDiagnosis,
    groundingReport,
    startInvestigation,
    resetInvestigation,
  };
}
