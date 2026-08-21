import { useMemo, useState } from 'react';
import { frameClassificationSchema } from './api/index.js';
import { CaseOverview } from './components/CaseOverview.js';
import { Header, type VertexRuntimeState } from './components/Header.js';
import { InvestigationPanel, type TraceFilter } from './components/InvestigationPanel.js';
import { VisionPanel } from './components/VisionPanel.js';
import { Toast, ToastRegion } from './components/ui/index.js';
import { INVESTIGATION_CASES, type InvestigationCaseId } from './config/index.js';
import { useClickHouseMetrics } from './hooks/use-clickhouse-metrics.js';
import { useFrameClassification } from './hooks/use-frame-classification.js';
import { useHealth } from './hooks/use-health.js';
import { useInvestigationCase } from './hooks/use-investigation-case.js';
import { useInvestigationStream } from './hooks/use-investigation-stream.js';
import { useRemediation } from './hooks/use-remediation.js';
import { useToast } from './hooks/use-toast.js';
import { useVideoPlayer } from './hooks/use-video-player.js';

export function App() {
  const { activeCaseId, activeCase, selectCase: setActiveCaseId } = useInvestigationCase();
  const [traceFilter, setTraceFilter] = useState<TraceFilter>('all');
  const health = useHealth();
  const player = useVideoPlayer();
  const manualVision = useFrameClassification();
  const toast = useToast();
  const investigation = useInvestigationStream();
  const metrics = useClickHouseMetrics(investigation.investigationTrace);
  const remediation = useRemediation({
    runKey: investigation.runKey,
    ready: Boolean(investigation.finalDiagnosis && !investigation.investigating),
  });

  const agentFrame = useMemo(() => {
    for (let index = investigation.investigationTrace.length - 1; index >= 0; index -= 1) {
      const event = investigation.investigationTrace[index];
      if (event?.type !== 'frame_classified') continue;
      const parsed = frameClassificationSchema.safeParse(event.data);
      if (parsed.success) {
        return {
          ...parsed.data,
          latencyMs:
            parsed.data.latencyMs ??
            (typeof event.data?.durationMs === 'number' ? event.data.durationMs : undefined),
        };
      }
    }
    return null;
  }, [investigation.investigationTrace]);

  const vertexState: VertexRuntimeState = useMemo(() => {
    if (
      manualVision.error ||
      investigation.investigationTrace.some((event) => event.type === 'error')
    )
      return 'error';
    if (manualVision.classifying || investigation.investigating) return 'running';
    if (manualVision.classification || agentFrame || investigation.finalDiagnosis)
      return 'verified';
    return 'idle';
  }, [
    agentFrame,
    investigation.finalDiagnosis,
    investigation.investigating,
    investigation.investigationTrace,
    manualVision.classification,
    manualVision.classifying,
    manualVision.error,
  ]);

  const selectCase = (nextCase: InvestigationCaseId) => {
    if (nextCase === activeCaseId) return;
    investigation.resetInvestigation();
    manualVision.reset();
    player.reset();
    setTraceFilter('all');
    setActiveCaseId(nextCase);
    toast.showToast(`${INVESTIGATION_CASES[nextCase].label} loaded`);
  };

  const runInvestigation = () => {
    manualVision.reset();
    void investigation.startInvestigation({
      prompt: activeCase.prompt,
      channel: activeCase.channel,
      from: activeCase.from,
      to: activeCase.to,
    });
    toast.showToast(`Running ${activeCase.label.toLowerCase()} through the live forensic pipeline`);
  };

  const classifyFrame = async () => {
    const result = await manualVision.classify({
      video: activeCase.videoFile,
      timestamp: player.currentTime,
    });
    if (result) {
      toast.showToast(`Operator sample classified as ${result.classification.toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen bg-surface-base font-sans text-text-primary selection:bg-interactive selection:text-interactive-fg">
      <a
        href="#war-room"
        className="skip-link fixed left-3 top-3 z-toast rounded-md bg-interactive px-3 py-2 text-interactive-fg transition-transform"
      >
        Skip to forensic workspace
      </a>
      <Header
        health={health.health}
        healthLoading={health.loading}
        healthError={health.error}
        vertexState={vertexState}
      />

      <main id="war-room" className="war-room-shell pb-10 pt-6 max-md:pt-3">
        <CaseOverview
          activeCase={activeCase}
          metrics={metrics}
          investigating={investigation.investigating}
          visionConfirmed={agentFrame?.classification === 'slate'}
          onSelectCase={selectCase}
        />

        <div className="war-room-workspace mt-4">
          <VisionPanel
            activeCase={activeCase}
            videoRef={player.videoRef}
            currentTime={player.currentTime}
            duration={player.duration}
            isPlaying={player.isPlaying}
            onTogglePlay={player.togglePlay}
            onSeek={player.seek}
            onLoadedMetadata={player.handleLoadedMetadata}
            onTimeUpdate={player.handleTimeUpdate}
            onPlay={player.handlePlay}
            onPause={player.handlePause}
            classifying={manualVision.classifying}
            manualResult={manualVision.classification}
            manualLatency={manualVision.latencyMs}
            classificationError={manualVision.error}
            onClassify={() => void classifyFrame()}
            agentResult={agentFrame}
            evidenceSummary={metrics.evidenceSummary}
          />

          <InvestigationPanel
            activeCase={activeCase}
            investigating={investigation.investigating}
            reconnecting={investigation.reconnecting}
            trace={investigation.investigationTrace}
            filter={traceFilter}
            onFilter={setTraceFilter}
            onRun={runInvestigation}
            finalDiagnosis={investigation.finalDiagnosis}
            grounding={investigation.groundingReport}
            evidenceSummary={metrics.evidenceSummary}
            isGroundedFromMcp={metrics.isGroundedFromMcp}
            rateCardFromQuery={metrics.rateCardFromQuery}
            remediation={remediation.remediation}
            remediationLoading={remediation.loading}
            remediationApproving={remediation.approving}
            remediationError={remediation.error}
            onApproveRemediation={remediation.approve}
            onRefreshRemediation={remediation.refresh}
          />
        </div>
      </main>

      {toast.message && (
        <ToastRegion>
          <Toast title={toast.message} tone="success" onDismiss={toast.dismissToast} />
        </ToastRegion>
      )}
    </div>
  );
}
