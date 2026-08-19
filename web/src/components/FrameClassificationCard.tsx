import React from 'react';
import {
  Eye,
  Clock,
  CheckCheck,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Sparkles,
  Camera,
} from 'lucide-react';
import type { FrameClassificationData } from '../types.js';
import { CONFIDENCE_THRESHOLDS } from '../types.js';

interface FrameClassificationCardProps {
  classificationResult: FrameClassificationData | null;
  classificationError: string | null;
  classificationLatency: number | null;
  currentTime: number;
}

export const FrameClassificationCard: React.FC<FrameClassificationCardProps> = ({
  classificationResult,
  classificationError,
  classificationLatency,
  currentTime,
}) => {
  return (
    <div className="mt-auto bg-surface-card rounded-lg p-4 border border-border-subtle flex flex-col gap-3 shadow-md">
      <div className="flex items-center justify-between text-xs font-mono border-b border-border-subtle pb-2">
        <div className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-interactive" />
          <span className="font-bold text-text-primary uppercase tracking-wider text-[11px]">
            Vision Classifier Result
          </span>
        </div>

        {classificationLatency !== null && (
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-text-muted" />
              Latency:{' '}
              <strong className="text-text-primary font-mono">{classificationLatency}ms</strong>
            </span>
            {classificationResult?.cached && (
              <span className="px-1.5 py-0.5 rounded bg-interactive-surface text-interactive border border-interactive-border flex items-center gap-1 text-[10px] font-semibold font-mono">
                <CheckCheck className="w-3 h-3" />
                SHA-256 Cached
              </span>
            )}
          </div>
        )}
      </div>

      {classificationError ? (
        <div className="bg-status-critical-surface p-3 rounded-lg border border-status-critical-border text-status-critical flex items-start gap-2 text-xs shadow-md">
          <AlertTriangle className="w-4 h-4 text-status-critical shrink-0 mt-0.5" />
          <div className="flex-1 font-mono wrap-break-word">
            <span className="font-bold text-status-critical">Classification Error: </span>
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
                  className="w-32 h-20 rounded-md border border-border-strong object-cover shadow"
                />
                <span className="absolute bottom-1 right-1 bg-surface-scrim text-[10px] font-mono px-1 rounded text-text-primary">
                  {currentTime.toFixed(1)}s
                </span>
              </div>
            )}

            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    classificationResult.classification === 'slate'
                      ? 'bg-classification-slate-surface text-classification-slate border border-classification-slate-border shadow-[0_0_8px_var(--color-classification-slate-subtle)]'
                      : classificationResult.classification === 'ad'
                        ? 'bg-classification-ad-surface text-classification-ad border border-classification-ad-border'
                        : 'bg-classification-content-surface text-classification-content border border-classification-content-border'
                  }`}
                >
                  {classificationResult.classification === 'slate' && (
                    <AlertTriangle className="w-3 h-3 text-classification-slate" />
                  )}
                  {classificationResult.classification === 'ad' && (
                    <CheckCircle2 className="w-3 h-3 text-classification-ad" />
                  )}
                  {classificationResult.classification.toUpperCase()}
                  {classificationResult.slate_type &&
                    ` (${classificationResult.slate_type.replace('_', ' ')})`}
                </span>

                <span
                  className={`text-xs font-mono font-semibold px-2 py-0.5 rounded bg-surface-panel border border-border-subtle ${
                    classificationResult.confidence >= CONFIDENCE_THRESHOLDS.HIGH
                      ? 'text-confidence-high'
                      : classificationResult.confidence >= CONFIDENCE_THRESHOLDS.MEDIUM
                        ? 'text-confidence-medium'
                        : 'text-confidence-low'
                  }`}
                >
                  {Math.round(classificationResult.confidence * 100)}% Confidence
                </span>
              </div>

              {/* Content Hash ID */}
              <div className="text-[11px] font-mono text-text-muted truncate">
                Hash:{' '}
                <span className="text-text-secondary">
                  {classificationResult.contentHash.slice(0, 16)}...
                </span>
              </div>
            </div>
          </div>

          {/* OCR Text Detected (Full text without truncation) */}
          {classificationResult.text_detected && (
            <div className="bg-surface-panel p-2.5 rounded-md border border-border-subtle flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold font-mono text-text-muted uppercase tracking-wider">
                <FileText className="w-3 h-3 text-interactive" />
                OCR Text Detected on Screen:
              </div>
              <div className="text-xs font-mono text-status-warning bg-surface-scrim p-2 rounded border border-status-warning-border whitespace-pre-wrap wrap-break-word leading-relaxed">
                {classificationResult.text_detected}
              </div>
            </div>
          )}

          {/* Multimodal Visual Summary (Full reasoning without line clamping) */}
          {classificationResult.visual_summary && (
            <div className="bg-surface-panel p-2.5 rounded-md border border-border-subtle flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold font-mono text-text-muted uppercase tracking-wider">
                <Sparkles className="w-3 h-3 text-interactive" />
                Multimodal Reasoning &amp; Summary:
              </div>
              <p className="text-xs text-text-primary leading-relaxed wrap-break-word whitespace-pre-line">
                {classificationResult.visual_summary}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-text-muted italic py-4 text-center flex flex-col items-center gap-1">
          <Camera className="w-6 h-6 text-text-muted/50" />
          <span>Click &quot;Classify Frame&quot; to sample a frame and invoke Gemini Vision.</span>
        </div>
      )}
    </div>
  );
};
