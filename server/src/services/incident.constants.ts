export const MINIMUM_COHORT_CUES = 20;
export const INCIDENT_FAILURE_THRESHOLD_PCT = 20;
export const COHORT_DISPERSION_THRESHOLD_PP = 15;
export const STITCHER_DEADLINE_MS = 450;
export const HARD_AUCTION_TIMEOUT_MS = 1200;

export interface IncidentMediaMapping {
  channel: string;
  from: string;
  to: string;
  permittedMediaFile: string;
  minTimestampSeconds: number;
  maxTimestampSeconds: number;
}

export const PRIMARY_INCIDENT_MEDIA_MAPPING: IncidentMediaMapping = {
  channel: 'ch-01',
  from: '2026-08-14T19:00:00.000Z',
  to: '2026-08-14T23:00:00.000Z',
  permittedMediaFile: 'slate.mp4',
  minTimestampSeconds: 0,
  maxTimestampSeconds: 15,
};

export function getPermittedMediaMapping(context: {
  channel: string;
  from: string;
  to: string;
}): IncidentMediaMapping | undefined {
  if (
    context.channel === PRIMARY_INCIDENT_MEDIA_MAPPING.channel &&
    context.from === PRIMARY_INCIDENT_MEDIA_MAPPING.from &&
    context.to === PRIMARY_INCIDENT_MEDIA_MAPPING.to
  ) {
    return PRIMARY_INCIDENT_MEDIA_MAPPING;
  }
  return undefined;
}
