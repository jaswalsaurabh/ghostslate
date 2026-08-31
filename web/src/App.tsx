import { useMemo, useState } from 'react';
import { CircleCheck, CircleX, Info, X } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { frameClassificationSchema } from './api/index.js';
import { CaseOverview } from './components/CaseOverview.js';
import { Header, type VertexRuntimeState } from './components/Header.js';
import { InvestigationPanel, type TraceFilter } from './components/InvestigationPanel.js';
import { VisionPanel } from './components/VisionPanel.js';
import type { InvestigationCaseId } from './config/index.js';
import { useClickHouseMetrics } from './hooks/use-clickhouse-metrics.js';
import { useFrameClassification } from './hooks/use-frame-classification.js';
import { useHealth } from './hooks/use-health.js';
import { useInvestigationCase } from './hooks/use-investigation-case.js';
import { useInvestigationStream } from './hooks/use-investigation-stream.js';
import { useRemediation } from './hooks/use-remediation.js';
import { useTheme } from './hooks/use-theme.js';
import { useVideoPlayer } from './hooks/use-video-player.js';
import { downloadEvidenceJson, downloadEvidenceMarkdown } from './utils/evidence-export.js';

export function App() {
  const scenarioState = useInvestigationCase();
  const { activeCaseId, activeCase, cases, selectCase: setActiveCaseId } = scenarioState;
  const { theme, toggleTheme } = useTheme();
  const [traceFilter, setTraceFilter] = useState<TraceFilter>('all');
  const health = useHealth();
  const player = useVideoPlayer();
  const manualVision = useFrameClassification();
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

  if (!activeCase || !activeCaseId) {
    return (
      <main className="war-room-shell flex min-h-screen items-center justify-center py-12 text-center">
        <div className="max-w-xl rounded-2xl border border-border-subtle bg-surface-panel p-6 shadow-panel">
          <h1 className="text-incident-title font-bold text-text-primary">
            {scenarioState.loading ? 'Loading investigation scenarios' : 'Scenarios unavailable'}
          </h1>
          <p className="mt-2 text-section text-text-secondary">
            {scenarioState.error ?? 'Preparing the server-owned GhostSlate scenario catalog.'}
          </p>
        </div>
      </main>
    );
  }

  const selectCase = (nextCase: InvestigationCaseId) => {
    if (nextCase === activeCaseId) return;
    investigation.resetInvestigation();
    manualVision.reset();
    player.reset();
    setTraceFilter('all');
    setActiveCaseId(nextCase);
    toast.info('Investigation case loaded', {
      description: `${cases.find((scenario) => scenario.id === nextCase)?.label ?? 'Scenario'} is ready to run against the configured evidence window.`,
    });
  };

  const runInvestigation = () => {
    manualVision.reset();
    void investigation.startInvestigation({
      scenarioId: activeCase.id,
      prompt: activeCase.prompt,
    });
    toast.info('Investigation started', {
      description: `Running ${activeCase.label.toLowerCase()} through the live forensic pipeline.`,
    });
  };

  const evidenceExport = {
    scenario: {
      id: activeCase.id,
      label: activeCase.label,
      prompt: activeCase.prompt,
      channel: activeCase.channel,
      from: activeCase.from,
      to: activeCase.to,
    },
    runKey: investigation.runKey ?? 'unassigned-run',
    executionMode: investigation.executionMode ?? undefined,
    trace: investigation.investigationTrace,
    finalDiagnosis: investigation.finalDiagnosis ?? '',
    grounding: investigation.groundingReport,
    evidenceSummary: metrics.evidenceSummary,
    remediation: remediation.remediation,
    metrics,
  };

  const classifyFrame = async (timestamp?: number) => {
    const targetTimestamp =
      typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : player.currentTime;
    const result = await manualVision.classify({
      scenarioId: activeCase.id,
      timestamp: targetTimestamp,
    });
    if (result) {
      toast.success('Operator sample classified', {
        description: `Gemini Vision returned ${result.classification.toUpperCase()} for the selected frame.`,
      });
    }
  };

  return (
    <div className="min-h-screen font-sans text-text-primary selection:bg-interactive selection:text-interactive-fg">
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
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main id="war-room" className="war-room-shell pb-10 pt-6 max-md:pt-3">
        <CaseOverview
          activeCase={activeCase}
          cases={cases}
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
            onClassify={(timestamp) => void classifyFrame(timestamp)}
            agentResult={agentFrame}
            evidenceSummary={metrics.evidenceSummary}
          />

          <InvestigationPanel
            activeCase={activeCase}
            executionMode={investigation.executionMode}
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
            onExportEvidenceJson={() => downloadEvidenceJson(evidenceExport)}
            onExportEvidenceMarkdown={() => downloadEvidenceMarkdown(evidenceExport)}
          />
        </div>
      </main>

      <Toaster
        position="bottom-right"
        theme={theme}
        closeButton
        expand
        visibleToasts={4}
        gap={10}
        duration={4_500}
        toastOptions={{
          className: 'ghostslate-toast',
          classNames: {
            title: 'font-sans text-forensic-meta font-bold tracking-label text-text-primary',
            description: 'font-sans text-compact leading-section text-text-secondary',
            closeButton: 'ghostslate-toast-close',
          },
        }}
        icons={{
          success: <CircleCheck aria-hidden="true" className="size-4 text-status-success" />,
          info: <Info aria-hidden="true" className="size-4 text-interactive" />,
          error: <CircleX aria-hidden="true" className="size-4 text-status-critical" />,
          close: <X aria-hidden="true" className="size-3.5" />,
        }}
      />
    </div>
  );
}
