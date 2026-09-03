import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_TOAST_DURATION_MS = 3_500;

export interface UseToastResult {
  message: string | null;
  showToast: (message: string) => void;
  dismissToast: () => void;
}

export function useToast(durationMs = DEFAULT_TOAST_DURATION_MS): UseToastResult {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismissToast = useCallback(() => {
    clearTimer();
    setMessage(null);
  }, [clearTimer]);

  const showToast = useCallback(
    (nextMessage: string) => {
      clearTimer();
      setMessage(nextMessage);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setMessage(null);
      }, durationMs);
    },
    [clearTimer, durationMs],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { message, showToast, dismissToast };
}
