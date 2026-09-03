import { BadgeCheck, RefreshCw } from 'lucide-react';
import type { FrameClassificationData } from '../../types.js';
import { formatClassificationLabel } from '../../utils/display-labels.js';
import { Button, Tooltip } from '../ui/index.js';
import { classificationStyles } from './classification-styles.js';

interface VisionClassificationCardProps {
  displayed: FrameClassificationData | null;
  confidence: string;
  activeSource: 'agent' | 'manual' | null;
  currentTime: number;
  classifying: boolean;
  onClassify: (timestamp?: number) => void;
}

function classificationHeading(classification: FrameClassificationData['classification']) {
  if (classification === 'slate') return 'Replacement inventory is visible to viewers';
  if (classification === 'ad') return 'Paid creative is visible to viewers';
  if (classification === 'content') return 'Program content is visible to viewers';
  return 'Frame classification completed';
}

function classificationFallback(classification: FrameClassificationData['classification']) {
  if (classification === 'slate') {
    return 'The sampled frame was classified as replacement slate inventory.';
  }
  if (classification === 'ad') {
    return 'The sampled frame was classified as advertising creative.';
  }
  if (classification === 'content') {
    return 'The sampled frame was classified as program content.';
  }
  return 'The sampled frame was classified by the Vision service.';
}

export function VisionClassificationCard({
  displayed,
  confidence,
  activeSource,
  currentTime,
  classifying,
  onClassify,
}: VisionClassificationCardProps) {
  if (!displayed) {
    return (
      <div className="mx-5 mb-3 rounded-inset border border-interactive-border/50 bg-interactive-surface/20 p-3.5">
        <div>
          <p className="m-0 font-sans text-forensic-heading font-bold text-text-primary">
            No frame classified yet
          </p>
          <p className="m-0 mt-0.5 font-sans text-section text-text-muted">
            Use the single Classify action in the player, or sample a frame below to move the
            playhead before classifying.
          </p>
        </div>
      </div>
    );
  }

  const styles = classificationStyles[displayed.classification];
  const isSlate = displayed.classification === 'slate';
  const targetTimestamp =
    typeof displayed.timestampSeconds === 'number' && Number.isFinite(displayed.timestampSeconds)
      ? displayed.timestampSeconds
      : currentTime;
  const classificationLabel = isSlate
    ? displayed.slate_type
      ? `Slate · ${displayed.slate_type.replaceAll('_', ' ')}`
      : 'Slate'
    : formatClassificationLabel(displayed.classification);

  return (
    <article className={`mx-5 mb-3 rounded-inset border p-4 ${styles.surface}`}>
      <div className="flex items-center justify-between gap-2">
        <Tooltip content={classificationLabel} placement="top">
          <span
            aria-label={classificationLabel}
            className={`inline-flex min-w-0 shrink items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-forensic-meta font-bold uppercase tracking-micro ${styles.label}`}
          >
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${styles.dot}`} />
            <span className="shrink-0">{isSlate ? 'Slate' : classificationLabel}</span>
            {isSlate && displayed.slate_type && (
              <span className="min-w-0 truncate text-text-muted">
                · {displayed.slate_type.replaceAll('_', ' ')}
              </span>
            )}
          </span>
        </Tooltip>
        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip content={`${confidence} confidence`} placement="top">
            <span
              aria-label={`${confidence} confidence`}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-status-success-border bg-status-success-surface px-2 py-1 font-mono text-forensic-meta font-bold uppercase tracking-micro text-status-success"
            >
              <BadgeCheck aria-hidden="true" className="size-3 shrink-0" />
              <span>{confidence}</span>
            </span>
          </Tooltip>
          <Tooltip content="Reclassify this frame" placement="top">
            <Button
              aria-label="Reclassify this frame"
              variant="warning"
              size="sm"
              loading={classifying}
              onClick={() => onClassify(targetTimestamp)}
              icon={<RefreshCw className="size-3" />}
              className="shrink-0 px-2 py-1 font-sans text-forensic-meta uppercase"
            >
              Reclassify
            </Button>
          </Tooltip>
        </div>
      </div>
      <h3 className="mt-3 mb-1.5 font-sans text-forensic-heading font-bold text-text-primary">
        {classificationHeading(displayed.classification)}
      </h3>
      <p className="m-0 font-sans text-section leading-relaxed text-text-secondary">
        {displayed.visual_summary || classificationFallback(displayed.classification)}
      </p>
      {displayed.text_detected && (
        <div className="mt-3 border-t border-border-subtle pt-2.5 font-mono text-forensic-meta uppercase tracking-wider text-text-muted">
          OCR text detected
          <strong className="mt-1 block font-mono text-section font-semibold normal-case text-text-primary">
            “{displayed.text_detected}”
          </strong>
        </div>
      )}
      {activeSource === 'manual' && (
        <div className="mt-2 font-mono text-forensic-meta text-text-muted">
          Operator sample (manual probe · not admitted diagnosis evidence)
        </div>
      )}
    </article>
  );
}
