# GhostSlate SQL

This directory holds the canonical ClickHouse schema DDL, seed scripts, assertion checks, benchmarked analytical queries, and performance reports. Per `AGENTS.md`, the schema and canonical business metrics live here, not in application code.

## Layout

- `schema/` — Table definitions, partitioning, and index structures (`001_initial_tables.sql`).
- `seed/` — Deterministic in-database synthetic data generation (`002-advertiser-inventory.sql`, `003-baseline-telemetry.sql`).
- `checks/` — Automated data integrity and statistical assertions (`baseline-assertions.sql`).
- `queries/` — Parameterized queries benchmarked for agent consumption (`slate_bleed_correlation.sql`).
- `benchmarks/` — Recorded query execution timings, scans, and storage metrics (`003-baseline.md`).

## Canonical Constants

Per `AGENTS.md`, all derived values and system thresholds have a single definition across the repository:

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

| Daypart         | UTC Range             | CPM (USD) | Target Fill % |
| --------------- | --------------------- | --------- | ------------- |
| `early_morning` | `02:00:00 – 09:59:59` | $6.40     | 80.0%         |
| `daytime`       | `10:00:00 – 17:59:59` | $18.75    | 92.0%         |
| `primetime`     | `18:00:00 – 22:59:59` | $32.50    | 95.0%         |
| `late_night`    | `23:00:00 – 01:59:59` | $9.25     | 85.0%         |
