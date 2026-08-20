import type { InvestigationCaseConfig } from '../../config/investigation-cases.js';

export const incidentSamples = [
  { time: 9.8, image: '/media/content_frame.png', label: 'Content' },
  { time: 12.4, image: '/media/slate_frame.png', label: 'Slate' },
  { time: 17.2, image: '/media/slate_frame.png', label: 'Slate persists' },
  { time: 25.4, image: '/media/ad_frame.png', label: 'Advertisement' },
] as const;

export const controlSamples = [
  { time: 5.2, image: '/media/content_frame.png', label: 'Content' },
  { time: 12.4, image: '/media/ad_frame.png', label: 'Advertisement' },
  { time: 17.2, image: '/media/ad_frame.png', label: 'Advertisement' },
  { time: 25.4, image: '/media/content_frame.png', label: 'Content' },
] as const;

export function formatTime(value: number) {
  return `${Math.max(0, value).toFixed(1)}s`;
}

interface BroadcastSampleStripProps {
  activeCase: InvestigationCaseConfig;
  selectedTime: number;
  onSeek: (seconds: number) => void;
}

export function BroadcastSampleStrip({
  activeCase,
  selectedTime,
  onSeek,
}: BroadcastSampleStripProps) {
  const samples = activeCase.id === 'primary' ? incidentSamples : controlSamples;

  return (
    <div className="grid grid-cols-4 gap-2 p-3" aria-label="Sampled broadcast frames">
      {samples.map((sample) => (
        <button
          key={sample.time}
          type="button"
          onClick={() => onSeek(sample.time)}
          aria-label={`${sample.label} frame at ${sample.time} seconds`}
          className={`relative overflow-hidden rounded-md border transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive ${
            Math.abs(selectedTime - sample.time) < 0.8
              ? 'border-interactive'
              : 'border-border-subtle hover:border-border-strong'
          }`}
        >
          <img src={sample.image} alt="" className="aspect-video w-full object-cover" />
          <span className="absolute bottom-1 left-1 rounded bg-surface-scrim px-1 font-mono text-xs text-text-primary">
            {formatTime(sample.time)}
          </span>
        </button>
      ))}
    </div>
  );
}
