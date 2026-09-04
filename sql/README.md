# GhostSlate SQL

This directory defines the synthetic ad-delivery data and the queries used to investigate it.
The schema and telemetry aggregation live here; `MetricsService` owns financial arithmetic and
incident selection. For SSAI, SCTE-35, and other domain terms, see the [main glossary](../README.md#the-technical-terms-in-plain-language).

## Layout

- `schema/` — Table definitions, partitioning, and index structures (`001_initial_tables.sql`).
- `seed/` — Deterministic in-database synthetic data generation (`002-advertiser-inventory.sql`, `003-baseline-telemetry.sql`).
- `checks/` — Automated data integrity and statistical assertions (`baseline-assertions.sql`).
- `queries/` — Parameterized queries benchmarked for agent consumption (`slate_bleed_correlation.sql`).
- `benchmarks/` — Recorded query execution timings, scans, and storage metrics (`003-baseline.md`).

## Canonical Constants

The table below documents the dataset contract. Seed definitions live in `seed/`; runtime decision
thresholds live in [`incident.constants.ts`](../server/src/services/incident.constants.ts).
This table is a reference, not a second runtime configuration source.

| Constant                 | Value                         | Description / Unit                                     |
| ------------------------ | ----------------------------- | ------------------------------------------------------ |
| **Channel ID**           | `ch-01`                       | Primary FAST / live stream identifier                  |
| **Window Start**         | `2026-07-19 00:00:00.000 UTC` | Baseline start timestamp (`1784419200000` epoch ms)    |
| **Window End**           | `2026-08-18 00:00:00.000 UTC` | Baseline end timestamp (`1787011200000` epoch ms)      |
| **Cue Cadence**          | 180 seconds                   | 20 cues/hour, 480 cues/day, 14,400 total cues          |
| **Stitch Attempts**      | 101,400,000                   | 3,380,000 attempts/day over 30 days                    |
| **Stitcher Deadline**    | **450 ms**                    | Latency above which the stitcher falls back to slate   |
| **Hard Auction Timeout** | **1200 ms**                   | Latency above which the SSP never responded            |
| **VAST Error Rate**      | **0.0015** (0.15%)            | Latency-independent parser / ad tag error rate         |
| **Percentage Invariant** | `0.0 – 100.0`                 | All rate/percentage columns stored as 0–100, never 0–1 |

### Daypart UTC Boundaries

| Daypart         | UTC Range                             | CPM (USD) | Target Fill % |
| --------------- | ------------------------------------- | --------- | ------------- |
| `early_morning` | `[06:00, 09:00)`                      | $6.40     | 80.0%         |
| `daytime`       | `[09:00, 19:00)`                      | $18.75    | 92.0%         |
| `primetime`     | `[19:00, 23:00)`                      | $32.50    | 95.0%         |
| `late_night`    | `[23:00, 24:00)` and `[00:00, 06:00)` | $9.25     | 85.0%         |

Ranges include their start and exclude their end. These boundaries match
[`loss_attribution.sql`](queries/loss_attribution.sql); prices are synthetic values from
[`002-advertiser-inventory.sql`](seed/002-advertiser-inventory.sql). Fill targets are stored data,
not an extra multiplier in the current loss calculation.

## Reading the results correctly

The ASOF join preserves each viewer's stitch attempt on the left and matches its preceding cue.
`cues` counts distinct breaks; the failure percentage uses attempts as its denominator and counts
`SLATE_FALLBACK` plus `TIMEOUT`, not hard `ERROR` outcomes. The final incident decision applies
server-owned guards beyond the exploratory SQL filter.

`slate_observations` exists in the schema but remains unpopulated by the current application.
Vision evidence is returned separately and cached in memory. Benchmark reports are historical
measurements: direct query-log scan counts and database timings are not live MCP metrics.
