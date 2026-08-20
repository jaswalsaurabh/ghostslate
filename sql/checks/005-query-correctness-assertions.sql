-- GhostSlate Query Correctness Assertions
-- Validates ASOF join 1-to-1 cardinality (no duplicate cue timestamps),
-- denominator-of-one trap prevention vs production aggregation grain,
-- small-sample guard effectiveness, primary incident isolation at 4D grain (including codec),
-- and silence across latency confounder, error confounder, and negative control windows.
-- Every query must return ok = 1.

-- Assertion 1: ASOF joins each stitch attempt to exactly one SCTE-35 cue boundary (no timestamp fan-out)
SELECT (
    max(distinct_cue_times) = 1
    AND min(distinct_cue_times) = 1
) AS ok -- assertion_1_asof_no_cue_timestamp_fan_out
FROM (
    SELECT
        s.channel_id, s.splice_event_id,
        count(DISTINCT c.cue_time) AS distinct_cue_times
    FROM ghostslate.ssai_stitch_attempts AS s
    ASOF LEFT JOIN ghostslate.scte35_cue_events AS c
      ON s.channel_id = c.channel_id
     AND s.splice_event_id = c.splice_event_id
     AND s.attempt_time >= c.cue_time
    WHERE s.attempt_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
      AND s.attempt_time < toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
    GROUP BY s.channel_id, s.splice_event_id
);

-- Assertion 2: The denominator-of-one trap is prevented (per-cue and production grains aggregate multiple attempts, yielding intermediate continuous rates rather than binary 0/1)
WITH matched AS (
    SELECT
        s.channel_id, s.splice_event_id, s.ssp_id, s.device_class, s.codec, s.stitch_status
    FROM ghostslate.ssai_stitch_attempts AS s
    ASOF LEFT JOIN ghostslate.scte35_cue_events AS c
      ON s.channel_id = c.channel_id
     AND s.splice_event_id = c.splice_event_id
     AND s.attempt_time >= c.cue_time
    WHERE s.attempt_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
      AND s.attempt_time < toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
),
per_cue_grain AS (
    SELECT
        countIf(stitch_status IN ('SLATE_FALLBACK', 'TIMEOUT')) / count() AS bad_rate
    FROM matched
    GROUP BY channel_id, splice_event_id, ssp_id, device_class, codec
),
production_grain AS (
    SELECT
        count(DISTINCT splice_event_id) AS cues,
        countIf(stitch_status IN ('SLATE_FALLBACK', 'TIMEOUT')) / count() AS bad_rate
    FROM matched
    GROUP BY channel_id, ssp_id, device_class, codec
    HAVING cues >= 20
)
SELECT (
    -- Per-cue grain aggregates attempts per break and yields intermediate continuous rates
    (SELECT countIf(bad_rate > 0.0 AND bad_rate < 1.0) FROM per_cue_grain) > 0
    -- Production grain aggregates across >=20 cues and yields intermediate continuous rates across breaks
    AND (SELECT countIf(bad_rate > 0.0 AND bad_rate < 1.0) FROM production_grain) > 0
) AS ok; -- assertion_2_denominator_of_one_trap_prevented

-- Assertion 3: The small-sample guard bites (cohort with cues < 20 is suppressed by HAVING)
WITH matched AS (
    SELECT
        s.channel_id, s.splice_event_id, s.ssp_id, s.device_class, s.codec, s.stitch_status
    FROM ghostslate.ssai_stitch_attempts AS s
    ASOF LEFT JOIN ghostslate.scte35_cue_events AS c
      ON s.channel_id = c.channel_id
     AND s.splice_event_id = c.splice_event_id
     AND s.attempt_time >= c.cue_time
    -- 15-minute window contains only 5 cues (below 20 threshold)
    WHERE s.attempt_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
      AND s.attempt_time < toDateTime64('2026-08-14 19:15:00.000', 3, 'UTC')
)
SELECT (
    (SELECT count() FROM (SELECT channel_id FROM matched GROUP BY channel_id, ssp_id, device_class, codec)) > 0
    AND (SELECT count() FROM (SELECT channel_id FROM matched GROUP BY channel_id, ssp_id, device_class, codec HAVING count(DISTINCT splice_event_id) >= 20)) = 0
) AS ok; -- assertion_3_small_sample_guard_bites

-- Assertion 4: Primary incident isolation at 4D grain (ssp-beta x connected_tv x hevc ~97.73%), and 0 rows for all 3 confounder/control windows
WITH
    primary_results AS (
        SELECT
            channel_id, ssp_id, device_class, codec,
            count(DISTINCT splice_event_id) AS cues,
            round(100.0 * countIf(stitch_status IN ('SLATE_FALLBACK', 'TIMEOUT')) / count(), 2) AS unmonetized_pct
        FROM (
            SELECT s.channel_id, s.splice_event_id, s.ssp_id, s.device_class, s.codec, s.stitch_status
            FROM ghostslate.ssai_stitch_attempts AS s
            ASOF LEFT JOIN ghostslate.scte35_cue_events AS c
              ON s.channel_id = c.channel_id AND s.splice_event_id = c.splice_event_id AND s.attempt_time >= c.cue_time
            WHERE s.attempt_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
              AND s.attempt_time < toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
        )
        GROUP BY channel_id, ssp_id, device_class, codec
        HAVING cues >= 20 AND unmonetized_pct > 5
    ),
    stb_confounder_results AS (
        SELECT
            channel_id, ssp_id, device_class, codec,
            count(DISTINCT splice_event_id) AS cues,
            round(100.0 * countIf(stitch_status IN ('SLATE_FALLBACK', 'TIMEOUT')) / count(), 2) AS unmonetized_pct
        FROM (
            SELECT s.channel_id, s.splice_event_id, s.ssp_id, s.device_class, s.codec, s.stitch_status
            FROM ghostslate.ssai_stitch_attempts AS s
            ASOF LEFT JOIN ghostslate.scte35_cue_events AS c
              ON s.channel_id = c.channel_id AND s.splice_event_id = c.splice_event_id AND s.attempt_time >= c.cue_time
            WHERE s.attempt_time >= toDateTime64('2026-08-12 08:00:00.000', 3, 'UTC')
              AND s.attempt_time < toDateTime64('2026-08-12 12:00:00.000', 3, 'UTC')
        )
        GROUP BY channel_id, ssp_id, device_class, codec
        HAVING cues >= 20 AND unmonetized_pct > 5
    ),
    neg_control_results AS (
        SELECT
            channel_id, ssp_id, device_class, codec,
            count(DISTINCT splice_event_id) AS cues,
            round(100.0 * countIf(stitch_status IN ('SLATE_FALLBACK', 'TIMEOUT')) / count(), 2) AS unmonetized_pct
        FROM (
            SELECT s.channel_id, s.splice_event_id, s.ssp_id, s.device_class, s.codec, s.stitch_status
            FROM ghostslate.ssai_stitch_attempts AS s
            ASOF LEFT JOIN ghostslate.scte35_cue_events AS c
              ON s.channel_id = c.channel_id AND s.splice_event_id = c.splice_event_id AND s.attempt_time >= c.cue_time
            WHERE s.attempt_time >= toDateTime64('2026-08-09 19:00:00.000', 3, 'UTC')
              AND s.attempt_time < toDateTime64('2026-08-09 23:00:00.000', 3, 'UTC')
        )
        GROUP BY channel_id, ssp_id, device_class, codec
        HAVING cues >= 20 AND unmonetized_pct > 5
    )
SELECT (
    -- Primary window returns exactly 1 cohort: ssp-beta x connected_tv x hevc with ~97.73% failure across 80 cues
    (SELECT count() FROM primary_results) = 1
    AND (SELECT countIf(ssp_id = 'ssp-beta' AND device_class = 'connected_tv' AND codec = 'hevc' AND cues = 80 AND unmonetized_pct >= 97.0 AND unmonetized_pct <= 98.5) FROM primary_results) = 1
    -- Confounder ssp-gamma is suppressed inside primary window
    AND (SELECT countIf(ssp_id = 'ssp-gamma') FROM primary_results) = 0
    -- Confounder STB error window returns 0 cohorts (proving ERROR is excluded from unmonetized rate)
    AND (SELECT count() FROM stb_confounder_results) = 0
    -- Negative control window returns 0 cohorts
    AND (SELECT count() FROM neg_control_results) = 0
) AS ok; -- assertion_4_primary_incident_isolated_at_4d_grain_and_confounders_suppressed

-- Assertion 5: Negative control silence (diffuse noise over 2026-08-09 19:00–23:00 produces 0 cohorts > 5% unmonetized)
WITH matched AS (
    SELECT
        s.channel_id, s.splice_event_id, s.ssp_id, s.device_class, s.codec, s.stitch_status
    FROM ghostslate.ssai_stitch_attempts AS s
    ASOF LEFT JOIN ghostslate.scte35_cue_events AS c
      ON s.channel_id = c.channel_id
     AND s.splice_event_id = c.splice_event_id
     AND s.attempt_time >= c.cue_time
    WHERE s.attempt_time >= toDateTime64('2026-08-09 19:00:00.000', 3, 'UTC')
      AND s.attempt_time < toDateTime64('2026-08-09 23:00:00.000', 3, 'UTC')
),
results AS (
    SELECT
        channel_id, ssp_id, device_class, codec,
        count(DISTINCT splice_event_id) AS cues,
        round(100.0 * countIf(stitch_status IN ('SLATE_FALLBACK', 'TIMEOUT')) / count(), 2) AS unmonetized_pct
    FROM matched
    GROUP BY channel_id, ssp_id, device_class, codec
    HAVING cues >= 20 AND unmonetized_pct > 5
)
SELECT (
    count() = 0
) AS ok -- assertion_5_negative_control_silence
FROM results;
