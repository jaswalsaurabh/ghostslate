import { useEffect, useState, type RefObject } from 'react';
import { Camera, Pause, Play, Radio, ScanLine } from 'lucide-react';
import type { InvestigationCaseConfig } from '../config/investigation-cases.js';
import type { FrameClassificationData, InvestigationEvidenceSummary } from '../types.js';
import { EvidenceGateCard } from './EvidenceGateCard.js';
import { Badge, Button, Card, SegmentedControl } from './ui/index.js';
import { BroadcastSampleStrip, formatTime } from './vision/BroadcastSampleStrip.js';

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
  onClassify: () => void;
  agentResult: FrameClassificationData | null;
  evidenceSummary?: InvestigationEvidenceSummary | undefined;
}

const SOURCE_OPTIONS = [
  { value: 'agent', label: 'Agent evidence' },
  { value: 'manual', label: 'Operator sample' },
] as const;

export function VisionPanel(props: VisionPanelProps) {
  const [selectedSource, setSelectedSource] = useState<'agent' | 'manual'>('agent');

  useEffect(() => {
    if (props.manualResult) {
      setSelectedSource('manual');
    }
  }, [props.manualResult]);

  useEffect(() => {
    if (props.agentResult) {
      setSelectedSource('agent');
    }
  }, [props.agentResult]);

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

  const sourceLabel =
    activeSource === 'agent'
      ? 'Agent evidence'
      : activeSource === 'manual'
        ? 'Operator sample'
        : null;

  const confidence = displayed ? `${Math.round(displayed.confidence * 100)}%` : '—';
  const selectedTime = displayed?.timestampSeconds ?? props.currentTime;
  const classificationTone =
    displayed?.classification === 'slate'
      ? 'text-classification-slate'
      : displayed?.classification === 'ad'
        ? 'text-classification-ad'
        : displayed?.classification === 'content'
          ? 'text-classification-content'
          : 'text-text-muted';
  const classificationBorder =
    displayed?.classification === 'slate'
      ? 'border-classification-slate-border'
      : displayed?.classification === 'ad'
        ? 'border-classification-ad-border'
        : 'border-classification-content-border';

  const hasBothSources = Boolean(props.agentResult && props.manualResult);

  return (
    <section
      className="self-start lg:sticky lg:top-24 [@media(max-height:960px)]:static"
      aria-labelledby="vision-title"
    >
      <Card variant="panel" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-hover font-mono text-xs font-bold text-text-muted">
              01
            </span>
            <div>
              <h2 id="vision-title" className="text-sm font-bold text-text-primary">
                Vision signal
              </h2>
              <p className="text-xs text-text-muted">
                Gemini multimodal · sampled at operator-selected timestamps
              </p>
            </div>
          </div>
          <Badge variant={props.activeCase.id === 'primary' ? 'critical' : 'success'}>
            {props.activeCase.shortLabel}
          </Badge>
        </div>

        <div className="bg-surface-scrim p-3">
          <div className="relative overflow-hidden rounded-lg border border-border-strong bg-surface-base">
            <video
              ref={props.videoRef}
              key={props.activeCase.mediaSource}
              src={props.activeCase.mediaSource}
              poster={
                props.activeCase.id === 'primary'
                  ? '/media/content_frame.png'
                  : '/media/ad_frame.png'
              }
              className="aspect-video w-full object-cover"
              preload="metadata"
              onLoadedMetadata={props.onLoadedMetadata}
              onTimeUpdate={props.onTimeUpdate}
              onPlay={props.onPlay}
              onPause={props.onPause}
            />
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-scrim px-2 py-1 font-mono text-xs text-text-primary backdrop-blur-md">
              <Radio className="h-3 w-3 text-status-critical" /> Live ·{' '}
              {formatTime(props.currentTime)}
            </div>
            {displayed && (
              <div
                className={`absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-lg border bg-surface-scrim px-4 py-3 text-center backdrop-blur-md ${classificationBorder}`}
              >
                <strong className="block text-sm uppercase text-text-primary">
                  {displayed.classification} detected
                </strong>
                <span className={`mt-1 block font-mono text-xs ${classificationTone}`}>
                  {confidence} confidence · {displayed.slate_type ?? 'frame sample'}
                </span>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={props.onTogglePlay}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-text-primary text-surface-base transition-transform duration-fast hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
              aria-label={props.isPlaying ? 'Pause synthetic stream' : 'Play synthetic stream'}
            >
              {props.isPlaying ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </button>
            <span className="w-10 font-mono text-xs text-text-primary">
              {formatTime(props.currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={props.duration || 35}
              step={0.1}
              value={Math.min(props.currentTime, props.duration || 35)}
              onChange={(event) => props.onSeek(Number(event.currentTarget.value))}
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-interactive"
              aria-label="Synthetic stream timeline"
            />
            <span className="font-mono text-xs text-text-primary">
              {formatTime(props.duration || 35)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 border-b border-border-subtle">
          <div className="p-3">
            <span className="block text-xs uppercase text-text-muted">Classification</span>
            <strong className={`mt-1 block font-mono text-sm ${classificationTone}`}>
              {displayed?.classification.toUpperCase() ?? 'AWAITING'}
            </strong>
          </div>
          <div className="border-l border-border-subtle p-3">
            <span className="block text-xs uppercase text-text-muted">Vision latency</span>
            <strong className="mt-1 block font-mono text-sm text-text-primary">
              {displayedLatency === null ? '—' : `${Math.round(displayedLatency)} ms`}
            </strong>
          </div>
          <div className="border-l border-border-subtle p-3">
            <span className="block text-xs uppercase text-text-muted">Frame hash</span>
            <strong className="mt-1 block truncate font-mono text-sm text-text-primary">
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

        <div className="space-y-3 border-t border-border-subtle p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-interactive" />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-text-primary">
                    {sourceLabel ?? 'No frame classified yet'}
                  </p>
                  {hasBothSources && (
                    <SegmentedControl
                      size="sm"
                      label="Displayed frame source"
                      options={SOURCE_OPTIONS}
                      value={activeSource ?? 'agent'}
                      onValueChange={(v) => setSelectedSource(v as 'agent' | 'manual')}
                    />
                  )}
                </div>
                <p className="text-xs text-text-muted">
                  {displayed?.visual_summary ??
                    'Run the investigation or classify the selected frame.'}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={props.classifying}
              onClick={props.onClassify}
              icon={<Camera className="h-3.5 w-3.5" />}
            >
              Classify {formatTime(props.currentTime)}
            </Button>
          </div>
          {displayed?.text_detected && (
            <p className="rounded-md bg-surface-base p-2 font-mono text-xs text-text-secondary">
              OCR · “{displayed.text_detected}”
            </p>
          )}
          {props.classificationError && (
            <p role="alert" className="text-xs text-status-critical">
              {props.classificationError}
            </p>
          )}
          <EvidenceGateCard
            summary={props.evidenceSummary}
            visionConfirmed={Boolean(
              props.agentResult && props.agentResult.classification === 'slate',
            )}
          />
        </div>
      </Card>
    </section>
  );
}
