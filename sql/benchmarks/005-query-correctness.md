# Query Correctness Performance Benchmarks

Measured against the canonical 101.4M-row dataset running on ClickHouse Server 24.8.
All direct benchmark timings, rows scanned, and byte metrics are extracted from ClickHouse `system.query_log` and `system.parts`. Live end-to-end latencies are measured via the official `mcp-clickhouse` 0.4.1 server.

---

## 1. SSAI Unmonetized Correlation Query (`slate_bleed_correlation.sql`)

Calculates cohort-level unmonetized viewer stitch attempts (`SLATE_FALLBACK` + `TIMEOUT`), distinct cue counts, and p95 auction latencies across ad break boundaries, grouped at `channel_id x ssp_id x device_class x codec` grain.

### A. Primary Incident Window (4 Hours: 2026-08-14 19:00:00 to 23:00:00 UTC)

```sql
WITH matched AS (
    SELECT
        s.channel_id             AS channel_id,
        s.splice_event_id        AS splice_event_id,
        s.ssp_id                 AS ssp_id,
        s.device_class           AS device_class,
        s.codec                  AS codec,
        s.stitch_status          AS stitch_status,
        s.ad_response_latency_ms AS latency_ms
    FROM ssai_stitch_attempts AS s
    ASOF LEFT JOIN scte35_cue_events AS c
      ON s.channel_id = c.channel_id
     AND s.splice_event_id = c.splice_event_id
     AND s.attempt_time >= c.cue_time
    WHERE s.attempt_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC') AND s.attempt_time < toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
)
SELECT
    channel_id,
    ssp_id,
    device_class,
    codec,
    count(DISTINCT splice_event_id)                                                       AS cues,
    count()                                                                               AS attempts,
    countIf(stitch_status IN ('SLATE_FALLBACK', 'TIMEOUT'))                               AS unmonetized,
    round(100.0 * countIf(stitch_status IN ('SLATE_FALLBACK', 'TIMEOUT')) / count(), 2)  AS unmonetized_pct,
    quantileTDigest(0.95)(latency_ms)                                                     AS p95_auction_ms
FROM matched
GROUP BY channel_id, ssp_id, device_class, codec
HAVING cues >= 20 AND unmonetized_pct > 5
ORDER BY unmonetized_pct DESC;
```

#### Measured Result

| channel_id | ssp_id     | device_class   | codec  | cues | attempts | unmonetized | unmonetized_pct | p95_auction_ms |
| ---------- | ---------- | -------------- | ------ | ---- | -------- | ----------- | --------------- | -------------- |
| `ch-01`    | `ssp-beta` | `connected_tv` | `hevc` | 80   | 60,862   | 59,482      | **97.73%**      | 1812.54 ms     |

| Metric         | Measured Value                         | Provenance                                       |
| -------------- | -------------------------------------- | ------------------------------------------------ |
| Query Duration | **44 ms** (0.044s wall time)           | Direct ClickHouse benchmark (`system.query_log`) |
| Rows Read      | 954,321                                | Direct ClickHouse benchmark (`system.query_log`) |
| Bytes Read     | 22.64 MiB (23,742,825 bytes)           | Direct ClickHouse benchmark (`system.query_log`) |
| Peak Memory    | 46.90 MiB (49,177,039 bytes)           | Direct ClickHouse benchmark (`system.query_log`) |
| Target SLA     | < 1,000 ms (achieved: **~22x faster**) | Evaluated against 1,000 ms interactive budget    |

---

### B. Full Single-Day Window (24 Hours: 2026-08-14 00:00:00 to 2026-08-15 00:00:00 UTC)

| Metric         | Measured Value                         | Provenance                                       |
| -------------- | -------------------------------------- | ------------------------------------------------ |
| Query Duration | **59 ms** (0.059s wall time)           | Direct ClickHouse benchmark (`system.query_log`) |
| Rows Read      | 3,394,400 (1 daily partition)          | Direct ClickHouse benchmark (`system.query_log`) |
| Bytes Read     | 80.82 MiB (84,744,800 bytes)           | Direct ClickHouse benchmark (`system.query_log`) |
| Peak Memory    | 98.35 MiB (103,131,333 bytes)          | Direct ClickHouse benchmark (`system.query_log`) |
| Target SLA     | < 1,000 ms (achieved: **~16x faster**) | Evaluated against 1,000 ms interactive budget    |

---

## 2. Grounded Loss Attribution Query (`loss_attribution.sql`)

Joins unmonetized viewer stitch attempts (`SLATE_FALLBACK` + `TIMEOUT`) to `ghostslate.advertiser_inventory` to provide queried rate cards (`cpm_usd`), p95 auction latency (`p95_auction_ms`), and impression counts to `MetricsService`. Guarded by `HAVING cues >= 20` to suppress small-sample noise.

### A. Primary Incident Window (4 Hours: 2026-08-14 19:00:00 to 23:00:00 UTC)

```sql
WITH matched AS (
    SELECT
        s.channel_id             AS channel_id,
        s.splice_event_id        AS splice_event_id,
        s.ssp_id                 AS ssp_id,
        s.device_class           AS device_class,
        s.codec                  AS codec,
        s.stitch_status          AS stitch_status,
        s.ad_response_latency_ms AS latency_ms,
        multiIf(
            toHour(s.attempt_time) >= 19 AND toHour(s.attempt_time) < 23, 'primetime',
            toHour(s.attempt_time) >= 23 OR toHour(s.attempt_time) < 6, 'late_night',
            toHour(s.attempt_time) >= 6 AND toHour(s.attempt_time) < 9, 'early_morning',
            'daytime'
        ) AS daypart
    FROM ssai_stitch_attempts AS s
    ASOF LEFT JOIN scte35_cue_events AS c
      ON s.channel_id = c.channel_id
     AND s.splice_event_id = c.splice_event_id
     AND s.attempt_time >= c.cue_time
    WHERE s.attempt_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC') AND s.attempt_time < toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
      AND s.channel_id = 'ch-01'
)
SELECT
    m.channel_id                                                                          AS channel_id,
    m.ssp_id                                                                              AS ssp_id,
    m.device_class                                                                        AS device_class,
    m.codec                                                                               AS codec,
    m.daypart                                                                             AS daypart,
    count(DISTINCT m.splice_event_id)                                                     AS cues,
    count()                                                                               AS total_attempts,
    countIf(m.stitch_status IN ('SLATE_FALLBACK', 'TIMEOUT'))                             AS unmonetized_impressions,
    round(100.0 * countIf(m.stitch_status IN ('SLATE_FALLBACK', 'TIMEOUT')) / count(), 2) AS unmonetized_pct,
    quantileTDigest(0.95)(m.latency_ms)                                                   AS p95_auction_ms,
    nullIf(any(inv.cpm_usd), 0)                                                           AS cpm_usd
FROM matched AS m
LEFT JOIN advertiser_inventory AS inv
  ON m.channel_id = inv.channel_id AND m.daypart = inv.daypart
GROUP BY m.channel_id, m.ssp_id, m.device_class, m.codec, m.daypart
HAVING cues >= 20
ORDER BY unmonetized_impressions DESC;
```

#### Measured Result via MCP Protocol (`mcp-clickhouse` 0.4.1)

| channel_id | ssp_id     | device_class   | codec  | daypart     | cues | total_attempts | unmonetized_impressions | unmonetized_pct | p95_auction_ms | cpm_usd | Grounded Loss (via MetricsService) |
| ---------- | ---------- | -------------- | ------ | ----------- | ---- | -------------- | ----------------------- | --------------- | -------------- | ------- | ---------------------------------- |
| `ch-01`    | `ssp-beta` | `connected_tv` | `hevc` | `primetime` | 80   | 60,862         | 59,482                  | **97.73%**      | 1812.57 ms     | $32.50  | **$1,933.17**                      |

_(Loss derivation: 59,482 unmonetized impressions × $32.50 CPM / 1000 = $1,933.165 → rounded to cents = **$1,933.17**)_

#### Performance and Provenance Breakdown

| Measurement                | Value                        | Provenance                                                                 |
| -------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| Rows returned              | 44 cohorts                   | Live `mcp-clickhouse` 0.4.1 response payload                               |
| MCP wall time              | **86 ms** (0.086s)           | Application SSE duration around `callTool('run_query', ...)`               |
| Direct ClickHouse duration | **44 ms**                    | Direct ClickHouse execution benchmark (`system.query_log`)                 |
| Rows read                  | 954,325                      | Direct ClickHouse benchmark (`system.query_log`); unavailable in MCP 0.4.1 |
| Bytes read                 | 19.00 MiB (19,925,484 bytes) | Direct ClickHouse benchmark (`system.query_log`); unavailable in MCP 0.4.1 |
| Target SLA                 | < 1,000 ms                   | Achieved: **~11x faster** than interactive budget                          |

> **Note on Rows-Read Provenance:** The official `mcp-clickhouse` 0.4.1 server returns `columns` and `rows` data over SSE without embedding execution metrics (such as `rows_read` or memory bytes). The application faithfully omits the scanned row badge for live MCP calls, whereas the 954,325 figure is derived from direct ClickHouse query log benchmarking.

---

### B. Negative Control Window (4 Hours: 2026-08-09 19:00:00 to 23:00:00 UTC)

| Metric                    | Measured Value                                                        | Provenance                                               |
| ------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| MCP Query Wall Time       | **97 ms** (0.097s end-to-end)                                         | Application SSE duration around `callTool`               |
| Rows Returned             | 44 cohorts                                                            | Live `mcp-clickhouse` 0.4.1 response                     |
| Max Cohort Unmonetized    | **4.60%** (`ssp-beta` × `mobile` × `av1`, 150 unmonetized / 3259 att) | Live `mcp-clickhouse` cohort evaluation                  |
| Breaching Cohorts (>=20%) | **0 cohorts**                                                         | `selectIncidentCohort` deterministic peer evaluation     |
| Selected Incident Cohort  | `null` (nominal baseline traffic)                                     | Evaluated by `selectIncidentCohort`                      |
| Grounded Loss Published   | No financial loss asserted (no dollar amount published)               | Server-rendered deterministic negative control diagnosis |

---

### C. ClickHouse EXPLAIN Query Plan (via MCP `run_query`)

The following query plan was retrieved through MCP `callTool('run_query', { query: 'EXPLAIN PLAN ...' })`:

```
Expression ((Project names + (Before ORDER BY + Projection) [lifted up part]))
  Sorting (Sorting for ORDER BY)
    Expression ((Before ORDER BY + Projection))
      Filter (HAVING)
        Aggregating
          Expression ((Before GROUP BY + DROP unused columns after JOIN))
            Join (JOIN FillRightFirst)
              Expression ((JOIN actions + (Change column names to column identifiers + (Project names + (Projection + )))))
                Join (JOIN FillRightFirst)
                  Expression
                    ReadFromMergeTree (ghostslate.ssai_stitch_attempts)
                  Expression ((JOIN actions + Change column names to column identifiers))
                    ReadFromMergeTree (ghostslate.scte35_cue_events)
              Expression ((JOIN actions + Change column names to column identifiers))
                ReadFromMergeTree (ghostslate.advertiser_inventory)
```

### D. Black-Screen Timeout Variant (2 Hours: 2026-08-16 10:00:00 to 12:00:00 UTC)

The same canonical loss-attribution query was measured after applying all five deterministic
mutations once. The injector skipped every mutation on its second run.

| channel_id | ssp_id      | device_class | codec  | daypart   | cues | total_attempts | unmonetized_impressions | unmonetized_pct | p95_auction_ms | cpm_usd | Grounded Loss |
| ---------- | ----------- | ------------ | ------ | --------- | ---- | -------------- | ----------------------- | --------------- | -------------- | ------- | ------------- |
| `ch-01`    | `ssp-delta` | `mobile`     | `h264` | `daytime` | 40   | 7,812          | 7,732                   | **98.98%**      | 1898.50 ms     | $18.75  | **$144.98**   |

| Metric         | Measured Value |
| -------------- | -------------- |
| Query Duration | **50.32 ms**   |
| Rows Read      | 284,740        |
| Bytes Read     | 7,003,224      |

Healthy sibling cohorts remained below the qualifying threshold, and the target cohort was healthy
outside the incident window. The exact selected row and measured peers are preserved in
`eval/evidence/canonical-black-screen-timeout-2026-08-16.json`.

---

## 3. Engineering Decisions & Minimalism Justification

1. **`AggregatingMergeTree` Rollup Omission**:
   - Per `AGENTS.md` §SQL ("Do not add ClickHouse features to look impressive") and §Infrastructure minimalism, an engine addition is only justified if an actual latency bottleneck exists.
   - Measured `quantileTDigest(0.95)` on the agent's path finishes in **44 ms** on 4-hour incident windows and **59 ms** on 24-hour spans, well beneath the 1,000 ms SLA.
   - Therefore, introducing schema complexity via `AggregatingMergeTree` remains deliberately omitted.

2. **4D Incident Dimension Isolation (`ssp_id x device_class x codec`)**:
   - Including `codec` in the grouping isolates the exact degradation cohort (`ssp-beta x connected_tv x hevc`) at **97.73%** unmonetized rate across 80 cues, matching `ghostslate_eval.injected_incidents` ground truth.

3. **Single Ownership of Derived Values**:
   - `loss_attribution.sql` is strictly responsible for telemetry aggregation and joins to rate cards, returning `unmonetized_impressions` and `cpm_usd`.
   - `MetricsService` alone computes `computeLoss(impressions, cpm)`, eliminating multi-owner figure discrepancies.
