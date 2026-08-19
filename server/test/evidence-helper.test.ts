import { describe, expect, it } from 'vitest';
import { decodeDiagnosisRows } from '../src/services/evidence.helper.js';

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
