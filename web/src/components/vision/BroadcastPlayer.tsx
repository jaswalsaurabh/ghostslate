import type { RefObject } from 'react';
import { Pause, Play } from 'lucide-react';
import type { InvestigationCaseConfig } from '../../config/investigation-cases.js';
import type { FrameClassificationData } from '../../types.js';
import { IconButton } from '../ui/index.js';
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
}: BroadcastPlayerProps) {
  const isSlate = displayed?.classification === 'slate';
  const styles = displayed ? classificationStyles[displayed.classification] : null;
  const maximum = duration || 35;
  const timelineValue = Math.min(currentTime, maximum);

  return (
    <div className="relative mx-5 mt-4 aspect-video overflow-hidden rounded-inset border border-border-strong bg-surface-base">
      <video
        ref={videoRef}
        key={activeCase.mediaSource}
        src={activeCase.mediaSource}
        poster={activeCase.id === 'primary' ? '/media/content_frame.png' : '/media/ad_frame.png'}
        className="broadcast-player-media h-full w-full object-cover"
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
      />

      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-media-overlay/40 via-transparent to-media-overlay" />

      <span className="absolute top-3 left-3 z-media-overlay flex items-center gap-1.5 rounded-md border border-media-border bg-media-overlay px-2 py-1.5 font-mono text-caption uppercase text-media-text-primary backdrop-blur-md">
        <span className={`size-1.25 rounded-full ${styles?.dot ?? 'bg-text-muted'}`} />
        Live · {formatTimecode(currentTime)}
      </span>

      <span className="absolute top-3 right-3 z-media-overlay rounded-md border border-media-border bg-media-overlay px-2 py-1.5 font-mono text-caption uppercase text-media-text-primary backdrop-blur-md">
        {activeCase.channel} · {activeCase.shortLabel}
      </span>

      {displayed && (
        <div
          className={`absolute top-1/2 left-1/2 z-media-controls min-w-44.5 -translate-x-1/2 -translate-y-1/2 rounded-inset border bg-media-overlay px-3 py-2.5 text-center text-media-text-primary shadow-lg backdrop-blur-md ${styles?.border ?? 'border-media-border'}`}
        >
          <strong className="block text-detail font-bold uppercase text-media-text-primary">
            {isSlate ? 'Slate detected' : `${displayed.classification} verified`}
          </strong>
          <span className="mt-1 block font-mono text-caption text-media-text-primary">
            {confidence} confidence
            {isSlate && displayed.slate_type ? ` · ${displayed.slate_type}` : ''}
          </span>
        </div>
      )}

      <div className="absolute right-3 bottom-11 left-3 z-media-overlay text-media-text-primary">
        <b className="block text-detail font-bold text-media-text-primary">
          {activeCase.channel} · {activeCase.label}
        </b>
        {displayed && (
          <span className="font-mono text-caption text-media-text-primary">
            Frame classification: {displayed.classification.toUpperCase()}
            {isSlate && displayed.slate_type ? ` (${displayed.slate_type})` : ''}
          </span>
        )}
      </div>

      <div className="broadcast-transport-grid absolute bottom-2.5 left-3 right-3 z-media-controls grid items-center gap-2.5 font-mono text-caption text-media-text-primary">
        <IconButton
          onClick={onTogglePlay}
          label={isPlaying ? 'Pause synthetic stream' : 'Play synthetic stream'}
          icon={
            isPlaying ? (
              <Pause aria-hidden="true" className="h-3 w-3 fill-current" />
            ) : (
              <Play aria-hidden="true" className="ml-0.5 h-3 w-3 fill-current" />
            )
          }
          variant="outline"
          className="size-7! rounded-full! border-media-border! bg-media-overlay! p-1.5! text-media-text-primary! hover:bg-media-overlay/80!"
        />
        <span>{formatTime(currentTime)}</span>
        <div className="relative h-5 min-w-0">
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
            {activeCase.id === 'primary' && (
              <span className="broadcast-cue-zone absolute h-full bg-status-critical/80" />
            )}
            <span
              style={{ left: `${(timelineValue / maximum) * 100}%` }}
              className="broadcast-playhead absolute -top-0.75 h-2.5 w-0.5 -translate-x-1/2 bg-media-text-primary shadow-xs before:absolute before:top-0.5 before:size-1 before:rounded-full before:bg-media-text-primary"
            />
          </span>
        </div>
        <span>{formatTime(maximum)}</span>
      </div>
    </div>
  );
}
