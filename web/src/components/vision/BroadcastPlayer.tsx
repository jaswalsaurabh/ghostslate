import type { RefObject } from 'react';
import { Pause, Play, Sparkles } from 'lucide-react';
import type { InvestigationCaseConfig } from '../../config/investigation-cases.js';
import type { FrameClassificationData } from '../../types.js';
import { Button, IconButton } from '../ui/index.js';
import { formatClassificationLabel } from '../../utils/display-labels.js';
import { formatTime, formatTimecode } from './BroadcastSampleStrip.js';
import { classificationStyles } from './classification-styles.js';

interface BroadcastPlayerProps {
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
  displayed: FrameClassificationData | null;
  confidence: string;
  classifying?: boolean | undefined;
  onClassify?: (() => void) | undefined;
  classifyDisabled?: boolean | undefined;
}

export function BroadcastPlayer({
  activeCase,
  videoRef,
  currentTime,
  duration,
  isPlaying,
  onTogglePlay,
  onSeek,
  onLoadedMetadata,
  onTimeUpdate,
  onPlay,
  onPause,
  displayed,
  confidence,
  classifying = false,
  onClassify,
  classifyDisabled = false,
}: BroadcastPlayerProps) {
  const isSlate = displayed?.classification === 'slate';
  const styles = displayed ? classificationStyles[displayed.classification] : null;
  const maximum = duration || activeCase.durationSeconds;
  const timelineValue = Math.min(currentTime, maximum);

  return (
    <div className="relative mx-5 mt-4 aspect-video overflow-hidden rounded-inset border border-border-strong bg-surface-base">
      <video
        ref={videoRef}
        key={activeCase.mediaSource}
        src={activeCase.mediaSource}
        poster={activeCase.poster}
        className="broadcast-player-media h-full w-full object-cover"
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
      />

      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-media-overlay/40 via-transparent to-media-overlay" />

      <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-media-overlay flex items-center justify-between gap-1.5 sm:inset-x-3 sm:top-3">
        <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-media-border bg-media-overlay px-2 py-1 font-mono text-forensic-meta font-bold uppercase text-media-text-primary backdrop-blur-md sm:px-2.5 sm:py-1.5">
          <span className={`size-1.5 shrink-0 rounded-full ${styles?.dot ?? 'bg-text-muted'}`} />
          <span className="truncate">Live · {formatTimecode(currentTime)}</span>
        </span>

        <span className="min-w-0 truncate rounded-md border border-media-border bg-media-overlay px-2 py-1 font-mono text-forensic-meta font-bold uppercase text-media-text-primary backdrop-blur-md sm:px-2.5 sm:py-1.5">
          {activeCase.channel} · {activeCase.shortLabel}
        </span>
      </div>

      {displayed && (
        <div
          className={`absolute top-1/2 left-1/2 z-media-controls min-w-48 -translate-x-1/2 -translate-y-1/2 rounded-inset border bg-media-overlay px-3.5 py-2.5 text-center text-media-text-primary shadow-lg backdrop-blur-md ${styles?.border ?? 'border-media-border'}`}
        >
          <strong className="block font-sans text-forensic-heading font-bold uppercase tracking-wider text-media-text-primary">
            {isSlate ? 'Slate detected' : `${displayed.classification} verified`}
          </strong>
          <span className="mt-1 block font-mono text-forensic-meta text-media-text-primary">
            {confidence} confidence
            {isSlate && displayed.slate_type ? ` · ${displayed.slate_type}` : ''}
          </span>
        </div>
      )}

      <div className="absolute inset-x-2.5 bottom-2 z-media-controls flex flex-col gap-1 text-media-text-primary sm:inset-x-3 sm:bottom-2.5 sm:gap-1.5">
        <div className="min-w-0">
          <b className="block truncate font-sans text-micro font-bold text-media-text-primary sm:text-forensic-heading">
            {activeCase.channel} · {activeCase.label}
          </b>
          {displayed && (
            <span className="block truncate font-mono text-micro text-media-text-primary sm:text-section">
              Frame classification: {formatClassificationLabel(displayed.classification)}
              {isSlate && displayed.slate_type ? ` (${displayed.slate_type})` : ''}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-1.5 font-mono text-forensic-meta text-media-text-primary sm:gap-2.5">
          <div className="flex flex-1 min-w-0 items-center gap-1.5 sm:gap-2">
            <IconButton
              onClick={onTogglePlay}
              label={isPlaying ? 'Pause synthetic stream' : 'Play synthetic stream'}
              icon={
                isPlaying ? (
                  <Pause aria-hidden="true" className="size-3.5 fill-current" />
                ) : (
                  <Play aria-hidden="true" className="ml-0.5 size-3.5 fill-current" />
                )
              }
              variant="outline"
              className="size-10! shrink-0 rounded-full! border-media-border! bg-media-overlay! p-2! text-media-text-primary! hover:bg-media-overlay/80! sm:size-8! sm:p-1.5!"
            />
            <span className="shrink-0 text-micro sm:text-forensic-meta">
              {formatTime(currentTime)}
            </span>
            <div className="relative h-10 flex-1 min-w-10 sm:h-5">
              <input
                type="range"
                min={0}
                max={maximum}
                step={0.1}
                value={timelineValue}
                onChange={(event) => onSeek(event.currentTarget.valueAsNumber)}
                aria-label="Synthetic stream timeline"
                aria-valuetext={formatTime(currentTime)}
                className="peer absolute inset-0 z-media-controls h-full w-full cursor-pointer appearance-none opacity-0 forced-colors:appearance-auto forced-colors:opacity-100"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-0 z-content h-1 w-full -translate-y-1/2 rounded-full bg-media-track peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-interactive forced-colors:hidden"
              >
                {activeCase.expectedOutcome === 'incident' && (
                  <span className="broadcast-cue-zone absolute h-full bg-status-critical/80" />
                )}
                <span
                  style={{ left: `${(timelineValue / maximum) * 100}%` }}
                  className="broadcast-playhead absolute -top-0.75 h-2.5 w-0.5 -translate-x-1/2 bg-media-text-primary shadow-xs before:absolute before:top-0.5 before:size-1 before:rounded-full before:bg-media-text-primary"
                />
              </span>
            </div>
            <span className="shrink-0 text-micro sm:text-forensic-meta">{formatTime(maximum)}</span>
          </div>

          {onClassify || classifyDisabled ? (
            <Button
              variant="primary"
              size="sm"
              loading={classifying}
              disabled={classifyDisabled}
              onClick={onClassify}
              icon={<Sparkles className="size-3 sm:size-3.5" />}
              title={
                classifyDisabled
                  ? 'This guardrail scenario intentionally skips Vision classification'
                  : undefined
              }
              className="h-10 shrink-0 px-3 font-sans font-semibold tracking-wide shadow-glow-interactive text-micro sm:h-8 sm:px-3 sm:text-xs"
            >
              {classifyDisabled
                ? 'Vision disabled'
                : classifying
                  ? 'Analyzing…'
                  : `Classify ${formatTime(currentTime)}`}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
