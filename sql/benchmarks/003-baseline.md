# Baseline Telemetry Performance Benchmarks

> Historical benchmark. These figures describe the measured database workload below, not a current
> hosted service or the total duration of a Gemini investigation. See the
> [current architecture](../../README.md#how-it-works) for runtime metric limitations.

Measured against the canonical 101.4M-row dataset running on ClickHouse Server 24.8.
All timings, rows scanned, and byte metrics are extracted directly from `system.query_log` and `system.parts`.

---

## 1. Table Row Count (`SELECT count()`)

```sql
SELECT count() FROM ghostslate.ssai_stitch_attempts;
```

| Metric         | Measured Value              |
| -------------- | --------------------------- |
| Total Rows     | 101,400,000                 |
| Query Duration | **1 ms** (0.001s wall time) |
| Rows Read      | 1                           |
| Bytes Read     | 16 B                        |
| Memory Usage   | 40.8 KiB                    |

---

## 2. Full-Table Aggregation (Exit Criterion)

Aggregating attempts, average latency, and slate fallback rates across all 101.4M rows.

```sql
SELECT
    ssp_id,
    count() AS attempts,
    round(avg(ad_response_latency_ms), 2) AS avg_latency_ms,
    countIf(stitch_status = 'SLATE_FALLBACK') AS slate_fallbacks,
    round(countIf(stitch_status = 'SLATE_FALLBACK') * 100.0 / count(), 3) AS slate_fallback_pct
FROM ghostslate.ssai_stitch_attempts
GROUP BY ssp_id
ORDER BY attempts DESC;
```

### Result

| ssp_id      | attempts   | avg_latency_ms | slate_fallbacks | slate_fallback_pct |
| ----------- | ---------- | -------------- | --------------- | ------------------ |
| `ssp-alpha` | 34,480,490 | 137.89 ms      | 586,138         | 1.700%             |
| `ssp-beta`  | 26,358,447 | 165.64 ms      | 596,645         | 2.264%             |
| `ssp-gamma` | 22,309,964 | 150.17 ms      | 423,243         | 1.897%             |
| `ssp-delta` | 18,251,099 | 172.74 ms      | 414,289         | 2.270%             |

| Metric         | Measured Value                          |
| -------------- | --------------------------------------- |
| Query Duration | **116 ms** (0.117s wall time)           |
| Rows Read      | 101,400,000                             |
| Bytes Read     | 580.22 MiB (608,400,000 bytes)          |
| Peak Memory    | 2.79 MiB                                |
| Target SLA     | < 1,000 ms (achieved: **~8.6x faster**) |

---

## 3. Single-Day Cohort Breakdown (Partition Pruned)

Querying 24 hours of traffic across SSP × Device Class × Codec.

```sql
SELECT
    ssp_id,
    device_class,
    codec,
    count() AS attempts,
    round(avg(ad_response_latency_ms), 2) AS avg_latency_ms,
    round(countIf(stitch_status = 'SLATE_FALLBACK') * 100.0 / count(), 3) AS slate_fallback_pct
FROM ghostslate.ssai_stitch_attempts
WHERE attempt_time >= '2026-08-01 00:00:00' AND attempt_time < '2026-08-02 00:00:00'
GROUP BY ssp_id, device_class, codec
ORDER BY ssp_id, device_class, codec;
```

| Metric         | Measured Value                    |
| -------------- | --------------------------------- |
| Query Duration | **32 ms** (0.033s wall time)      |
| Rows Read      | 3,380,000 (1 partition out of 30) |
| Bytes Read     | 51.57 MiB (54,080,000 bytes)      |
| Pruning Ratio  | 30:1 (scanned exactly 1 day)      |

---

## 4. Latency p95 by SSP (`quantileTDigest(0.95)`)

```sql
SELECT
    ssp_id,
    round(quantileTDigest(0.95)(ad_response_latency_ms), 2) AS p95_latency_ms
FROM ghostslate.ssai_stitch_attempts
GROUP BY ssp_id
ORDER BY ssp_id;
```

### Result

| ssp_id      | p95_latency_ms | Headroom to 450 ms Deadline |
| ----------- | -------------- | --------------------------- |
| `ssp-alpha` | 291.83 ms      | 158.17 ms                   |
| `ssp-beta`  | 344.60 ms      | 105.40 ms                   |
| `ssp-delta` | 346.21 ms      | 103.79 ms                   |
| `ssp-gamma` | 312.74 ms      | 137.26 ms                   |

| Metric         | Measured Value                 |
| -------------- | ------------------------------ |
| Query Duration | **264 ms** (0.265s wall time)  |
| Rows Read      | 101,400,000                    |
| Bytes Read     | 483.51 MiB (507,000,000 bytes) |

---

## 5. Storage Footprint & Compression

Extracted from `system.parts` where `active`:

| Table                             | Active Parts | Rows        | Compressed Size | Uncompressed Size | Compression Ratio |
| --------------------------------- | ------------ | ----------- | --------------- | ----------------- | ----------------- |
| `ghostslate.ssai_stitch_attempts` | 133          | 101,400,000 | 557.76 MiB      | 2.46 GiB          | **4.51x**         |
| `ghostslate.scte35_cue_events`    | 1            | 14,400      | 141.78 KiB      | 351.64 KiB        | **2.48x**         |
| `ghostslate.advertiser_inventory` | 1            | 4           | 242.00 B        | 155.00 B          | **0.64x**         |
| `ghostslate.slate_observations`   | 0            | 0           | 0.00 B          | 0.00 B            | N/A               |

---

## 6. Baseline Realism

The baseline synthetic telemetry incorporates a deterministic ±5% per-day traffic jitter across each hour of the day (keyed by day index and hour via salt `21`). This ensures that no two days in the 30-day window have identical hourly traffic profiles, eliminating artificial repeat patterns while preserving the exact daily total of **3,380,000 rows** and the overall table count of **101,400,000 rows**.

---

## ASOF Join Direction Finding

Baseline verification found that placing `scte35_cue_events` on the left of the `ASOF JOIN` and
matching `s.attempt_time >= c.cue_time` produced the wrong analytical grain.

Because `ASOF JOIN` returns exactly one match per left row and `>=` matches the earliest attempt after the cue, this selects the fastest auction among thousands of concurrent sessions for that cue. The fastest auction is almost always `FILLED`, suppressing any slate bleed signal and incorrectly counting cues rather than viewer sessions.

The production query corrects the direction by placing stitch attempts on the left and matching the
preceding cue event (`attempt_time >= cue_time`), then aggregating across sessions and breaks. The
corrected query and measured results are documented in `005-query-correctness.md`.

---

## Why These Timings Matter

These measured execution timings and scanned row counts provide direct runtime evidence of GhostSlate's high-performance columnar telemetry foundation:

1. **Database evidence:** Direct benchmarks record server duration, rows scanned, and bytes read.
   Live MCP traces instead show tool-call wall time and returned rows; scan counts appear only if
   MCP supplies them. The pinned MCP capture does not include those scan statistics.
2. **Subsecond SQL, not a subsecond agent:** The measured queries complete below one second.
   A multi-turn investigation includes model inference, MCP transport, and vision; these benchmarks
   do not measure its total duration.
3. **Partition pruning:** The single-day query above measured 32 ms across one daily partition.
   This is historical workload evidence, not a latency guarantee for every environment or query.
