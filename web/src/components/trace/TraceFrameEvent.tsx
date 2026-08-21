import type { ClassificationType, InvestigationTraceEvent, SlateType } from '../../types.js';
import { FrameEvidenceCard } from '../FrameEvidenceCard.js';

export function TraceFrameEvent({
  event,
}: {
  event: Extract<InvestigationTraceEvent, { type: 'frame_classified' }>;
}) {
  const data = event.data;
  const args = data.args ?? {};
  return (
    <FrameEvidenceCard
      classification={data.classification as ClassificationType}
      confidence={Number(data.confidence ?? 0)}
      slateType={(data.slate_type ?? null) as SlateType}
      textDetected={String(data.text_detected ?? '')}
      visualSummary={String(data.visual_summary ?? '')}
      timestampSeconds={
        typeof data.timestampSeconds === 'number' ? data.timestampSeconds : undefined
      }
      videoFile={typeof args.video_file === 'string' ? args.video_file : undefined}
      frameBase64={typeof data.frameBase64 === 'string' ? data.frameBase64 : undefined}
      cached={Boolean(data.cached)}
    />
  );
}
