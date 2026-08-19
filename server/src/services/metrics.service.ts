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
}

export interface RateCard {
  cpmUsd: number;
  impressionsPerCue: number;
}

export const CANONICAL_RATE_CARD: RateCard = {
  cpmUsd: 25.0, // Baseline CPM for FAST ad pods
  impressionsPerCue: 200, // Standard estimated viewer impressions per SCTE-35 cue
};

export class MetricsService {
  constructor(private readonly rateCard: RateCard = CANONICAL_RATE_CARD) {}

  /**
   * Computes financial revenue loss from unmonetized SCTE-35 ad cues.
   * Single ownership rule: all loss calculations repo-wide must trace to this function.
   */
  computeLoss(
    unmonetizedCues: number,
    impressionsPerCue: number = this.rateCard.impressionsPerCue,
    cpmUsd: number = this.rateCard.cpmUsd,
  ): number {
    if (unmonetizedCues <= 0 || impressionsPerCue <= 0 || cpmUsd <= 0) {
      return 0.0;
    }
    const impressions = unmonetizedCues * impressionsPerCue;
    const loss = Math.round(impressions * (cpmUsd / 1000) * 100) / 100;
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
      colMap.get('latency_ms') ??
      colMap.get('latency') ??
      -1;

    const bleedIdx =
      colMap.get('bleed_pct') ??
      colMap.get('slate_bleed_pct') ??
      colMap.get('failure_rate') ??
      colMap.get('drop_pct') ??
      -1;

    const cuesIdx = colMap.get('total_cues') ?? colMap.get('cues') ?? colMap.get('count') ?? -1;

    const droppedIdx =
      colMap.get('dropped_ads') ??
      colMap.get('failed_stitches') ??
      colMap.get('dropped_stitches') ??
      colMap.get('failures') ??
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

    // Find the row with highest bleed percentage or worst latency / failures
    let worstRow = queryData.rows[0];
    let maxMetricVal = -1;

    for (const row of queryData.rows) {
      let metricVal = -1;
      if (bleedIdx >= 0 && row[bleedIdx] != null && !isNaN(Number(row[bleedIdx]))) {
        metricVal = Number(row[bleedIdx]);
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

    // 3. Cues & Dropped
    const cuesNum =
      cuesIdx >= 0 && worstRow[cuesIdx] != null && !isNaN(Number(worstRow[cuesIdx]))
        ? Number(worstRow[cuesIdx])
        : null;

    let droppedNum: number | null = null;
    if (droppedIdx >= 0 && worstRow[droppedIdx] != null && !isNaN(Number(worstRow[droppedIdx]))) {
      droppedNum = Number(worstRow[droppedIdx]);
    }

    // 4. Slate Bleed Percentage
    let bleedNum: number | null = null;
    if (bleedIdx >= 0 && worstRow[bleedIdx] != null && !isNaN(Number(worstRow[bleedIdx]))) {
      bleedNum = Number(worstRow[bleedIdx]);
    } else if (cuesNum !== null && cuesNum > 0 && droppedNum !== null) {
      bleedNum = (droppedNum / cuesNum) * 100;
    }

    if (droppedNum === null && cuesNum !== null && bleedNum !== null) {
      droppedNum = Math.round(cuesNum * (bleedNum / 100));
    }

    const slateBleedRate = bleedNum !== null ? `${bleedNum.toFixed(1)}%` : null;
    const isCriticalBleed = bleedNum !== null ? bleedNum > 20 : false;
    const slateBleedVariant =
      bleedNum !== null ? (isCriticalBleed ? 'critical' : 'success') : 'neutral';
    const slateBleedTag =
      bleedNum !== null ? (isCriticalBleed ? 'CRITICAL SPIKE' : 'NOMINAL') : null;
    const slateBleedSubtext = slateBleedRate !== null ? 'Target: 0.0% unmonetized pod time' : null;

    // 5. Revenue Loss
    let formattedLoss: string | null = null;
    let revenueLossSubtext: string | null = null;
    let revenueLossVariant: GroundedKpiPayload['revenueLossVariant'] = 'neutral';
    let revenueLossTag: string | null = null;

    if (droppedNum !== null) {
      const loss = this.computeLoss(droppedNum);
      formattedLoss = `$${loss.toFixed(2)}`;
      revenueLossSubtext = `${droppedNum} unmonetized SCTE-35 cues`;
      revenueLossVariant = isCriticalBleed || loss > 0 ? 'critical' : 'success';
      revenueLossTag = isCriticalBleed ? 'Loss in Window' : 'Optimal';
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
    };
  }
}
