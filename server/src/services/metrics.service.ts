export interface RawMcpQueryData {
  columns: string[];
  rows: (string | number | boolean | null)[][];
}

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

export interface RateCard {
  cpmUsd: number;
}

/**
 * Fallback rate card used strictly when no advertiser_inventory rate card
 * is returned by ClickHouse queries. Fallback numbers must be visibly flagged
 * via rateCardFromQuery: false.
 */
export const CANONICAL_RATE_CARD: RateCard = {
  cpmUsd: 25.0, // Baseline CPM fallback for FAST ad pods
};

/**
 * Minimum percentage-point gap between the worst cohort and the median cohort
 * required to declare an isolated incident rather than diffuse baseline noise.
 * Prevents diffuse elevation (where all cohorts rise together by a few points)
 * from being misclassified as an isolated critical incident.
 */
export const COHORT_DISPERSION_THRESHOLD_PP = 15.0;

export class MetricsService {
  constructor(private readonly fallbackRateCard: RateCard = CANONICAL_RATE_CARD) {}

  /**
   * Computes financial revenue loss from unmonetized SSAI viewer stitch attempts.
   * Single ownership rule: all loss calculations repo-wide must trace to this function.
   * Both parameters are required with no defaults. Each stitch attempt is one impression.
   */
  computeLoss(unmonetizedImpressions: number, cpmUsd: number): number {
    if (unmonetizedImpressions <= 0 || cpmUsd <= 0) {
      return 0.0;
    }
    const loss = Math.round(unmonetizedImpressions * (cpmUsd / 1000) * 100) / 100;
    return loss;
  }

  /**
   * Derives grounded KPI metrics from ClickHouse MCP query results.
   */
  deriveMetrics(
    queryData: RawMcpQueryData | null | undefined,
    options?: {
      rowsScanned?: number;
      queryDurationMs?: number;
    },
  ): GroundedKpiPayload {
    if (
      !queryData ||
      !Array.isArray(queryData.columns) ||
      !Array.isArray(queryData.rows) ||
      queryData.rows.length === 0
    ) {
      return this.getEmptyPayload();
    }

    const colMap = new Map<string, number>();
    queryData.columns.forEach((col, idx) => {
      colMap.set(col.toLowerCase(), idx);
    });

    const sspIdx = colMap.get('ssp_id') ?? colMap.get('ssp') ?? colMap.get('partner_id') ?? -1;

    const latencyIdx =
      colMap.get('avg_latency') ??
      colMap.get('avg_latency_ms') ??
      colMap.get('ad_response_latency_ms') ??
      colMap.get('p95_auction_ms') ??
      colMap.get('latency_ms') ??
      colMap.get('latency') ??
      -1;

    const bleedIdx =
      colMap.get('unmonetized_pct') ??
      colMap.get('bleed_pct') ??
      colMap.get('slate_bleed_pct') ??
      colMap.get('failure_rate') ??
      colMap.get('drop_pct') ??
      -1;

    const cuesIdx = colMap.get('total_cues') ?? colMap.get('cues') ?? colMap.get('count') ?? -1;

    const attemptsIdx =
      colMap.get('total_attempts') ?? colMap.get('attempts') ?? colMap.get('total_stitches') ?? -1;

    const droppedIdx =
      colMap.get('unmonetized_impressions') ??
      colMap.get('unmonetized') ??
      colMap.get('slate_cues') ??
      colMap.get('dropped_ads') ??
      colMap.get('failed_stitches') ??
      colMap.get('dropped_stitches') ??
      colMap.get('failures') ??
      -1;

    const cpmIdx =
      colMap.get('cpm_usd') ??
      colMap.get('cpm') ??
      colMap.get('cpmusd') ??
      colMap.get('rate') ??
      -1;

    // If neither ssp, latency, bleed, nor cues columns match, this is not an expected telemetry result
    if (
      sspIdx === -1 &&
      latencyIdx === -1 &&
      bleedIdx === -1 &&
      cuesIdx === -1 &&
      droppedIdx === -1
    ) {
      return this.getEmptyPayload();
    }

    // Collect all valid bleed percentages across rows to evaluate cohort dispersion
    const cohortBleeds: number[] = [];
    let worstRow = queryData.rows[0];
    let maxMetricVal = -1;

    for (const row of queryData.rows) {
      let metricVal = -1;
      if (bleedIdx >= 0 && row[bleedIdx] != null && !isNaN(Number(row[bleedIdx]))) {
        metricVal = Number(row[bleedIdx]);
        cohortBleeds.push(metricVal);
      } else if (droppedIdx >= 0 && row[droppedIdx] != null && !isNaN(Number(row[droppedIdx]))) {
        metricVal = Number(row[droppedIdx]);
      } else if (latencyIdx >= 0 && row[latencyIdx] != null && !isNaN(Number(row[latencyIdx]))) {
        metricVal = Number(row[latencyIdx]);
      }

      if (metricVal > maxMetricVal) {
        maxMetricVal = metricVal;
        worstRow = row;
      }
    }

    if (!worstRow) {
      return this.getEmptyPayload();
    }

    // 1. Offending SSP
    const ssp =
      sspIdx >= 0 && worstRow[sspIdx] != null && String(worstRow[sspIdx]).trim().length > 0
        ? String(worstRow[sspIdx]).toUpperCase()
        : null;

    // 2. Latency
    const rawLatency =
      latencyIdx >= 0 && worstRow[latencyIdx] != null && !isNaN(Number(worstRow[latencyIdx]))
        ? Math.round(Number(worstRow[latencyIdx]))
        : null;
    const sspLatency = rawLatency !== null ? `${rawLatency}ms` : null;
    const sspVariant = rawLatency !== null ? (rawLatency > 250 ? 'warning' : 'success') : 'neutral';
    const sspSubtext =
      rawLatency !== null
        ? rawLatency > 250
          ? 'SSAI SLA max: 250ms (Exceeded)'
          : 'Within 250ms SLA budget'
        : null;

    // 3. Attempts & Unmonetized Impressions
    let attemptsNum: number | null = null;
    if (
      attemptsIdx >= 0 &&
      worstRow[attemptsIdx] != null &&
      !isNaN(Number(worstRow[attemptsIdx]))
    ) {
      attemptsNum = Number(worstRow[attemptsIdx]);
    } else if (cuesIdx >= 0 && worstRow[cuesIdx] != null && !isNaN(Number(worstRow[cuesIdx]))) {
      attemptsNum = Number(worstRow[cuesIdx]);
    }

    let droppedNum: number | null = null;
    if (droppedIdx >= 0 && worstRow[droppedIdx] != null && !isNaN(Number(worstRow[droppedIdx]))) {
      droppedNum = Number(worstRow[droppedIdx]);
    }

    // 4. Unmonetized / Slate Bleed Percentage
    let bleedNum: number | null = null;
    if (bleedIdx >= 0 && worstRow[bleedIdx] != null && !isNaN(Number(worstRow[bleedIdx]))) {
      bleedNum = Number(worstRow[bleedIdx]);
    } else if (attemptsNum !== null && attemptsNum > 0 && droppedNum !== null) {
      bleedNum = (droppedNum / attemptsNum) * 100;
    }

    if (droppedNum === null && attemptsNum !== null && bleedNum !== null) {
      droppedNum = Math.round(attemptsNum * (bleedNum / 100));
    }

    // Cohort Dispersion Restraint Rule:
    // A spike is critical only if it exceeds 20% absolute failure rate AND stands out
    // from peer cohorts by at least COHORT_DISPERSION_THRESHOLD_PP (or is the sole filtered incident).
    let isSeparated = true;
    if (cohortBleeds.length > 1 && bleedNum !== null) {
      const sorted = [...cohortBleeds].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianVal = sorted[mid] ?? 0;
      const prevVal = sorted[mid - 1] ?? medianVal;
      const medianBleed = sorted.length % 2 !== 0 ? medianVal : (prevVal + medianVal) / 2;
      isSeparated = bleedNum - medianBleed >= COHORT_DISPERSION_THRESHOLD_PP;
    }

    const isCriticalBleed = bleedNum !== null ? bleedNum > 20 && isSeparated : false;
    const slateBleedRate = bleedNum !== null ? `${bleedNum.toFixed(1)}%` : null;
    const slateBleedVariant =
      bleedNum !== null
        ? isCriticalBleed
          ? 'critical'
          : bleedNum > 5
            ? 'warning'
            : 'success'
        : 'neutral';
    const slateBleedTag =
      bleedNum !== null ? (isCriticalBleed ? 'CRITICAL SPIKE' : 'NOMINAL') : null;
    const slateBleedSubtext = slateBleedRate !== null ? 'Target: 0.0% unmonetized pod time' : null;

    // 5. Revenue Loss & Rate Card Grounding
    let formattedLoss: string | null = null;
    let revenueLossSubtext: string | null = null;
    let revenueLossVariant: GroundedKpiPayload['revenueLossVariant'] = 'neutral';
    let revenueLossTag: string | null = null;

    let cpmUsd = this.fallbackRateCard.cpmUsd;
    let rateCardFromQuery = false;

    if (cpmIdx >= 0 && worstRow[cpmIdx] != null && !isNaN(Number(worstRow[cpmIdx]))) {
      const parsedCpm = Number(worstRow[cpmIdx]);
      if (parsedCpm > 0) {
        cpmUsd = parsedCpm;
        rateCardFromQuery = true;
      }
    }

    if (droppedNum !== null) {
      const loss = this.computeLoss(droppedNum, cpmUsd);
      formattedLoss = `$${loss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      revenueLossSubtext = `${droppedNum.toLocaleString('en-US')} unmonetized impressions`;
      revenueLossVariant = isCriticalBleed ? 'critical' : loss > 0 ? 'warning' : 'success';
      revenueLossTag = isCriticalBleed ? 'Loss in Window' : loss > 0 ? 'Nominal' : 'Optimal';
    }

    // 6. Scanned Logs / MCP telemetry execution metrics
    const rowsScanned =
      typeof options?.rowsScanned === 'number' && options.rowsScanned > 0
        ? options.rowsScanned
        : queryData.rows.length;
    const queryDurationMs = options?.queryDurationMs;

    const scannedLogs = rowsScanned.toLocaleString('en-US');
    const scannedLogsSubtext =
      typeof queryDurationMs === 'number' && queryDurationMs > 0
        ? `ClickHouse ASOF JOIN (${queryDurationMs}ms)`
        : 'ClickHouse ASOF JOIN Telemetry';
    const scannedLogsTag = 'GROUNDED (MCP)';

    return {
      revenueLoss: formattedLoss,
      revenueLossSubtext,
      revenueLossVariant,
      revenueLossTag,

      slateBleedRate,
      slateBleedSubtext,
      slateBleedVariant,
      slateBleedTag,

      offendingSsp: ssp,
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
