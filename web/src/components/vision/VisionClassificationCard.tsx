import { Camera } from 'lucide-react';
import type { FrameClassificationData } from '../../types.js';
import { Button } from '../ui/index.js';
import { formatTime } from './BroadcastSampleStrip.js';
import { classificationStyles } from './classification-styles.js';

interface VisionClassificationCardProps {
  displayed: FrameClassificationData | null;
  confidence: string;
  activeSource: 'agent' | 'manual' | null;
  currentTime: number;
  classifying: boolean;
  onClassify: () => void;
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
      <div className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-inset border border-border-subtle bg-surface-card p-3">
        <div>
          <p className="m-0 text-detail font-bold text-text-primary">No frame classified yet</p>
          <p className="m-0 mt-0.5 text-compact text-text-muted">
            Run investigation or sample the stream.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={classifying}
          onClick={onClassify}
          icon={<Camera className="h-3 w-3" />}
          className="font-mono text-caption"
        >
          Classify {formatTime(currentTime)}
        </Button>
      </div>
    );
  }

  const styles = classificationStyles[displayed.classification];
  const isSlate = displayed.classification === 'slate';

  return (
    <article className={`mx-5 mb-3 rounded-inset border p-4 ${styles.surface}`}>
      <div className="flex items-center justify-between gap-2.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-caption font-bold uppercase tracking-micro ${styles.label}`}
        >
          <span aria-hidden="true" className={`size-1.5 rounded-full ${styles.dot}`} />
          {isSlate
            ? displayed.slate_type
              ? `Slate · ${displayed.slate_type}`
              : 'Slate'
            : displayed.classification}
        </span>
        <span className="font-mono text-xs font-semibold text-text-secondary">
          {confidence} confidence
        </span>
      </div>
      <h3 className="mt-3 mb-1 text-section font-bold text-text-primary">
        {classificationHeading(displayed.classification)}
      </h3>
      <p className="m-0 text-detail leading-evidence text-text-secondary">
        {displayed.visual_summary || classificationFallback(displayed.classification)}
      </p>
      {displayed.text_detected && (
        <div className="mt-3 border-t border-border-subtle pt-2.5 font-mono text-caption uppercase text-text-muted">
          OCR text detected
          <b className="mt-1 block font-sans text-detail font-bold normal-case text-text-primary">
            “{displayed.text_detected}”
          </b>
        </div>
      )}
      {activeSource === 'manual' && (
        <div className="mt-2 font-mono text-caption text-text-muted">
          Operator sample (manual probe · not admitted diagnosis evidence)
        </div>
      )}
    </article>
  );
}
