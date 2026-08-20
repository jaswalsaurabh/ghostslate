import { describe, expect, it } from 'vitest';
import {
  decodeDiagnosisRows,
  renderLossAttributionQuery,
  formatClickHouseDateTime64,
} from '../src/services/evidence.helper.js';

const columns = [
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
];

const validRow: unknown[] = [
  'ch-01',
  'ssp-beta',
  'connected_tv',
  'hevc',
  'primetime',
  80,
  60862,
  59482,
  97.73,
  1812,
  32.5,
];

describe('decodeDiagnosisRows', () => {
  it('distinguishes a valid empty result from an invalid canonical schema', () => {
    expect(decodeDiagnosisRows({ columns, rows: [] }, 'ch-01')).toEqual([]);
    expect(() =>
      decodeDiagnosisRows(
        { columns: columns.filter((column) => column !== 'p95_auction_ms'), rows: [] },
        'ch-01',
      ),
    ).toThrow('missing columns: p95_auction_ms');
    expect(() =>
      decodeDiagnosisRows(
        {
          columns: columns.map((column) =>
            column === 'p95_auction_ms' ? 'avg_latency_ms' : column,
          ),
          rows: [],
        },
        'ch-01',
      ),
    ).toThrow('missing columns: p95_auction_ms');
  });

  it('rejects invalid values and internally inconsistent metrics', () => {
    const invalidPct = [...validRow];
    invalidPct[columns.indexOf('unmonetized_pct')] = Number.NaN;
    expect(() => decodeDiagnosisRows({ columns, rows: [invalidPct] }, 'ch-01')).toThrow(
      'row 1 has invalid unmonetized_pct',
    );

    const impossibleCount = [...validRow];
    impossibleCount[columns.indexOf('unmonetized_impressions')] = 70000;
    expect(() => decodeDiagnosisRows({ columns, rows: [impossibleCount] }, 'ch-01')).toThrow(
      'more unmonetized impressions than attempts',
    );
  });
});

describe('renderLossAttributionQuery', () => {
  const context = {
    channel: 'ch-01',
    from: '2026-08-14T19:00:00.000Z',
    to: '2026-08-14T23:00:00.000Z',
  };

  it('renders parameterized SQL and safely removes trailing semicolons for MCP execution', () => {
    const templateWithSemicolons = `
      SELECT * FROM ghostslate.ssai_stitch_attempts
      WHERE channel_id = {channel:String}
        AND attempt_time >= {from:DateTime64(3)}
        AND attempt_time < {to:DateTime64(3)};;;
    `;

    const rendered = renderLossAttributionQuery(context, templateWithSemicolons);
    expect(rendered.endsWith(';')).toBe(false);
    expect(rendered).toContain("'ch-01'");
    expect(rendered).toContain("toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')");
    expect(rendered).toContain("toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')");
    expect(rendered).not.toMatch(/\{[a-zA-Z0-9_]+:[a-zA-Z0-9_()]+\}/);
  });

  it('renders the canonical query file without errors and without trailing semicolon', () => {
    const rendered = renderLossAttributionQuery(context);
    expect(rendered.endsWith(';')).toBe(false);
    expect(rendered).toContain("'ch-01'");
    expect(rendered).toContain('ORDER BY unmonetized_impressions DESC');
  });

  it('formats ClickHouse DateTime64 literals in UTC', () => {
    expect(formatClickHouseDateTime64('2026-08-14T19:00:00.000Z')).toBe(
      "toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')",
    );
  });
});
