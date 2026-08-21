import React from 'react';
import { Eye, FileText } from 'lucide-react';
import type { ClassificationType, SlateType } from '../types.js';
import { classificationStyles } from './vision/classification-styles.js';

interface FrameEvidenceCardProps {
  classification: ClassificationType;
  confidence: number;
  slateType: SlateType;
  textDetected: string;
  visualSummary: string;
  timestampSeconds?: number | undefined;
  videoFile?: string | undefined;
  frameBase64?: string | undefined;
  cached: boolean;
}

export const FrameEvidenceCard: React.FC<FrameEvidenceCardProps> = ({
  classification,
  confidence,
  slateType,
  textDetected,
  visualSummary,
  timestampSeconds,
  videoFile,
  frameBase64,
  cached,
}) => {
  const styles = classificationStyles[classification];

  return (
    <article className="evidence-event-grid py-2.5 border-t border-border-subtle">
      <time className="pt-0.5 font-mono text-caption text-text-muted">
        {timestampSeconds !== undefined ? `${timestampSeconds.toFixed(1)}s` : 'Vision'}
      </time>
      <span className="grid size-6 place-items-center rounded-md bg-interactive-surface text-interactive shrink-0">
        <Eye className="size-3" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="mt-0.5 mb-1.5 flex items-center justify-between gap-2 text-detail font-bold text-text-primary">
          <span>Vision frame classified · {classification.toUpperCase()}</span>
          <span className="font-mono text-caption font-normal text-text-muted">
            {videoFile ? `${videoFile} · ` : ''}
            {Math.round(confidence * 100)}% conf{cached ? ' (cached)' : ''}
          </span>
        </div>

        <div className={`rounded-md border p-3 ${styles.surface}`}>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
            {frameBase64 && (
              <div className="shrink-0">
                <img
                  src={frameBase64}
                  alt="Classified frame"
                  className="h-16 w-28 rounded border border-border-strong object-cover shadow-xs"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-mono text-caption font-bold uppercase">
                <span className={`rounded border px-1.5 py-0.5 ${styles.label}`}>
                  {classification}
                </span>
                {slateType && (
                  <span className="text-text-muted font-normal">
                    · {slateType.replace('_', ' ')}
                  </span>
                )}
              </div>
              {visualSummary && (
                <p className="mt-1 mb-0 text-compact leading-normal text-text-secondary">
                  {visualSummary}
                </p>
              )}
              {textDetected && (
                <div className="mt-2 flex items-center gap-1.5 rounded bg-surface-base/80 px-2 py-1 font-mono text-caption text-text-primary border border-border-subtle">
                  <FileText className="size-2.5 text-interactive shrink-0" />
                  <span className="truncate">OCR: “{textDetected}”</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};
