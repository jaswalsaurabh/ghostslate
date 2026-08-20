import type { InvestigationTraceEvent } from '../types.js';
import { TraceFrameEvent } from './trace/TraceFrameEvent.js';
import { TraceMessageEvent } from './trace/TraceMessageEvent.js';
import { TraceToolEvent } from './trace/TraceToolEvent.js';

interface InvestigationEventItemProps {
  event: InvestigationTraceEvent;
}

export function InvestigationEventItem({ event }: InvestigationEventItemProps) {
  if (event.type === 'status' || event.type === 'reasoning' || event.type === 'error') {
    return <TraceMessageEvent event={event} />;
  }
  if (event.type === 'frame_classified') {
    return <TraceFrameEvent event={event} />;
  }
  if (event.type === 'tool_call' || event.type === 'tool_result' || event.type === 'vision_call') {
    return <TraceToolEvent event={event} />;
  }
  return null;
}
