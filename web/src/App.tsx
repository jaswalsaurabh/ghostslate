import React, { useState, useEffect, useRef } from 'react';
import type {
  SystemHealth,
  FrameClassificationData,
  InvestigationTraceEvent,
  GroundingReport,
} from './types.js';
import { Header } from './components/Header.js';
import { KpiStrip } from './components/KpiStrip.js';
import { VisionSection } from './components/VisionSection.js';
import { InvestigationSection } from './components/InvestigationSection.js';
import { CheckCircle2 } from 'lucide-react';
import { useClickHouseMetrics } from './hooks/use-clickhouse-metrics.js';

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

  // Investigation State
  const [investigating, setInvestigating] = useState<boolean>(false);
  const [investigationTrace, setInvestigationTrace] = useState<InvestigationTraceEvent[]>([]);
  const [finalDiagnosis, setFinalDiagnosis] = useState<string | null>(null);
  const [groundingReport, setGroundingReport] = useState<GroundingReport | undefined>(undefined);

  // Grounded ClickHouse Metrics Hook
  const kpiMetrics = useClickHouseMetrics(investigationTrace);

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
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 35);
    }
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
    setInvestigating(true);
    setInvestigationTrace([]);
    setFinalDiagnosis(null);
    setGroundingReport(undefined);

    const prompt =
      activeScenario === 'slate'
        ? `Vision classifier detected a SLATE BLEED on channel ch-01 at timestamp ${currentTime.toFixed(1)}s. Correlate with SCTE-35 cue logs and identify offending SSP and latency.`
        : 'Investigate ad stitch performance and latency metrics across SSPs for channel ch-01.';

    try {
      const response = await fetch('/api/investigate/spike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}`;
        try {
          const errData = (await response.json()) as {
            error?: { code?: string; message?: string };
          };
          if (errData?.error?.message) errMessage = errData.error.message;
        } catch {
          // ignore
        }
        throw new Error(errMessage);
      }
      if (!response.body) throw new Error('No SSE stream in response');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          if (!block.trim()) continue;
          for (const line of block.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6)) as InvestigationTraceEvent;
                setInvestigationTrace((prev: InvestigationTraceEvent[]) => [...prev, event]);
                if (event.type === 'diagnosis' && event.data?.diagnosis) {
                  setFinalDiagnosis(String(event.data.diagnosis));
                  if (event.data?.grounding) {
                    setGroundingReport(event.data.grounding as GroundingReport);
                  }
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInvestigationTrace((prev: InvestigationTraceEvent[]) => [
        ...prev,
        {
          type: 'error',
          timestamp: new Date().toISOString(),
          data: { error: msg },
        },
      ]);
    } finally {
      setInvestigating(false);
    }
  };

  const handleRemediate = (action: 'reroute' | 'buffer') => {
    if (action === 'reroute') {
      const sspLabel =
        kpiMetrics.offendingSsp && kpiMetrics.offendingSsp !== '—'
          ? kpiMetrics.offendingSsp
          : 'offending SSP';
      showToast(
        `📋 Remediation policy generated: Reroute traffic from ${sspLabel}. Staged for operator review.`,
      );
    } else {
      showToast(
        '📋 Remediation policy generated: Extend SCTE-35 pre-roll buffer to 450ms. Staged for operator review.',
      );
    }
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
            onRunInvestigation={runInvestigation}
            investigationTrace={investigationTrace}
            finalDiagnosis={finalDiagnosis}
            groundingReport={groundingReport}
            onRemediate={handleRemediate}
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
