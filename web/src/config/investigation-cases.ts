export type InvestigationCaseId = 'primary' | 'negative-control';

export interface InvestigationCaseConfig {
  readonly id: InvestigationCaseId;
  readonly label: string;
  readonly shortLabel: string;
  readonly eyebrow: string;
  readonly heading: string;
  readonly description: string;
  readonly channel: string;
  readonly from: string;
  readonly to: string;
  readonly prompt: string;
  readonly mediaSource: string;
  readonly videoFile: string;
  readonly expectedOutcome: 'incident' | 'no_incident';
}

export const INVESTIGATION_CASES = {
  primary: {
    id: 'primary',
    label: 'Primary incident',
    shortLabel: 'Incident',
    eyebrow: 'Primary incident · FAST-01 · ch-01',
    heading: 'Investigate suspected monetization failure',
    description: 'SSAI slate-bleed investigation on the target FAST feed.',
    channel: 'ch-01',
    from: '2026-08-14T19:00:00.000Z',
    to: '2026-08-14T23:00:00.000Z',
    prompt:
      'Vision classifier detected possible slate bleed on channel ch-01. Correlate the incident window with SCTE-35 cue logs, isolate any statistically significant SSP, device class, and codec cohort, visually confirm on-air slate when required, and compute only ClickHouse-grounded unmonetized loss.',
    mediaSource: '/media/test_stream_slate.mp4',
    videoFile: 'test_stream_slate.mp4',
    expectedOutcome: 'incident',
  },
  'negative-control': {
    id: 'negative-control',
    label: 'Negative control',
    shortLabel: 'Control',
    eyebrow: 'Negative control · FAST-01 · ch-01',
    heading: 'Validate a known-clean broadcast window',
    description: 'Known nominal window used to verify evidence-gated restraint.',
    channel: 'ch-01',
    from: '2026-08-09T19:00:00.000Z',
    to: '2026-08-09T23:00:00.000Z',
    prompt:
      'Investigate ad stitch performance for channel ch-01 in this control window. Apply the minimum-cue, absolute failure, and cohort-dispersion guards. Do not call Vision, assert a root cause, calculate attributable loss, or propose remediation unless authoritative ClickHouse evidence establishes an incident.',
    mediaSource: '/media/test_stream_ad.mp4',
    videoFile: 'test_stream_ad.mp4',
    expectedOutcome: 'no_incident',
  },
} as const satisfies Readonly<Record<InvestigationCaseId, InvestigationCaseConfig>>;

export const DEFAULT_INVESTIGATION_CASE_ID: InvestigationCaseId = 'primary';
