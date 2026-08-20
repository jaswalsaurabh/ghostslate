import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface InvestigationContext {
  channel: string;
  from: string;
  to: string;
}

export interface DiagnosisRow {
  channelId: string;
  sspId: string;
  deviceClass: string;
  codec: string;
  daypart: string;
  cues: number;
  totalAttempts: number;
  unmonetizedImpressions: number;
  unmonetizedPct: number;
  p95AuctionMs: number;
  cpmUsd: number | null;
}

const DIAGNOSIS_COLUMNS = [
  'channel_id',
  'ssp_id',
  'device_class',
  'codec',
  'daypart',
  'cues',
  'total_attempts',
  'unmonetized_impressions',
  'unmonetized_pct',
  'p95_auction_ms',
  'cpm_usd',
] as const;

/**
 * Resolves the filesystem path to the canonical loss_attribution.sql query.
 */
export function getCanonicalQueryPath(): string {
  const candidates: string[] = [];

  // Try relative to current working directory
  candidates.push(path.resolve(process.cwd(), 'sql/queries/loss_attribution.sql'));
  candidates.push(path.resolve(process.cwd(), '../sql/queries/loss_attribution.sql'));

  // Try relative to this module
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(path.resolve(currentDir, '../../sql/queries/loss_attribution.sql'));
    candidates.push(path.resolve(currentDir, '../../../sql/queries/loss_attribution.sql'));
    candidates.push(path.resolve(currentDir, '../../../../sql/queries/loss_attribution.sql'));
  } catch {
    // Ignore fileURLToPath errors in non-standard runtimes
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Canonical loss attribution query file not found. Checked candidates:\n${candidates.join('\n')}`,
  );
}

/**
 * Formats an ISO-8601 UTC string (e.g. 2026-08-14T19:00:00.000Z)
 * into a ClickHouse DateTime64 literal: toDateTime64('YYYY-MM-DD HH:MM:SS.NNN', 3, 'UTC').
 */
export function formatClickHouseDateTime64(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid ISO UTC timestamp: "${isoUtc}"`);
  }
  const iso = d.toISOString();
  // Transform 2026-08-14T19:00:00.000Z -> 2026-08-14 19:00:00.000
  const chFormatted = iso.replace('T', ' ').replace('Z', '');
  return `toDateTime64('${chFormatted}', 3, 'UTC')`;
}

/**
 * Safely renders the canonical loss_attribution.sql query with the investigation's normalized context.
 * Enforces strict single placeholder substitution and zero residual placeholders.
 */
export function renderLossAttributionQuery(
  context: InvestigationContext,
  templateSql?: string,
): string {
  const sql = templateSql ?? fs.readFileSync(getCanonicalQueryPath(), 'utf-8');

  const channelPlaceholder = '{channel:String}';
  const fromPlaceholder = '{from:DateTime64(3)}';
  const toPlaceholder = '{to:DateTime64(3)}';

  const countOccurrences = (str: string, sub: string) => str.split(sub).length - 1;

  if (countOccurrences(sql, channelPlaceholder) !== 1) {
    throw new Error(
      `Template must contain exactly one occurrence of ${channelPlaceholder}, found ${countOccurrences(sql, channelPlaceholder)}`,
    );
  }
  if (countOccurrences(sql, fromPlaceholder) !== 1) {
    throw new Error(
      `Template must contain exactly one occurrence of ${fromPlaceholder}, found ${countOccurrences(sql, fromPlaceholder)}`,
    );
  }
  if (countOccurrences(sql, toPlaceholder) !== 1) {
    throw new Error(
      `Template must contain exactly one occurrence of ${toPlaceholder}, found ${countOccurrences(sql, toPlaceholder)}`,
    );
  }

  // Validate channel matches safe identifier pattern
  const cleanChannel = context.channel.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(cleanChannel)) {
    throw new Error(`Invalid channel identifier "${cleanChannel}"`);
  }

  const fromLiteral = formatClickHouseDateTime64(context.from);
  const toLiteral = formatClickHouseDateTime64(context.to);
  const channelLiteral = `'${cleanChannel}'`;

  const rendered = sql
    .replace(channelPlaceholder, channelLiteral)
    .replace(fromPlaceholder, fromLiteral)
    .replace(toPlaceholder, toLiteral);

  // Assert no remaining template placeholders
  const remainingMatch = rendered.match(/\{[a-zA-Z0-9_]+:[a-zA-Z0-9_()]+\}/);
  if (remainingMatch) {
    throw new Error(`Rendered query contains unresolved placeholder: ${remainingMatch[0]}`);
  }

  return rendered.trim().replace(/;+$/, '');
}

/**
 * Decodes raw MCP query response into typed DiagnosisRow items.
 */
export function decodeDiagnosisRows(raw: unknown, expectedChannel?: string): DiagnosisRow[] {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Canonical evidence response must be a JSON object.');
  }

  const wrapper = raw as Record<string, unknown>;
  const queryResult =
    wrapper.result && typeof wrapper.result === 'object' && !Array.isArray(wrapper.result)
      ? (wrapper.result as Record<string, unknown>)
      : wrapper;

  if (!Array.isArray(queryResult.columns) || !Array.isArray(queryResult.rows)) {
    throw new Error('Canonical evidence response must contain columns and rows arrays.');
  }

  if (queryResult.rows.length === 0 && queryResult.columns.length === 0) {
    return [];
  }

  const colMap = new Map<string, number>();
  queryResult.columns.forEach((col, idx) => {
    const name = String(col).toLowerCase().trim();
    if (colMap.has(name)) {
      throw new Error(`Canonical evidence response contains duplicate column: ${name}.`);
    }
    colMap.set(name, idx);
  });

  const missingColumns = DIAGNOSIS_COLUMNS.filter((column) => !colMap.has(column));
  if (missingColumns.length > 0) {
    throw new Error(
      `Canonical evidence response is missing columns: ${missingColumns.join(', ')}.`,
    );
  }

  const indexOf = (column: (typeof DIAGNOSIS_COLUMNS)[number]): number => colMap.get(column)!;
  const channelIdx = indexOf('channel_id');
  const sspIdx = indexOf('ssp_id');
  const deviceIdx = indexOf('device_class');
  const codecIdx = indexOf('codec');
  const daypartIdx = indexOf('daypart');
  const cuesIdx = indexOf('cues');
  const attemptsIdx = indexOf('total_attempts');
  const unmonetizedIdx = indexOf('unmonetized_impressions');
  const unmonetizedPctIdx = indexOf('unmonetized_pct');
  const latencyIdx = indexOf('p95_auction_ms');
  const cpmIdx = indexOf('cpm_usd');

  const requiredText = (value: unknown, column: string, rowNumber: number): string => {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Canonical evidence row ${rowNumber} has invalid ${column}.`);
    }
    return value;
  };

  const requiredNumber = (
    value: unknown,
    column: string,
    rowNumber: number,
    options: { integer?: boolean; min?: number; max?: number } = {},
  ): number => {
    if (value === null || value === '' || typeof value === 'boolean') {
      throw new Error(`Canonical evidence row ${rowNumber} has invalid ${column}.`);
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (
      !Number.isFinite(parsed) ||
      (options.integer === true && !Number.isInteger(parsed)) ||
      (options.min !== undefined && parsed < options.min) ||
      (options.max !== undefined && parsed > options.max)
    ) {
      throw new Error(`Canonical evidence row ${rowNumber} has invalid ${column}.`);
    }
    return parsed;
  };

  const rows: DiagnosisRow[] = [];

  for (const [rowIndex, rawRow] of queryResult.rows.entries()) {
    const rowNumber = rowIndex + 1;
    if (!Array.isArray(rawRow) || rawRow.length < queryResult.columns.length) {
      throw new Error(`Canonical evidence row ${rowNumber} does not match the declared columns.`);
    }

    const channelId = requiredText(rawRow[channelIdx], 'channel_id', rowNumber);
    const sspId = requiredText(rawRow[sspIdx], 'ssp_id', rowNumber);
    const deviceClass = requiredText(rawRow[deviceIdx], 'device_class', rowNumber);
    const codec = requiredText(rawRow[codecIdx], 'codec', rowNumber);
    const daypart = requiredText(rawRow[daypartIdx], 'daypart', rowNumber);
    if (expectedChannel && channelId !== expectedChannel) {
      throw new Error(
        `Canonical evidence row ${rowNumber} belongs to ${channelId}, not ${expectedChannel}.`,
      );
    }

    const cues = requiredNumber(rawRow[cuesIdx], 'cues', rowNumber, { integer: true, min: 0 });
    const totalAttempts = requiredNumber(rawRow[attemptsIdx], 'total_attempts', rowNumber, {
      integer: true,
      min: 0,
    });
    const unmonetizedImpressions = requiredNumber(
      rawRow[unmonetizedIdx],
      'unmonetized_impressions',
      rowNumber,
      { integer: true, min: 0 },
    );
    const unmonetizedPct = requiredNumber(rawRow[unmonetizedPctIdx], 'unmonetized_pct', rowNumber, {
      min: 0,
      max: 100,
    });
    const p95AuctionMs = requiredNumber(rawRow[latencyIdx], 'p95_auction_ms', rowNumber, {
      min: 0,
    });
    if (totalAttempts === 0 || cues > totalAttempts) {
      throw new Error(
        `Canonical evidence row ${rowNumber} has inconsistent cue and attempt counts.`,
      );
    }
    if (unmonetizedImpressions > totalAttempts) {
      throw new Error(
        `Canonical evidence row ${rowNumber} has more unmonetized impressions than attempts.`,
      );
    }
    const expectedPct = (unmonetizedImpressions / totalAttempts) * 100;
    if (Math.abs(expectedPct - unmonetizedPct) > 0.01) {
      throw new Error(`Canonical evidence row ${rowNumber} has an inconsistent unmonetized_pct.`);
    }

    let cpmUsd: number | null = null;
    if (rawRow[cpmIdx] !== null) {
      cpmUsd = requiredNumber(rawRow[cpmIdx], 'cpm_usd', rowNumber, { min: Number.EPSILON });
    }

    rows.push({
      channelId,
      sspId,
      deviceClass,
      codec,
      daypart,
      cues,
      totalAttempts,
      unmonetizedImpressions,
      unmonetizedPct,
      p95AuctionMs,
      cpmUsd,
    });
  }

  return rows;
}
