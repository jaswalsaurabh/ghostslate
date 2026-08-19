import React from 'react';
import {
  Play,
  Pause,
  FastForward,
  Camera,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Radio,
} from 'lucide-react';
import type { FrameClassificationData } from '../types.js';
import { FrameClassificationCard } from './FrameClassificationCard.js';

interface VisionSectionProps {
  activeScenario: 'slate' | 'ad';
  onSelectScenario: (scenario: 'slate' | 'ad') => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoSource: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  classifying: boolean;
  onClassify: () => void;
  classificationResult: FrameClassificationData | null;
  classificationLatency: number | null;
  classificationError: string | null;
}

export const VisionSection: React.FC<VisionSectionProps> = ({
  activeScenario,
  onSelectScenario,
  videoRef,
  videoSource,
  currentTime,
  duration,
  isPlaying,
  onTogglePlay,
  onSeek,
  onLoadedMetadata,
  onTimeUpdate,
  classifying,
  onClassify,
  classificationResult,
  classificationLatency,
  classificationError,
}) => {
  const isBreakActive = currentTime >= 10 && currentTime < 25;

  return (
    <section className="lg:col-span-5 bg-surface-panel border border-border-subtle rounded-xl p-5 flex flex-col gap-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold font-mono px-1.5 py-0.5 rounded bg-interactive-surface text-interactive border border-interactive-border">
              01
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-interactive">
              Stream Vision Ingestion
            </h2>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Real-time frame extraction &amp; Gemini Multimodal classification
          </p>
        </div>
        {isBreakActive && (
          <span className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-status-critical-surface text-status-critical border border-status-critical-border animate-pulse flex items-center gap-1.5 shadow-[0_0_8px_var(--color-status-critical-subtle)]">
            <Radio className="w-3.5 h-3.5" />
            SCTE-35 Break Active
          </span>
        )}
      </div>

      {/* Scenario Switcher */}
      <div className="grid grid-cols-2 gap-2 bg-surface-card p-1.5 rounded-lg border border-border-subtle">
        <button
          type="button"
          onClick={() => onSelectScenario('slate')}
          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all duration-fast cursor-pointer ${
            activeScenario === 'slate'
              ? 'bg-status-critical-surface text-status-critical border border-status-critical-border shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-status-critical" />
          <span>Scenario A: Slate Bleed</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectScenario('ad')}
          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all duration-fast cursor-pointer ${
            activeScenario === 'ad'
              ? 'bg-status-success-surface text-status-success border border-status-success-border shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
          <span>Scenario B: Clean Monetization</span>
        </button>
      </div>

      {/* Video Player */}
      <div className="relative rounded-lg overflow-hidden border border-border-subtle bg-surface-base aspect-video flex items-center justify-center shadow-lg group">
        <video
          ref={videoRef}
          src={videoSource}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          className="w-full h-full object-contain"
          playsInline
        />

        {/* Cue Overlay Tag */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="bg-surface-scrim backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-mono text-text-primary border border-border-subtle flex items-center gap-1.5 shadow">
            <Clock className="w-3 h-3 text-interactive" />
            {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
          </span>
          {isBreakActive && (
            <span className="bg-status-warning text-status-warning-fg px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow">
              SCTE-35 Cue (15s Break)
            </span>
          )}
        </div>
      </div>

      {/* Timeline & Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onTogglePlay}
            className="px-3.5 py-1.5 rounded-md bg-surface-card hover:bg-surface-hover border border-border-subtle text-xs font-bold text-text-primary transition-colors duration-fast flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 text-status-warning" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-status-success" />
                Play
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSeek(12)}
            className="px-3 py-1.5 rounded-md bg-status-warning-surface hover:bg-status-warning-subtle border border-status-warning-border text-xs font-semibold text-status-warning transition-colors duration-fast flex items-center gap-1.5 cursor-pointer"
          >
            <FastForward className="w-3.5 h-3.5" />
            Jump to Break (12s)
          </button>

          <button
            type="button"
            onClick={onClassify}
            disabled={classifying}
            className="ml-auto px-3.5 py-1.5 rounded-md bg-interactive-surface hover:bg-interactive-subtle border border-interactive-border text-xs font-bold text-interactive transition-all duration-fast flex items-center gap-1.5 disabled:opacity-50 shadow-sm cursor-pointer"
          >
            {classifying ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Classifying...
              </>
            ) : (
              <>
                <Camera className="w-3.5 h-3.5" />
                Classify Frame ({currentTime.toFixed(1)}s)
              </>
            )}
          </button>
        </div>

        {/* Custom Cue Visual Bar */}
        <div
          role="slider"
          aria-label="Video timeline"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          tabIndex={0}
          className="relative h-3 bg-surface-card rounded-full overflow-hidden border border-border-subtle cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            onSeek(pos * duration);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') onSeek(Math.min(duration, currentTime + 1));
            if (e.key === 'ArrowLeft') onSeek(Math.max(0, currentTime - 1));
          }}
        >
          {/* SCTE-35 Break Zone (10s to 25s out of 35s = ~28.5% to 71.4%) */}
          <div
            className={`absolute top-0 bottom-0 ${
              activeScenario === 'slate' ? 'bg-status-critical-zone' : 'bg-status-success-zone'
            }`}
            style={{ left: '28.57%', width: '42.85%' }}
            title="SCTE-35 Ad Insertion Window"
          />
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-1.5 bg-text-primary shadow-[0_0_6px_var(--color-text-primary)] rounded-full -ml-0.5"
            style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Vision Classifier Results Card */}
      <FrameClassificationCard
        classificationResult={classificationResult}
        classificationError={classificationError}
        classificationLatency={classificationLatency}
        currentTime={currentTime}
      />
    </section>
  );
};
