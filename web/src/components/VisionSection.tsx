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
  FileText,
  Eye,
  CheckCheck,
  Sparkles,
} from 'lucide-react';
import type { FrameClassificationData } from '../types.js';

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
    <section className="lg:col-span-5 bg-(--surface-panel) border border-(--border-subtle) rounded-xl p-5 flex flex-col gap-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-(--border-subtle) pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold font-mono px-1.5 py-0.5 rounded bg-(--accent-primary)/10 text-(--accent-primary) border border-(--accent-primary)/30">
              01
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-(--accent-primary)">
              Stream Vision Ingestion
            </h2>
          </div>
          <p className="text-xs text-(--text-muted) mt-0.5">
            Real-time frame extraction &amp; Gemini Multimodal classification
          </p>
        </div>
        {isBreakActive && (
          <span className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse flex items-center gap-1.5 shadow-[0_0_8px_rgba(239,68,68,0.2)]">
            <Radio className="w-3.5 h-3.5" />
            SCTE-35 Break Active
          </span>
        )}
      </div>

      {/* Scenario Switcher */}
      <div className="grid grid-cols-2 gap-2 bg-(--surface-card) p-1.5 rounded-lg border border-(--border-subtle)">
        <button
          type="button"
          onClick={() => onSelectScenario('slate')}
          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
            activeScenario === 'slate'
              ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm'
              : 'text-(--text-muted) hover:text-(--text-primary)'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          <span>Scenario A: Slate Bleed</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectScenario('ad')}
          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
            activeScenario === 'ad'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
              : 'text-(--text-muted) hover:text-(--text-primary)'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Scenario B: Monetized Ad</span>
        </button>
      </div>

      {/* Video Player */}
      <div className="relative rounded-lg overflow-hidden border border-(--border-subtle) bg-black aspect-video flex items-center justify-center shadow-lg group">
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
          <span className="bg-black/75 backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-mono text-white border border-white/10 flex items-center gap-1.5 shadow">
            <Clock className="w-3 h-3 text-(--accent-primary)" />
            {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
          </span>
          {isBreakActive && (
            <span className="bg-amber-500/90 text-black px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow">
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
            className="px-3.5 py-1.5 rounded-md bg-(--surface-card) hover:bg-(--surface-hover) border border-(--border-subtle) text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow-sm"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-400" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                Play
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSeek(12)}
            className="px-3 py-1.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs font-semibold text-amber-300 transition-colors flex items-center gap-1.5"
          >
            <FastForward className="w-3.5 h-3.5" />
            Jump to Break (12s)
          </button>

          <button
            type="button"
            onClick={onClassify}
            disabled={classifying}
            className="ml-auto px-3.5 py-1.5 rounded-md bg-(--accent-primary)/20 hover:bg-(--accent-primary)/30 border border-(--accent-primary)/40 text-xs font-bold text-(--accent-primary) transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
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
          className="relative h-3 bg-(--surface-card) rounded-full overflow-hidden border border-(--border-subtle) cursor-pointer"
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
              activeScenario === 'slate' ? 'bg-red-500/40' : 'bg-emerald-500/40'
            }`}
            style={{ left: '28.57%', width: '42.85%' }}
            title="SCTE-35 Ad Insertion Window"
          />
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-1.5 bg-white shadow-[0_0_6px_white] rounded-full -ml-0.5"
            style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Redesigned Vision Classifier Results Card */}
      <div className="mt-auto bg-(--surface-card) rounded-lg p-4 border border-(--border-subtle) flex flex-col gap-3 shadow-md">
        <div className="flex items-center justify-between text-xs font-mono border-b border-(--border-subtle) pb-2">
          <div className="flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-(--accent-primary)" />
            <span className="font-bold text-white uppercase tracking-wider text-[11px]">
              Vision Classifier Result
            </span>
          </div>

          {classificationLatency !== null && (
            <div className="flex items-center gap-2 text-[11px] text-(--text-secondary)">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-(--text-muted)" />
                Latency: <strong className="text-white font-mono">{classificationLatency}ms</strong>
              </span>
              {classificationResult?.cached && (
                <span className="px-1.5 py-0.5 rounded bg-(--accent-primary)/20 text-(--accent-primary) border border-(--accent-primary)/30 flex items-center gap-1 text-[10px] font-semibold font-mono">
                  <CheckCheck className="w-3 h-3" />
                  SHA-256 Cached
                </span>
              )}
            </div>
          )}
        </div>

        {classificationError ? (
          <div className="bg-red-950/40 p-3 rounded-lg border border-red-800/60 text-red-300 flex items-start gap-2 text-xs shadow-md">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-mono wrap-break-word">
              <span className="font-bold text-red-200">Classification Error: </span>
              {classificationError}
            </div>
          </div>
        ) : classificationResult ? (
          <div className="flex flex-col gap-3">
            {/* Visual Thumbnail + Status Badges */}
            <div className="flex gap-3.5 items-start">
              {classificationResult.frameBase64 && (
                <div className="relative group shrink-0">
                  <img
                    src={classificationResult.frameBase64}
                    alt="Sampled frame"
                    className="w-32 h-20 rounded-md border border-(--border-strong) object-cover shadow"
                  />
                  <span className="absolute bottom-1 right-1 bg-black/80 text-[10px] font-mono px-1 rounded text-gray-200">
                    {currentTime.toFixed(1)}s
                  </span>
                </div>
              )}

              <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                      classificationResult.classification === 'slate'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.2)]'
                        : classificationResult.classification === 'ad'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                    }`}
                  >
                    {classificationResult.classification === 'slate' && (
                      <AlertTriangle className="w-3 h-3 text-red-400" />
                    )}
                    {classificationResult.classification === 'ad' && (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    )}
                    {classificationResult.classification.toUpperCase()}
                    {classificationResult.slate_type &&
                      ` (${classificationResult.slate_type.replace('_', ' ')})`}
                  </span>

                  <span className="text-xs text-white font-mono font-semibold px-2 py-0.5 rounded bg-(--surface-panel) border border-(--border-subtle)">
                    {Math.round(classificationResult.confidence * 100)}% Confidence
                  </span>
                </div>

                {/* Content Hash ID */}
                <div className="text-[11px] font-mono text-(--text-muted) truncate">
                  Hash:{' '}
                  <span className="text-(--text-secondary)">
                    {classificationResult.contentHash.slice(0, 16)}...
                  </span>
                </div>
              </div>
            </div>

            {/* OCR Text Detected (Full text without truncation) */}
            {classificationResult.text_detected && (
              <div className="bg-(--surface-panel) p-2.5 rounded-md border border-(--border-subtle) flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold font-mono text-(--text-muted) uppercase tracking-wider">
                  <FileText className="w-3 h-3 text-(--accent-primary)" />
                  OCR Text Detected on Screen:
                </div>
                <div className="text-xs font-mono text-amber-200 bg-black/30 p-2 rounded border border-amber-500/20 whitespace-pre-wrap wrap-break-word leading-relaxed">
                  {classificationResult.text_detected}
                </div>
              </div>
            )}

            {/* Multimodal Visual Summary (Full reasoning without line clamping) */}
            {classificationResult.visual_summary && (
              <div className="bg-(--surface-panel) p-2.5 rounded-md border border-(--border-subtle) flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold font-mono text-(--text-muted) uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-(--accent-primary)" />
                  Multimodal Reasoning &amp; Summary:
                </div>
                <p className="text-xs text-slate-200 leading-relaxed wrap-break-word whitespace-pre-line">
                  {classificationResult.visual_summary}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-(--text-muted) italic py-4 text-center flex flex-col items-center gap-1">
            <Camera className="w-6 h-6 text-(--text-muted)/50" />
            <span>
              Click &quot;Classify Frame&quot; to sample a frame and invoke Gemini Vision.
            </span>
          </div>
        )}
      </div>
    </section>
  );
};
