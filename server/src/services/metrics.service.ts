import { type DiagnosisRow } from './evidence.helper.js';
import {
  COHORT_DISPERSION_THRESHOLD_PP,
  INCIDENT_FAILURE_THRESHOLD_PCT,
  MINIMUM_COHORT_CUES,
  STITCHER_DEADLINE_MS,
} from './incident.constants.js';

export type { DiagnosisRow } from './evidence.helper.js';

export interface GroundedKpiPayload {
  revenueLoss: string | null;
  revenueLossSubtext: string | null;
  revenueLossVariant: 'critical' | 'warning' | 'success' | 'interactive' | 'neutral';
  revenueLossTag: string | null;

  slateBleedRate: string | null;
  slateBleedSubtext: string | null;
  slateBleedVariant: 'critical' | 'warning' | 'success' | 'interactive' | 'neutral';
  slateBleedTag: string | null;

  offendingSsp: string | null;
  sspLatency: string | null;
  sspSubtext: string | null;
  sspVariant: 'critical' | 'warning' | 'success' | 'interactive' | 'neutral';

  scannedLogs: string | null;
  scannedLogsSubtext: string | null;
  scannedLogsTag: string | null;

  isGroundedFromMcp: boolean;
  rateCardFromQuery: boolean;
}

/**
 * Pure incident selector with single ownership of the incident decision.
 *
 * Rules:
 * 1. Small sample guard: cues >= 20.
 * 2. Absolute failure threshold: unmonetized_pct > 20%.
 * 3. Worst-cohort candidate: ordered by unmonetized_pct DESC, then unmonetized_impressions DESC,
 *    then lexicographically by ssp_id, device_class, and codec.
 * 4. Peers: other cues >= 20 rows from the same evidence snapshot and daypart.
 * 5. Restraint check: if no peer rows exist, returns null (a lone cohort is insufficient evidence of isolation).
 * 6. Dispersion check: worst candidate must exceed peer median by at least COHORT_DISPERSION_THRESHOLD_PP.
 */
export function selectIncidentCohort(rows: DiagnosisRow[]): DiagnosisRow | null {
  if (!rows || rows.length === 0) {
    return null;
  }

  // 1. Guard cues >= 20
  const eligibleRows = rows.filter((r) => r.cues >= MINIMUM_COHORT_CUES);
  if (eligibleRows.length === 0) {
    return null;
  }

  // 2. Sort candidate worst cohorts deterministically
  const sorted = [...eligibleRows].sort((a, b) => {
    if (b.unmonetizedPct !== a.unmonetizedPct) {
      return b.unmonetizedPct - a.unmonetizedPct;
    }
    if (b.unmonetizedImpressions !== a.unmonetizedImpressions) {
      return b.unmonetizedImpressions - a.unmonetizedImpressions;
    }
    const sspComp = a.sspId.localeCompare(b.sspId);
    if (sspComp !== 0) return sspComp;
    const deviceComp = a.deviceClass.localeCompare(b.deviceClass);
    if (deviceComp !== 0) return deviceComp;
    return a.codec.localeCompare(b.codec);
  });

  const worst = sorted[0];
  if (!worst) {
    return null;
  }

  // 3. Absolute failure threshold (> 20%)
  if (worst.unmonetizedPct <= INCIDENT_FAILURE_THRESHOLD_PCT) {
    return null;
  }

  // 4. Peer cohorts from the same daypart (excluding the selected worst row)
  const peers = eligibleRows.filter(
    (r) => r !== worst && r.daypart.toLowerCase() === worst.daypart.toLowerCase(),
  );

  // 5. Restraint rule: A lone cohort is insufficient evidence of isolation
  if (peers.length === 0) {
    return null;
  }

  // 6. Compute peer median
  const peerBleeds = peers.map((p) => p.unmonetizedPct).sort((a, b) => a - b);
  const mid = Math.floor(peerBleeds.length / 2);
  const peerMedian =
    peerBleeds.length % 2 !== 0
      ? (peerBleeds[mid] ?? 0)
      : ((peerBleeds[mid - 1] ?? 0) + (peerBleeds[mid] ?? 0)) / 2;

  // 7. Cohort dispersion threshold check
  if (worst.unmonetizedPct - peerMedian < COHORT_DISPERSION_THRESHOLD_PP) {
    return null;
  }

  return worst;
}

export class MetricsService {
  /**
   * Computes financial revenue loss from unmonetized SSAI viewer stitch attempts.
   * Single ownership rule: all loss calculations repo-wide must trace to this function.
   * Both parameters are required with no defaults. Each stitch attempt is one impression.
   */
  computeLoss(unmonetizedImpressions: number, cpmUsd: number): number {
    if (unmonetizedImpressions <= 0 || cpmUsd <= 0) {
      return 0.0;
    }
    return Math.round(unmonetizedImpressions * (cpmUsd / 1000) * 100) / 100;
  }

  /**
   * Derives grounded KPI metrics from ClickHouse query results or decoded DiagnosisRows.
   * Consumes selectIncidentCohort for single-ownership incident determination.
   */
  deriveMetrics(
    rows: DiagnosisRow[] | null | undefined,
    options?: {
      rowsReturned?: number;
      queryDurationMs?: number;
    },
  ): GroundedKpiPayload {
    if (!rows || rows.length === 0) {
      return this.getEmptyPayload();
    }

    const incident = selectIncidentCohort(rows);

    const rowsReturned =
      typeof options?.rowsReturned === 'number' && options.rowsReturned >= 0
        ? options.rowsReturned
        : rows.length;
    const queryDurationMs = options?.queryDurationMs;

    const scannedLogs = rowsReturned.toLocaleString('en-US');
    const scannedLogsSubtext =
      typeof queryDurationMs === 'number' && queryDurationMs > 0
        ? `ClickHouse ASOF JOIN (${queryDurationMs}ms)`
        : 'ClickHouse ASOF JOIN Telemetry';
    const scannedLogsTag = 'GROUNDED (MCP)';

    if (incident) {
      const offendingSsp = incident.sspId ? incident.sspId.toUpperCase() : null;
      const rawLatency = Math.round(incident.p95AuctionMs);
      const sspLatency = `${rawLatency}ms`;
      const deadlineExceeded = incident.p95AuctionMs > STITCHER_DEADLINE_MS;
      const sspVariant = deadlineExceeded ? 'warning' : 'success';
      const sspSubtext = deadlineExceeded
        ? `Stitcher deadline: ${STITCHER_DEADLINE_MS}ms (Exceeded)`
        : `Within ${STITCHER_DEADLINE_MS}ms stitcher deadline`;

      const slateBleedRate = `${incident.unmonetizedPct.toFixed(1)}%`;
      const slateBleedVariant = 'critical';
      const slateBleedTag = 'CRITICAL SPIKE';
      const slateBleedSubtext = 'Target: 0.0% unmonetized pod time';

      let formattedLoss: string | null = null;
      let revenueLossSubtext: string | null = null;
      let revenueLossVariant: GroundedKpiPayload['revenueLossVariant'] = 'neutral';
      let revenueLossTag: string | null = null;
      let rateCardFromQuery = false;

      if (incident.cpmUsd !== null && incident.cpmUsd > 0) {
        const loss = this.computeLoss(incident.unmonetizedImpressions, incident.cpmUsd);
        formattedLoss = `$${loss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        revenueLossSubtext = `${incident.unmonetizedImpressions.toLocaleString('en-US')} unmonetized impressions`;
        revenueLossVariant = 'critical';
        revenueLossTag = 'Loss in Window';
        rateCardFromQuery = true;
      } else {
        revenueLossSubtext = 'Financial impact unavailable';
        revenueLossVariant = 'neutral';
        revenueLossTag = null;
        rateCardFromQuery = false;
      }

      return {
        revenueLoss: formattedLoss,
        revenueLossSubtext,
        revenueLossVariant,
        revenueLossTag,

        slateBleedRate,
        slateBleedSubtext,
        slateBleedVariant,
        slateBleedTag,

        offendingSsp,
        sspLatency,
        sspSubtext,
        sspVariant,

        scannedLogs,
        scannedLogsSubtext,
        scannedLogsTag,

        isGroundedFromMcp: true,
        rateCardFromQuery,
      };
    }

    // No incident selected (negative control / diffuse variation)
    const eligibleRows = rows.filter((r) => r.cues >= MINIMUM_COHORT_CUES);
    const candidateRows = eligibleRows.length > 0 ? eligibleRows : rows;
    const firstCandidate = candidateRows[0];
    const maxRow = firstCandidate
      ? candidateRows.reduce(
          (max, r) => (r.unmonetizedPct > max.unmonetizedPct ? r : max),
          firstCandidate,
        )
      : undefined;

    const bleedVal = maxRow ? maxRow.unmonetizedPct : null;
    const slateBleedRate = bleedVal !== null ? `${bleedVal.toFixed(1)}%` : null;
    const slateBleedVariant = bleedVal !== null && bleedVal > 5 ? 'warning' : 'success';
    const slateBleedTag = 'NOMINAL';
    const slateBleedSubtext = 'Target: 0.0% unmonetized pod time';

    return {
      revenueLoss: null,
      revenueLossSubtext: 'No incident detected in window',
      revenueLossVariant: 'neutral',
      revenueLossTag: 'Nominal',

      slateBleedRate,
      slateBleedSubtext,
      slateBleedVariant,
      slateBleedTag,

      offendingSsp: null,
      sspLatency: null,
      sspSubtext: null,
      sspVariant: 'neutral',

      scannedLogs,
      scannedLogsSubtext,
      scannedLogsTag,

      isGroundedFromMcp: true,
      rateCardFromQuery: false,
    };
  }

  private getEmptyPayload(): GroundedKpiPayload {
    return {
      revenueLoss: null,
      revenueLossSubtext: null,
      revenueLossVariant: 'neutral',
      revenueLossTag: null,

      slateBleedRate: null,
      slateBleedSubtext: null,
      slateBleedVariant: 'neutral',
      slateBleedTag: null,

      offendingSsp: null,
      sspLatency: null,
      sspSubtext: null,
      sspVariant: 'neutral',

      scannedLogs: null,
      scannedLogsSubtext: null,
      scannedLogsTag: null,

      isGroundedFromMcp: false,
      rateCardFromQuery: false,
    };
  }
}
