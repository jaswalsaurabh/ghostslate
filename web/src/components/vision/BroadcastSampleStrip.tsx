import type { InvestigationCaseConfig } from '../../config/investigation-cases.js';
import { classificationStyles } from './classification-styles.js';

export function formatTimecode(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${String(mins).padStart(2, '0')}:${secs.padStart(4, '0')}`;
}

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
  const samples = activeCase.samples;

  return (
    <div
      className="mx-5 mb-3 mt-2 grid grid-cols-4 gap-2"
      aria-label="Sampled broadcast frames"
      role="group"
    >
      {samples.map((sample) => {
        const isSelected = Math.abs(selectedTime - sample.time) < 0.8;
        const styles = classificationStyles[sample.type];
        return (
          <button
            key={sample.time}
            type="button"
            onClick={() => onSeek(sample.time)}
            aria-label={`${sample.label} frame at ${sample.time} seconds`}
            aria-pressed={isSelected}
            className={`broadcast-thumbnail group relative min-h-10 cursor-pointer overflow-hidden rounded-md border bg-surface-card p-0 transition-all duration-fast focus-visible:outline-2 focus-visible:outline-interactive ${
              isSelected ? styles.selected : 'border-border-subtle hover:border-border-strong'
            }`}
          >
            <img
              src={sample.image}
              alt=""
              className="broadcast-thumbnail-image h-full w-full object-cover transition-transform duration-fast"
            />
            <span className="absolute bottom-1 left-1 rounded-sm bg-media-overlay px-1.5 py-0.5 font-mono text-forensic-meta font-bold text-media-text-primary backdrop-blur-xs">
              {formatTimecode(sample.time)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
