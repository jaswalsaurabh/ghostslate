import type { InvestigationEvent } from './investigation.service.js';
import { MetricsService } from './metrics.service.js';

export interface GroundingViolation {
  claim: string; // the numeric literal as it appeared in the diagnosis
  context: string; // surrounding sentence, for the war room and test failure messages
}

export interface GroundingReport {
  grounded: boolean;
  violations: GroundingViolation[];
  checkedClaims: number;
}

/**
 * Constant numbers that the agent legitimately restates from system prompt context
 * rather than querying from ClickHouse.
 * - 450: SSAI stitcher deadline threshold in ms (latencies above 450ms fall back to slate)
 * - 1200: SSAI hard auction timeout threshold in ms (latencies above 1200ms trigger TIMEOUT)
 * - 2026: Telemetry dataset baseline year
 */
export const EXEMPT_SYSTEM_NUMBERS: ReadonlySet<number> = new Set([450, 1200, 2026]);

/**
 * Floating point tolerance for comparing diagnosis claims to corpus numbers.
 * Allows for standard rounding in diagnoses (e.g. 97.73% vs 97.7%, $1,933.17 vs $1,933.165).
 */
export const NUMERIC_TOLERANCE = 0.05;

export class GroundingService {
  constructor(private readonly metricsService: MetricsService = new MetricsService()) {}

  /**
   * Verifies that every numeric claim stated in the final diagnosis traces to a value
   * returned by a ClickHouse tool query, an emitted metric, a single-ownership derivation
   * by MetricsService from queried figures, or an explicit system prompt exemption.
   */
  verify(diagnosis: string, steps: InvestigationEvent[]): GroundingReport {
    if (!diagnosis || !diagnosis.trim()) {
      return { grounded: true, violations: [], checkedClaims: 0 };
    }

    const corpus = this.buildCorpus(steps);
    const claims = this.extractNumericClaims(diagnosis);

    const violations: GroundingViolation[] = [];

    for (const claim of claims) {
      if (this.isExempt(claim, diagnosis)) {
        continue;
      }

      if (!this.isGrounded(claim.numericValue, corpus)) {
        violations.push({
          claim: claim.rawText,
          context: claim.context,
        });
      }
    }

    return {
      grounded: violations.length === 0,
      violations,
      checkedClaims: claims.length,
    };
  }

  private isExempt(
    claim: { rawText: string; numericValue: number; index: number },
    fullText: string,
  ): boolean {
    if (EXEMPT_SYSTEM_NUMBERS.has(claim.numericValue)) {
      return true;
    }

    // Check if the claim falls strictly inside an ISO timestamp or clock time literal
    const timestampRegex =
      /\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?\b|\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
    let tsMatch: RegExpExecArray | null;
    while ((tsMatch = timestampRegex.exec(fullText)) !== null) {
      const start = tsMatch.index;
      const end = start + tsMatch[0].length;
      if (claim.index >= start && claim.index + claim.rawText.length <= end) {
        return true;
      }
    }

    // Small ordinals for steps/phases (e.g. "Step 1", "turn 2", "Phase 1")
    const prefix = fullText.slice(Math.max(0, claim.index - 12), claim.index).toLowerCase();
    if (/(?:step|turn|phase|item|stage)\s*$/i.test(prefix)) {
      return true;
    }

    return false;
  }

  private isGrounded(val: number, corpus: Set<number>): boolean {
    for (const corpusVal of corpus) {
      if (Math.abs(corpusVal - val) <= NUMERIC_TOLERANCE) {
        return true;
      }
    }
    return false;
  }

  private buildCorpus(steps: InvestigationEvent[]): Set<number> {
    const numbers = new Set<number>();
    const harvestedCpms: number[] = [];
    const harvestedImpressions: number[] = [];

    const addNumber = (n: unknown) => {
      if (typeof n === 'number' && Number.isFinite(n)) {
        numbers.add(n);
      } else if (typeof n === 'string') {
        const cleaned = n.replace(/[$,%]/g, '').trim();
        const parsed = parseFloat(cleaned);
        if (Number.isFinite(parsed)) {
          numbers.add(parsed);
        }
      }
    };

    const numbersFromText = (text: string) => {
      // Remove commas from thousands separators before regex match
      const cleaned = text.replace(/(\d),(\d)/g, '$1$2');
      const matches = cleaned.match(/-?\d+(?:\.\d+)?/g);
      if (matches) {
        matches.forEach((m) => {
          const val = parseFloat(m);
          if (Number.isFinite(val)) {
            addNumber(val);
          }
        });
      }
    };

    const harvestFromObject = (obj: unknown) => {
      if (obj === null || obj === undefined) return;
      if (typeof obj === 'number') {
        addNumber(obj);
      } else if (typeof obj === 'string') {
        try {
          const parsed = JSON.parse(obj);
          harvestFromObject(parsed);
        } catch {
          numbersFromText(obj);
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(harvestFromObject);
      } else if (typeof obj === 'object') {
        Object.values(obj).forEach(harvestFromObject);
      }
    };

    for (const ev of steps) {
      if (ev.type === 'tool_result' && ev.data) {
        harvestFromObject(ev.data.result);
        try {
          const parsed =
            typeof ev.data.result === 'string' ? JSON.parse(ev.data.result) : ev.data.result;
          if (parsed?.rows && Array.isArray(parsed.rows) && Array.isArray(parsed.columns)) {
            const cols = (parsed.columns as string[]).map((c) => c.toLowerCase());
            const cpmIdx = cols.findIndex((c) => c === 'cpm_usd' || c === 'cpm' || c === 'cpmusd');
            const unmonetizedIdx = cols.findIndex(
              (c) =>
                c === 'unmonetized_impressions' ||
                c === 'unmonetized' ||
                c === 'slate_cues' ||
                c === 'failures',
            );

            for (const row of parsed.rows) {
              if (Array.isArray(row)) {
                if (cpmIdx >= 0 && typeof row[cpmIdx] === 'number') {
                  harvestedCpms.push(row[cpmIdx]);
                }
                if (unmonetizedIdx >= 0 && typeof row[unmonetizedIdx] === 'number') {
                  harvestedImpressions.push(row[unmonetizedIdx]);
                }
              }
            }
          }
        } catch {
          // Non-JSON tool result
        }
      } else if (ev.type === 'metrics' && ev.data) {
        harvestFromObject(ev.data);
      }
    }

    // Single ownership derivation: derive loss strictly from queried CPMs paired with queried unmonetized impressions
    for (const impressions of harvestedImpressions) {
      for (const cpm of harvestedCpms) {
        const loss = this.metricsService.computeLoss(impressions, cpm);
        if (loss > 0) {
          numbers.add(loss);
        }
      }
    }

    return numbers;
  }

  private extractNumericClaims(
    text: string,
  ): Array<{ rawText: string; numericValue: number; index: number; context: string }> {
    const claims: Array<{
      rawText: string;
      numericValue: number;
      index: number;
      context: string;
    }> = [];

    // Regex matching integers, floats, currencies, percentages, and ms latencies.
    // Explicitly avoids partial prefix matches on numbers without commas.
    const regex = /\$?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:%|ms)?/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const rawText = match[0];
      const cleaned = rawText
        .replace(/[$,%]|ms$/g, '')
        .replace(/,/g, '')
        .trim();
      const numericValue = parseFloat(cleaned);

      if (!Number.isFinite(numericValue)) {
        continue;
      }

      // Extract surrounding sentence/clause context
      const before = text.slice(0, match.index);
      const after = text.slice(match.index + rawText.length);
      const lastPeriod = before.lastIndexOf('.');
      const start = lastPeriod === -1 ? 0 : lastPeriod + 1;
      const nextPeriod = after.indexOf('.');
      const end = nextPeriod === -1 ? text.length : match.index + rawText.length + nextPeriod;
      const context = text.slice(start, end).trim();

      claims.push({
        rawText,
        numericValue,
        index: match.index,
        context,
      });
    }

    return claims;
  }
}
