import { useEffect, useState, type RefObject } from 'react';
import { Fingerprint, ScanEye, Timer } from 'lucide-react';
import type { InvestigationCaseConfig } from '../config/investigation-cases.js';
import type { FrameClassificationData, InvestigationEvidenceSummary } from '../types.js';
import { EvidenceGateCard } from './EvidenceGateCard.js';
import { BroadcastPlayer } from './vision/BroadcastPlayer.js';
import { BroadcastSampleStrip } from './vision/BroadcastSampleStrip.js';
import { VisionClassificationCard } from './vision/VisionClassificationCard.js';
import { classificationStyles } from './vision/classification-styles.js';
import { SegmentedControl, Tooltip } from './ui/index.js';

interface VisionPanelProps {
  activeCase: InvestigationCaseConfig;
  videoRef: RefObject<HTMLVideoElement | null>;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  onPlay: () => void;
  onPause: () => void;
  classifying: boolean;
  manualResult: FrameClassificationData | null;
  manualLatency: number | null;
  classificationError: string | null;
  onClassify: (timestamp?: number) => void;
  agentResult: FrameClassificationData | null;
  evidenceSummary?: InvestigationEvidenceSummary | undefined;
}

const TIMESTAMP_TOLERANCE_SECONDS = 0.5;

export function VisionPanel(props: VisionPanelProps) {
  const [selectedSource, setSelectedSource] = useState<'agent' | 'manual'>('agent');

  useEffect(() => {
    if (props.manualResult) {
      setSelectedSource('manual');
      if (
        typeof props.manualResult.timestampSeconds === 'number' &&
        Number.isFinite(props.manualResult.timestampSeconds)
      ) {
        props.onSeek(props.manualResult.timestampSeconds);
      }
    }
  }, [props.manualResult]);

  useEffect(() => {
    if (props.agentResult) {
      setSelectedSource('agent');
      if (
        typeof props.agentResult.timestampSeconds === 'number' &&
        Number.isFinite(props.agentResult.timestampSeconds)
      ) {
        props.onSeek(props.agentResult.timestampSeconds);
      }
    }
  }, [props.agentResult]);

  const handleSelectSource = (nextSource: 'agent' | 'manual') => {
    setSelectedSource(nextSource);
    const targetResult = nextSource === 'agent' ? props.agentResult : props.manualResult;
    if (
      targetResult &&
      typeof targetResult.timestampSeconds === 'number' &&
      Number.isFinite(targetResult.timestampSeconds)
    ) {
      props.onSeek(targetResult.timestampSeconds);
    }
  };

  const activeSource =
    selectedSource === 'manual' && props.manualResult
      ? 'manual'
      : props.agentResult
        ? 'agent'
        : props.manualResult
          ? 'manual'
          : null;

  const displayed =
    activeSource === 'manual'
      ? props.manualResult
      : activeSource === 'agent'
        ? props.agentResult
        : null;

  const displayedLatency =
    activeSource === 'manual'
      ? props.manualLatency
      : activeSource === 'agent'
        ? (props.agentResult?.latencyMs ?? null)
        : null;

  const confidence = displayed ? `${Math.round(displayed.confidence * 100)}%` : '—';
  const selectedTime = props.currentTime;
  const displayedStyles = displayed ? classificationStyles[displayed.classification] : null;

  const isAtPlayhead = Boolean(
    displayed &&
    typeof displayed.timestampSeconds === 'number' &&
    Number.isFinite(displayed.timestampSeconds) &&
    Math.abs(props.currentTime - displayed.timestampSeconds) <= TIMESTAMP_TOLERANCE_SECONDS,
  );

  const evidenceAtPlayhead = isAtPlayhead ? displayed : null;
  const playerConfidence = evidenceAtPlayhead
    ? `${Math.round(evidenceAtPlayhead.confidence * 100)}%`
    : '—';

  return (
    <section
      className="war-room-sticky-rail self-start rounded-2xl border border-border-subtle bg-surface-panel shadow-panel-subtle"
      aria-labelledby="vision-title"
    >
      <div className="war-room:sticky war-room:top-0 z-sticky flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle bg-surface-panel/95 backdrop-blur-md p-4 sm:px-5 war-room:short-viewport:static">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 font-sans text-forensic-meta font-bold tracking-module text-interactive">
            01
          </span>
          <div>
            <h2
              id="vision-title"
              className="m-0 mb-1 text-forensic-title font-bold tracking-tight text-text-primary"
            >
              Vision signal
            </h2>
            <p className="m-0 font-sans text-forensic-meta leading-section text-text-muted">
              Gemini multimodal · synthetic evidence stream
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {props.agentResult && props.manualResult ? (
            <SegmentedControl
              label="Selected Vision evidence"
              options={[
                { value: 'agent', label: 'Agent evidence' },
                { value: 'manual', label: 'Operator sample' },
              ]}
              value={selectedSource}
              onValueChange={handleSelectSource}
              size="sm"
              className="font-mono text-xs"
            />
          ) : (
            <span className="font-mono text-section text-text-muted whitespace-nowrap">
              {props.agentResult
                ? 'Agent evidence'
                : props.manualResult
                  ? 'Operator sample'
                  : 'Awaiting evidence'}
            </span>
          )}
        </div>
      </div>

      <BroadcastPlayer
        activeCase={props.activeCase}
        videoRef={props.videoRef}
        currentTime={props.currentTime}
        duration={props.duration}
        isPlaying={props.isPlaying}
        onTogglePlay={props.onTogglePlay}
        onSeek={props.onSeek}
        onLoadedMetadata={props.onLoadedMetadata}
        onTimeUpdate={props.onTimeUpdate}
        onPlay={props.onPlay}
        onPause={props.onPause}
        displayed={evidenceAtPlayhead}
        confidence={playerConfidence}
        classifying={props.classifying}
        onClassify={props.activeCase.manualVisionEnabled ? props.onClassify : undefined}
        classifyDisabled={!props.activeCase.manualVisionEnabled}
      />

      <div className="mx-5 mt-3 grid grid-cols-3 gap-2" aria-label="Selected frame evidence">
        <div className="flex min-w-0 items-center gap-2 rounded-inset border border-border-subtle bg-surface-card p-2.5">
          <Tooltip content="Frame classification" placement="top">
            <span
              aria-label="Frame classification"
              className={`inline-flex size-6 items-center justify-center rounded-md ${displayedStyles?.surface ?? 'bg-surface-hover'} ${displayedStyles?.text ?? 'text-text-muted'}`}
            >
              <ScanEye aria-hidden="true" className="size-3.5" />
            </span>
          </Tooltip>
          <strong
            className={`min-w-0 truncate font-mono text-section font-bold ${displayedStyles?.text ?? 'text-text-muted'}`}
          >
            {displayed?.classification.toUpperCase() ?? 'AWAITING'}
          </strong>
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-inset border border-border-subtle bg-surface-card p-2.5">
          <Tooltip content="Vision analysis latency" placement="top">
            <span
              aria-label="Vision analysis latency"
              className="inline-flex size-6 items-center justify-center rounded-md bg-interactive-surface text-interactive"
            >
              <Timer aria-hidden="true" className="size-3.5" />
            </span>
          </Tooltip>
          <strong className="min-w-0 truncate font-mono text-section font-bold text-text-primary">
            {displayedLatency === null ? '—' : `${(displayedLatency / 1000).toFixed(2)} s`}
          </strong>
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-inset border border-border-subtle bg-surface-card p-2.5">
          <Tooltip content="Content hash for the classified frame" placement="top">
            <span
              aria-label="Content hash for the classified frame"
              className="inline-flex size-6 items-center justify-center rounded-md bg-surface-hover text-text-muted"
            >
              <Fingerprint aria-hidden="true" className="size-3.5" />
            </span>
          </Tooltip>
          <strong className="min-w-0 truncate font-mono text-section font-bold text-text-primary">
            {displayed
              ? `${displayed.contentHash.slice(0, 4)}…${displayed.contentHash.slice(-4)}`
              : '—'}
          </strong>
        </div>
      </div>

      <BroadcastSampleStrip
        activeCase={props.activeCase}
        selectedTime={selectedTime}
        onSeek={props.onSeek}
      />

      <VisionClassificationCard
        displayed={displayed}
        confidence={confidence}
        activeSource={activeSource}
        currentTime={props.currentTime}
        classifying={props.classifying}
        onClassify={props.onClassify}
      />

      {props.classificationError && (
        <p role="alert" className="mx-5 mb-3 text-caption text-status-critical">
          {props.classificationError}
        </p>
      )}

      <EvidenceGateCard
        summary={props.evidenceSummary}
        visionConfirmed={Boolean(props.agentResult && props.agentResult.classification === 'slate')}
        visionConfidence={props.agentResult?.confidence}
      />
    </section>
  );
}
