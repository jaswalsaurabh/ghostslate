import { ValidationError } from '../errors/domain-error.js';
import type { InvestigationContext } from './evidence.helper.js';

export const SCENARIO_IDS = [
  'primary',
  'negative-control',
  'small-sample-guard',
  'latency-confounder-isolation',
  'stb-error-confounder',
  'black-screen-timeout',
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];
export type ScenarioExpectedOutcome = 'incident' | 'no_incident';
export type ScenarioVisionMode = 'required' | 'disabled';
export type ScenarioSampleType = 'slate' | 'ad' | 'content';

export interface ScenarioSample {
  time: number;
  image: string;
  label: string;
  type: ScenarioSampleType;
}

export interface InvestigationScenario extends InvestigationContext {
  id: ScenarioId;
  label: string;
  shortLabel: string;
  eyebrow: string;
  heading: string;
  description: string;
  prompt: string;
  mediaSource: string;
  videoFile: string;
  poster: string;
  durationSeconds: number;
  samples: readonly ScenarioSample[];
  visionMode: ScenarioVisionMode;
  agentSampleTimestampSeconds: number | null;
  expectedOutcome: ScenarioExpectedOutcome;
}

export type PublicInvestigationScenario = Omit<
  InvestigationScenario,
  'videoFile' | 'agentSampleTimestampSeconds'
>;

const CONTENT_SAMPLE: ScenarioSample = {
  time: 5,
  image: '/media/content_frame.png',
  label: 'Content',
  type: 'content',
};

const END_CONTENT_SAMPLE: ScenarioSample = {
  time: 30,
  image: '/media/content_frame.png',
  label: 'Content resumes',
  type: 'content',
};

const SLATE_SAMPLES: readonly ScenarioSample[] = [
  CONTENT_SAMPLE,
  { time: 12.5, image: '/media/slate_frame.png', label: 'Slate', type: 'slate' },
  { time: 20, image: '/media/slate_frame.png', label: 'Slate persists', type: 'slate' },
  END_CONTENT_SAMPLE,
];

const AD_SAMPLES: readonly ScenarioSample[] = [
  CONTENT_SAMPLE,
  { time: 12.5, image: '/media/ad_frame.png', label: 'Advertisement', type: 'ad' },
  { time: 20, image: '/media/ad_frame.png', label: 'Advertisement', type: 'ad' },
  END_CONTENT_SAMPLE,
];

const BLACK_SCREEN_SAMPLES: readonly ScenarioSample[] = [
  CONTENT_SAMPLE,
  { time: 12.5, image: '/media/black_screen_frame.png', label: 'Black slate', type: 'slate' },
  {
    time: 20,
    image: '/media/black_screen_frame.png',
    label: 'Black slate persists',
    type: 'slate',
  },
  END_CONTENT_SAMPLE,
];

const SCENARIOS: readonly InvestigationScenario[] = [
  {
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
    poster: '/media/content_frame.png',
    durationSeconds: 35,
    samples: SLATE_SAMPLES,
    visionMode: 'required',
    agentSampleTimestampSeconds: 12.5,
    expectedOutcome: 'incident',
  },
  {
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
    poster: '/media/ad_frame.png',
    durationSeconds: 35,
    samples: AD_SAMPLES,
    visionMode: 'disabled',
    agentSampleTimestampSeconds: null,
    expectedOutcome: 'no_incident',
  },
  {
    id: 'small-sample-guard',
    label: 'Insufficient evidence',
    shortLabel: 'Evidence guard',
    eyebrow: 'Evidence guard · FAST-01 · ch-01',
    heading: 'Validate the small-sample evidence guard',
    description: 'Sparse telemetry window used to verify restraint below the minimum cue count.',
    channel: 'ch-01',
    from: '2026-08-14T19:00:00.000Z',
    to: '2026-08-14T19:15:00.000Z',
    prompt:
      'Investigate ad stitch performance for channel ch-01 in this sparse evidence window. Apply the minimum-cue, absolute failure, and cohort-dispersion guards. Do not call Vision, assert a root cause, calculate loss, or propose remediation unless authoritative ClickHouse evidence establishes an incident.',
    mediaSource: '/media/test_stream_ad.mp4',
    videoFile: 'test_stream_ad.mp4',
    poster: '/media/ad_frame.png',
    durationSeconds: 35,
    samples: AD_SAMPLES,
    visionMode: 'disabled',
    agentSampleTimestampSeconds: null,
    expectedOutcome: 'no_incident',
  },
  {
    id: 'latency-confounder-isolation',
    label: 'Latency confounder',
    shortLabel: 'Isolation',
    eyebrow: 'Confounder isolation · FAST-01 · ch-01',
    heading: 'Separate near-deadline latency from real slate bleed',
    description: 'Rejects a 430 ms latency red herring while isolating the failing cohort.',
    channel: 'ch-01',
    from: '2026-08-14T20:00:00.000Z',
    to: '2026-08-14T21:00:00.000Z',
    prompt:
      'Investigate this one-hour incident subwindow. Distinguish the ssp-gamma latency rise that remains below the 450 ms stitcher deadline from any cohort with authoritative unmonetized evidence. Visually confirm slate for the selected incident and compute only ClickHouse-grounded loss.',
    mediaSource: '/media/test_stream_slate.mp4',
    videoFile: 'test_stream_slate.mp4',
    poster: '/media/content_frame.png',
    durationSeconds: 35,
    samples: SLATE_SAMPLES,
    visionMode: 'required',
    agentSampleTimestampSeconds: 12.5,
    expectedOutcome: 'incident',
  },
  {
    id: 'stb-error-confounder',
    label: 'Set-top-box errors',
    shortLabel: 'Error control',
    eyebrow: 'Error confounder · FAST-01 · ch-01',
    heading: 'Distinguish hard ad-call errors from slate bleed',
    description: 'Verifies that unrelated set-top-box errors do not trigger loss attribution.',
    channel: 'ch-01',
    from: '2026-08-12T08:00:00.000Z',
    to: '2026-08-12T12:00:00.000Z',
    prompt:
      'Investigate the set-top-box error window. Treat hard ERROR status separately from slate fallback and timeout, apply all evidence gates, and publish no root cause, loss, or remediation unless authoritative ClickHouse evidence establishes an isolated monetization incident.',
    mediaSource: '/media/test_stream_ad.mp4',
    videoFile: 'test_stream_ad.mp4',
    poster: '/media/ad_frame.png',
    durationSeconds: 35,
    samples: AD_SAMPLES,
    visionMode: 'disabled',
    agentSampleTimestampSeconds: null,
    expectedOutcome: 'no_incident',
  },
  {
    id: 'black-screen-timeout',
    label: 'Black-screen timeout',
    shortLabel: 'Black slate',
    eyebrow: 'Timeout variant · FAST-01 · ch-01',
    heading: 'Investigate a black-screen monetization failure',
    description: 'A second auction-timeout cohort manifested as an on-air black slate.',
    channel: 'ch-01',
    from: '2026-08-16T10:00:00.000Z',
    to: '2026-08-16T12:00:00.000Z',
    prompt:
      'Investigate suspected black-screen slate bleed on channel ch-01. Correlate the incident window with cue and stitch telemetry, isolate the failing SSP, device class, and codec cohort, visually confirm the black-screen slate, and compute only ClickHouse-grounded unmonetized loss.',
    mediaSource: '/media/test_stream_black_screen.mp4',
    videoFile: 'test_stream_black_screen.mp4',
    poster: '/media/content_frame.png',
    durationSeconds: 35,
    samples: BLACK_SCREEN_SAMPLES,
    visionMode: 'required',
    agentSampleTimestampSeconds: 12.5,
    expectedOutcome: 'incident',
  },
];

export const DEFAULT_SCENARIO_ID: ScenarioId = 'primary';

export class ScenarioService {
  list(): readonly InvestigationScenario[] {
    return SCENARIOS;
  }

  get(id: string): InvestigationScenario | undefined {
    return SCENARIOS.find((scenario) => scenario.id === id);
  }

  require(id: string): InvestigationScenario {
    const scenario = this.get(id);
    if (!scenario) throw new ValidationError(`Unknown investigation scenario: ${id}`);
    return scenario;
  }

  findByContext(context: InvestigationContext): InvestigationScenario | undefined {
    return SCENARIOS.find(
      (scenario) =>
        scenario.channel === context.channel &&
        scenario.from === context.from &&
        scenario.to === context.to,
    );
  }

  resolveVisionRequest(id: string, timestamp: number): { videoFile: string; timestamp: number } {
    const scenario = this.require(id);
    if (scenario.visionMode === 'disabled') {
      throw new ValidationError(`Vision is disabled for scenario: ${scenario.id}`);
    }
    if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp >= scenario.durationSeconds) {
      throw new ValidationError(
        `Timestamp must be at least 0 and less than ${scenario.durationSeconds} seconds for scenario: ${scenario.id}`,
      );
    }
    return { videoFile: scenario.videoFile, timestamp };
  }

  catalog(): { defaultScenarioId: ScenarioId; scenarios: PublicInvestigationScenario[] } {
    const scenarios = SCENARIOS.map(
      ({ videoFile: _videoFile, agentSampleTimestampSeconds: _sample, ...scenario }) => scenario,
    );
    return { defaultScenarioId: DEFAULT_SCENARIO_ID, scenarios };
  }
}
