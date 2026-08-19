import React from 'react';
import {
  Eye,
  CheckCheck,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Sparkles,
  Film,
} from 'lucide-react';
import type { ClassificationType, SlateType } from '../types.js';
import { CONFIDENCE_THRESHOLDS } from '../types.js';
import { Badge, Card } from './ui/index.js';

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
  const hasSource = Boolean(videoFile) && timestampSeconds !== undefined;

  return (
    <Card variant="card" className="p-4 border-border-strong flex flex-col gap-3 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-2 text-xs">
        <div className="flex items-center gap-2 text-interactive font-bold">
          <Eye className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider text-[11px]">Vision Evidence</span>
        </div>

        <div className="flex items-center gap-2">
          {hasSource && (
            <span className="font-mono text-text-secondary text-[11px] flex items-center gap-1 bg-surface-scrim px-2 py-0.5 rounded border border-border-subtle">
              <Film className="w-3 h-3 text-interactive" />
              {videoFile} @ {timestampSeconds}s
            </span>
          )}
          {cached && (
            <Badge variant="primary" size="sm">
              <CheckCheck className="w-3 h-3" />
              cached
            </Badge>
          )}
        </div>
      </div>

      {/* Frame image + Classification badges */}
      <div className="flex flex-col sm:flex-row gap-3.5 items-start">
        {frameBase64 && (
          <div className="shrink-0 max-w-full sm:max-w-48">
            <img
              src={frameBase64}
              alt="Classified frame evidence"
              className="w-full h-auto rounded-md border border-border-strong object-cover shadow-xs max-w-full"
            />
          </div>
        )}

        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Classification badge */}
            <Badge
              variant={
                classification === 'slate'
                  ? 'critical'
                  : classification === 'ad'
                    ? 'primary'
                    : 'success'
              }
              size="md"
            >
              {classification === 'slate' ? (
                <AlertTriangle className="w-3 h-3" />
              ) : (
                <CheckCircle2 className="w-3 h-3" />
              )}
              {classification.toUpperCase()}
            </Badge>

            {/* Confidence indicator */}
            <Badge
              variant={
                confidence >= CONFIDENCE_THRESHOLDS.HIGH
                  ? 'success'
                  : confidence >= CONFIDENCE_THRESHOLDS.MEDIUM
                    ? 'warning'
                    : 'critical'
              }
              size="md"
            >
              {Math.round(confidence * 100)}% Confidence
            </Badge>

            {/* Slate type if present */}
            {slateType && (
              <Badge variant="critical" size="sm">
                Type: {slateType.replace('_', ' ')}
              </Badge>
            )}
          </div>

          {/* OCR text detected if present */}
          {textDetected && (
            <div className="bg-surface-panel p-2 rounded-md border border-border-subtle flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold font-mono text-text-muted uppercase tracking-wider">
                <FileText className="w-3 h-3 text-interactive" />
                Text Detected:
              </div>
              <div className="text-xs font-mono text-status-warning bg-surface-scrim p-1.5 rounded border border-status-warning-border whitespace-pre-wrap wrap-break-word">
                {textDetected}
              </div>
            </div>
          )}

          {/* Visual summary body */}
          {visualSummary && (
            <div className="bg-surface-panel p-2.5 rounded-md border border-border-subtle flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold font-mono text-text-muted uppercase tracking-wider">
                <Sparkles className="w-3 h-3 text-interactive" />
                Visual Summary:
              </div>
              <p className="text-xs text-text-primary leading-relaxed font-sans whitespace-pre-line wrap-break-word">
                {visualSummary}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
