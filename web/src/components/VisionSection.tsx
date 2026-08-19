import React from 'react';
import {
  Play,
  Pause,
  FastForward,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Radio,
} from 'lucide-react';
import type { FrameClassificationData } from '../types.js';
import { FrameClassificationCard } from './FrameClassificationCard.js';
import { Button, Badge, Card } from './ui/index.js';

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
    <Card variant="panel" className="lg:col-span-5 p-5 flex flex-col gap-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <Badge variant="primary" size="sm">
            MODULE 01
          </Badge>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-interactive">
              Stream Vision Ingestion
            </h2>
            <p className="text-[11px] text-text-muted">
              Real-time frame extraction &amp; Gemini Multimodal classification
            </p>
          </div>
        </div>
        {isBreakActive && (
          <Badge variant="critical" size="md" pulse>
            <Radio className="w-3.5 h-3.5" />
            SCTE-35 Break Active
          </Badge>
        )}
      </div>

      {/* Scenario Switcher */}
      <div className="grid grid-cols-2 gap-2 bg-surface-card p-1.5 rounded-lg border border-border-subtle">
        <Button
          variant={activeScenario === 'slate' ? 'critical' : 'ghost'}
          size="md"
          onClick={() => onSelectScenario('slate')}
          icon={<AlertTriangle className="w-3.5 h-3.5 text-status-critical" />}
          className="justify-center"
        >
          Scenario A: Slate Bleed
        </Button>

        <Button
          variant={activeScenario === 'ad' ? 'success' : 'ghost'}
          size="md"
          onClick={() => onSelectScenario('ad')}
          icon={<CheckCircle2 className="w-3.5 h-3.5 text-status-success" />}
          className="justify-center"
        >
          Scenario B: Clean Ad Pod
        </Button>
      </div>

      {/* Video Player Container */}
      <div className="relative rounded-lg overflow-hidden border border-border-subtle bg-surface-base aspect-video flex items-center justify-center shadow-lg group">
        <video
          ref={videoRef}
          src={videoSource}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          className="w-full h-full object-contain"
          playsInline
        />

        {/* Dynamic Cue & Timecode Overlay */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="bg-surface-scrim backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-mono text-text-primary border border-border-subtle flex items-center gap-1.5 shadow-sm">
            <Clock className="w-3 h-3 text-interactive" />
            {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
          </span>
          {isBreakActive && (
            <Badge variant="warning" size="sm">
              SCTE-35 Cue (15s Break)
            </Badge>
          )}
        </div>
      </div>

      {/* Timeline Controls & Action Bar */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={onTogglePlay}
            icon={
              isPlaying ? (
                <Pause className="w-3.5 h-3.5 text-status-warning" />
              ) : (
                <Play className="w-3.5 h-3.5 text-status-success" />
              )
            }
          >
            {isPlaying ? 'Pause' : 'Play'}
          </Button>

          <Button
            variant="warning"
            size="sm"
            onClick={() => onSeek(12)}
            icon={<FastForward className="w-3.5 h-3.5" />}
          >
            Jump to Break (12s)
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={onClassify}
            loading={classifying}
            icon={<Camera className="w-3.5 h-3.5 text-interactive-fg" />}
            className="ml-auto"
          >
            Classify Frame ({currentTime.toFixed(1)}s)
          </Button>
        </div>

        {/* Custom SCTE-35 Timeline Scrubber Bar */}
        <div
          role="slider"
          aria-label="Video timeline"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          tabIndex={0}
          className="relative h-3.5 bg-surface-card rounded-full overflow-hidden border border-border-subtle cursor-pointer select-none"
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
          {/* SCTE-35 Ad Insertion Window Region (10s - 25s) */}
          <div
            className={`absolute top-0 bottom-0 ${
              activeScenario === 'slate' ? 'bg-status-critical-zone' : 'bg-status-success-zone'
            }`}
            style={{ left: '28.57%', width: '42.85%' }}
            title="SCTE-35 Ad Insertion Window (10s - 25s)"
          />

          {/* Draggable Timeline Playhead */}
          <div
            className="absolute top-0 bottom-0 w-1.5 bg-text-primary shadow-[0_0_8px_var(--color-text-primary)] rounded-full -ml-0.5"
            style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Frame Classification Result Card */}
      <FrameClassificationCard
        classificationResult={classificationResult}
        classificationError={classificationError}
        classificationLatency={classificationLatency}
        currentTime={currentTime}
      />
    </Card>
  );
};
