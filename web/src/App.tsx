import React, { useState, useEffect, useRef } from 'react';
import type { SystemHealth, FrameClassificationData } from './types.js';
import { Header } from './components/Header.js';
import { KpiStrip } from './components/KpiStrip.js';
import { VisionSection } from './components/VisionSection.js';
import { InvestigationSection } from './components/InvestigationSection.js';
import { CheckCircle2 } from 'lucide-react';
import { useClickHouseMetrics } from './hooks/use-clickhouse-metrics.js';
import { useInvestigationStream } from './hooks/use-investigation-stream.js';
import { useRemediation } from './hooks/use-remediation.js';

export const App: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Video State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activeScenario, setActiveScenario] = useState<'slate' | 'ad'>('slate');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(35);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Vision State
  const [classifying, setClassifying] = useState<boolean>(false);
  const [classificationResult, setClassificationResult] = useState<FrameClassificationData | null>(
    null,
  );
  const [classificationLatency, setClassificationLatency] = useState<number | null>(null);
  const [classificationError, setClassificationError] = useState<string | null>(null);

  // Investigation Stream Hook
  const {
    runKey,
    investigating,
    reconnecting,
    investigationTrace,
    finalDiagnosis,
    groundingReport,
    startInvestigation,
    resetInvestigation,
  } = useInvestigationStream();

  // Grounded ClickHouse Metrics Hook
  const kpiMetrics = useClickHouseMetrics(investigationTrace);

  // Grounded Remediation Hook
  const {
    remediation,
    loading: remediationLoading,
    approving: remediationApproving,
    error: remediationError,
    approve: approveRemediation,
    refresh: refreshRemediation,
  } = useRemediation({
    runKey,
    ready: Boolean(finalDiagnosis && !investigating),
  });

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const videoSource =
    activeScenario === 'slate' ? '/media/test_stream_slate.mp4' : '/media/test_stream_ad.mp4';

  useEffect(() => {
    let mounted = true;

    const checkHealth = () => {
      fetch('/api/health')
        .then(async (res) => {
          if (!res.ok) {
            let msg = `HTTP ${res.status}`;
            try {
              const errData = (await res.json()) as {
                error?: { code?: string; message?: string };
              };
              if (errData?.error?.message) msg = errData.error.message;
            } catch {
              // ignore
            }
            throw new Error(msg);
          }
          return res.json() as Promise<SystemHealth>;
        })
        .then((data) => {
          if (!mounted) return;
          setHealth(data);
          setHealthLoading(false);
          setHealthError(null);
        })
        .catch((err: Error) => {
          if (!mounted) return;
          setHealthError(err.message);
          setHealthLoading(false);
        });
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) setDuration(videoRef.current.duration || 35);
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSelectScenario = (scenario: 'slate' | 'ad') => {
    setActiveScenario(scenario);
    setClassificationResult(null);
    setClassificationLatency(null);
    setClassificationError(null);
    resetInvestigation();
    handleSeek(0);
    showToast(
      scenario === 'slate'
        ? 'Switched to Scenario A (SSAI Slate Bleed Anomaly)'
        : 'Switched to Scenario B (Clean Ad Pod Monetization)',
    );
  };

  const runClassification = async (timestamp?: number) => {
    const ts = timestamp ?? currentTime;
    setClassifying(true);
    setClassificationError(null);
    const videoFile = activeScenario === 'slate' ? 'test_stream_slate.mp4' : 'test_stream_ad.mp4';

    try {
      const res = await fetch('/api/vision/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video: videoFile,
          timestamp: ts,
        }),
      });

      if (!res.ok) {
        let errMessage = `HTTP ${res.status}`;
        try {
          const errData = (await res.json()) as {
            error?: { code?: string; message?: string };
          };
          if (errData?.error?.message) errMessage = errData.error.message;
        } catch {
          // ignore json parse error
        }
        throw new Error(errMessage);
      }

      const data = (await res.json()) as {
        success: boolean;
        latencyMs: number;
        data: FrameClassificationData;
      };

      setClassificationResult(data.data);
      setClassificationLatency(data.latencyMs);
      showToast(
        `Frame classified: ${data.data.classification.toUpperCase()} (${Math.round(data.data.confidence * 100)}%)`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Classification error:', err);
      setClassificationError(msg);
      setClassificationResult(null);
      setClassificationLatency(null);
    } finally {
      setClassifying(false);
    }
  };

  const runInvestigation = async () => {
    const channel = 'ch-01';
    const from = '2026-08-14T19:00:00.000Z';
    const to = '2026-08-14T23:00:00.000Z';

    const prompt =
      activeScenario === 'slate'
        ? `Vision classifier detected a SLATE BLEED on channel ${channel}. Correlate with SCTE-35 cue logs, isolate offending SSP, device class, and codec dimensions, and compute unmonetized loss.`
        : `Investigate ad stitch performance and latency metrics across SSPs for channel ${channel}.`;

    await startInvestigation({ prompt, channel, from, to });
  };

  return (
    <div className="min-h-screen bg-surface-base text-text-primary flex flex-col font-sans selection:bg-interactive selection:text-interactive-fg transition-colors duration-base">
      {/* Top Header */}
      <Header health={health} healthLoading={healthLoading} healthError={healthError} />

      {/* Main War Room Hub */}
      <main className="flex-1 p-5 max-w-[1720px] mx-auto w-full flex flex-col gap-4">
        {/* Executive KPI HUD Ticker Bar */}
        <KpiStrip metrics={kpiMetrics} />

        {/* Dual Grid: Vision Ingestion + ClickHouse Forensics */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Column 1: Stream Vision Ingestion (5 cols) */}
          <VisionSection
            activeScenario={activeScenario}
            onSelectScenario={handleSelectScenario}
            videoRef={videoRef}
            videoSource={videoSource}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onSeek={handleSeek}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            classifying={classifying}
            onClassify={() => runClassification()}
            classificationResult={classificationResult}
            classificationLatency={classificationLatency}
            classificationError={classificationError}
          />

          {/* Column 2: ClickHouse MCP Core + Forensic Agent Loop (7 cols) */}
          <InvestigationSection
            investigating={investigating}
            reconnecting={reconnecting}
            onRunInvestigation={runInvestigation}
            investigationTrace={investigationTrace}
            finalDiagnosis={finalDiagnosis}
            groundingReport={groundingReport}
            remediation={remediation}
            remediationLoading={remediationLoading}
            remediationApproving={remediationApproving}
            remediationError={remediationError}
            onApproveRemediation={approveRemediation}
            onRefreshRemediation={refreshRemediation}
          />
        </div>
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 px-4 py-3 bg-surface-panel text-text-primary text-xs font-semibold rounded-lg border border-interactive shadow-[0_0_20px_var(--color-interactive-subtle)] flex items-center gap-2.5 z-sticky animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
