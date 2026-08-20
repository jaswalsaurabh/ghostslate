import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  InvestigationTraceEvent,
  InvestigationRunResponse,
  GroundingReport,
} from '../types.js';

export interface UseInvestigationStreamResult {
  runKey: string | null;
  investigating: boolean;
  reconnecting: boolean;
  investigationTrace: InvestigationTraceEvent[];
  finalDiagnosis: string | null;
  groundingReport: GroundingReport | undefined;
  startInvestigation: (input: {
    prompt: string;
    channel: string;
    from: string;
    to: string;
  }) => Promise<void>;
  resetInvestigation: () => void;
}

export function useInvestigationStream(): UseInvestigationStreamResult {
  const [runKey, setRunKey] = useState<string | null>(null);
  const [investigating, setInvestigating] = useState<boolean>(false);
  const [reconnecting, setReconnecting] = useState<boolean>(false);
  const [investigationTrace, setInvestigationTrace] = useState<InvestigationTraceEvent[]>([]);
  const [finalDiagnosis, setFinalDiagnosis] = useState<string | null>(null);
  const [groundingReport, setGroundingReport] = useState<GroundingReport | undefined>(undefined);

  const eventSourceRef = useRef<EventSource | null>(null);

  const closeStream = useCallback(() => {
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
    setInvestigating(false);
    setReconnecting(false);
    setInvestigationTrace([]);
    setFinalDiagnosis(null);
    setGroundingReport(undefined);
  }, [closeStream]);

  const startInvestigation = useCallback(
    async (input: { prompt: string; channel: string; from: string; to: string }) => {
      closeStream();
      setRunKey(null);
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
        });

        if (!response.ok) {
          let errMessage = `HTTP ${response.status}`;
          try {
            const errData = (await response.json()) as {
              error?: { code?: string; message?: string };
            };
            if (errData?.error?.message) errMessage = errData.error.message;
          } catch {
            // ignore JSON parse error
          }
          throw new Error(errMessage);
        }

        const runResponse = (await response.json()) as InvestigationRunResponse;
        const { runKey: currentRunKey } = runResponse;
        setRunKey(currentRunKey);

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
            const parsed = JSON.parse(event.data) as InvestigationTraceEvent;
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
                setGroundingReport(parsed.data.grounding as GroundingReport);
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
    investigating,
    reconnecting,
    investigationTrace,
    finalDiagnosis,
    groundingReport,
    startInvestigation,
    resetInvestigation,
  };
}
