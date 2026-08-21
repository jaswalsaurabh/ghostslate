import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeVisionResponse, getApiErrorMessage } from '../api/index.js';
import type { FrameClassificationData } from '../types.js';

export interface FrameClassificationInput {
  video: string;
  timestamp: number;
}

export interface UseFrameClassificationResult {
  classification: FrameClassificationData | null;
  latencyMs: number | null;
  classifying: boolean;
  error: string | null;
  classify: (input: FrameClassificationInput) => Promise<FrameClassificationData | null>;
  reset: () => void;
}

export function useFrameClassification(): UseFrameClassificationResult {
  const [classification, setClassification] = useState<FrameClassificationData | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setClassification(null);
    setLatencyMs(null);
    setClassifying(false);
    setError(null);
  }, []);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  const classify = useCallback(async ({ video, timestamp }: FrameClassificationInput) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setClassifying(true);
    setError(null);

    try {
      const response = await fetch('/api/vision/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video, timestamp }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response));
      }

      const decoded = decodeVisionResponse(await response.json());
      if (requestRef.current !== controller) return null;
      setClassification(decoded.data);
      setLatencyMs(decoded.latencyMs);
      return decoded.data;
    } catch (caught: unknown) {
      if (controller.signal.aborted) return null;
      setClassification(null);
      setLatencyMs(null);
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setClassifying(false);
      }
    }
  }, []);

  return { classification, latencyMs, classifying, error, classify, reset };
}
