-- GhostSlate Baseline Integrity Assertions
-- Every query must return ok = 1.

-- Assertion 1: ssai_stitch_attempts count = 101,400,000 exactly
SELECT (count() = 101400000) AS ok -- assertion_1_stitch_attempts_count
FROM ghostslate.ssai_stitch_attempts;

-- Assertion 2: scte35_cue_events count = 14,400 exactly
SELECT (count() = 14400) AS ok -- assertion_2_cue_events_count
FROM ghostslate.scte35_cue_events;

-- Assertion 3: advertiser_inventory count = 4
SELECT (count() = 4) AS ok -- assertion_3_inventory_count
FROM ghostslate.advertiser_inventory;

-- Assertion 4: slate_observations count = 0 (unseeded, written by vision pipeline)
SELECT (count() = 0) AS ok -- assertion_4_slate_observations_empty
FROM ghostslate.slate_observations;

-- Assertion 5: Exactly one distinct channel_id = 'ch-01' in both telemetry tables
SELECT (
    (SELECT count(DISTINCT channel_id) = 1 AND any(channel_id) = 'ch-01' FROM ghostslate.ssai_stitch_attempts)
    AND
    (SELECT count(DISTINCT channel_id) = 1 AND any(channel_id) = 'ch-01' FROM ghostslate.scte35_cue_events)
) AS ok; -- assertion_5_channel_id_ch01

-- Assertion 6: min(cue_time) = 2026-07-19 00:00:00.000 and max(cue_time) = 2026-08-17 23:57:00.000
SELECT (
    min(cue_time) = toDateTime64('2026-07-19 00:00:00.000', 3, 'UTC')
    AND max(cue_time) = toDateTime64('2026-08-17 23:57:00.000', 3, 'UTC')
) AS ok -- assertion_6_cue_time_boundaries
FROM ghostslate.scte35_cue_events;

-- Assertion 7: Every one of the 720 hours in the window has rows >= 50,000
SELECT (
    count() = 720
    AND min(hourly_count) >= 50000
) AS ok -- assertion_7_hourly_distribution
FROM (
    SELECT toStartOfHour(attempt_time) AS h, count() AS hourly_count
    FROM ghostslate.ssai_stitch_attempts
    GROUP BY h
);

-- Assertion 8: Diurnal shape is real: busiest hour-of-day / quietest hour-of-day row ratio >= 3.0
SELECT (
    (max(hourly_total) / min(hourly_total)) >= 3.0
) AS ok -- assertion_8_diurnal_ratio
FROM (
    SELECT toHour(attempt_time) AS hr, count() AS hourly_total
    FROM ghostslate.ssai_stitch_attempts
    GROUP BY hr
);

-- Assertion 9: attempt_time > cue_time for every row (joined on splice_event_id)
SELECT (
    countIf(s.attempt_time <= c.cue_time) = 0
) AS ok -- assertion_9_attempt_after_cue
FROM ghostslate.ssai_stitch_attempts AS s
JOIN ghostslate.scte35_cue_events AS c ON s.splice_event_id = c.splice_event_id;

-- Assertion 10: Baseline health: grouped by ssp_id, device_class, codec, and hour-of-day with HAVING count() >= 20,
-- slate_bleed rate is below 5.0% for every single slice (guards against peak-hour slice regressions).
SELECT (
    countIf(slate_pct >= 5.0) = 0
) AS ok -- assertion_10_cohort_hour_slate_below_5pct
FROM (
    SELECT
        ssp_id,
        device_class,
        codec,
        toHour(attempt_time) AS hr,
        count() AS total_attempts,
        (countIf(stitch_status = 'SLATE_FALLBACK') * 100.0 / count()) AS slate_pct
    FROM ghostslate.ssai_stitch_attempts
    GROUP BY ssp_id, device_class, codec, hr
    HAVING total_attempts >= 20
);

-- Assertion 11: Overall SLATE_FALLBACK share is between 1.0% and 3.0%
SELECT (
    slate_share >= 0.01 AND slate_share <= 0.03
) AS ok -- assertion_11_overall_slate_share
FROM (
    SELECT countIf(stitch_status = 'SLATE_FALLBACK') / count() AS slate_share
    FROM ghostslate.ssai_stitch_attempts
);

-- Assertion 12: p95 ad_response_latency_ms per SSP is between 200 and 350 ms, and below 450 ms for all four.
-- Note: The 200–350 ms range comes from the analytic p95 of the mixture model (5% heavy-tail branch at 6x spread + peak load factor).
-- Measured headroom to the 450 ms deadline is ~104 ms at the worst SSP (ssp-delta ~346 ms).
-- Incident injection must preserve the baseline distribution outside its scoped windows.
SELECT (
    count() = 4
    AND min(p95) >= 200
    AND max(p95) <= 350
    AND max(p95) < 450
) AS ok -- assertion_12_p95_latency_by_ssp
FROM (
    SELECT ssp_id, quantileTDigest(0.95)(ad_response_latency_ms) AS p95
    FROM ghostslate.ssai_stitch_attempts
    GROUP BY ssp_id
);

-- Assertion 13: stitch_status takes exactly the four documented values; ERROR share is between 0.10% and 0.20%
SELECT (
    arraySort(groupUniqArray(stitch_status)) = ['ERROR', 'FILLED', 'SLATE_FALLBACK', 'TIMEOUT']
    AND (countIf(stitch_status = 'ERROR') / count()) >= 0.0010
    AND (countIf(stitch_status = 'ERROR') / count()) <= 0.0020
) AS ok -- assertion_13_status_set_and_error_rate
FROM ghostslate.ssai_stitch_attempts;

-- Assertion 14: Cohort mixes are within ±1% of weights; av1 on set_top_box is exactly 0 rows
SELECT (
    abs(ssp_alpha_pct - 34.0) <= 1.0 AND
    abs(ssp_beta_pct - 26.0) <= 1.0 AND
    abs(ssp_gamma_pct - 22.0) <= 1.0 AND
    abs(ssp_delta_pct - 18.0) <= 1.0 AND
    abs(dev_ctv_pct - 46.0) <= 1.0 AND
    abs(dev_mob_pct - 27.0) <= 1.0 AND
    abs(dev_web_pct - 17.0) <= 1.0 AND
    abs(dev_stb_pct - 10.0) <= 1.0 AND
    stb_av1_count = 0
) AS ok -- assertion_14_cohort_mixes_and_zero_stb_av1
FROM (
    SELECT
        countIf(ssp_id = 'ssp-alpha') * 100.0 / count() AS ssp_alpha_pct,
        countIf(ssp_id = 'ssp-beta') * 100.0 / count() AS ssp_beta_pct,
        countIf(ssp_id = 'ssp-gamma') * 100.0 / count() AS ssp_gamma_pct,
        countIf(ssp_id = 'ssp-delta') * 100.0 / count() AS ssp_delta_pct,
        countIf(device_class = 'connected_tv') * 100.0 / count() AS dev_ctv_pct,
        countIf(device_class = 'mobile') * 100.0 / count() AS dev_mob_pct,
        countIf(device_class = 'web') * 100.0 / count() AS dev_web_pct,
        countIf(device_class = 'set_top_box') * 100.0 / count() AS dev_stb_pct,
        countIf(device_class = 'set_top_box' AND codec = 'av1') AS stb_av1_count
    FROM ghostslate.ssai_stitch_attempts
);

-- Assertion 15: Determinism Fingerprint
-- Fingerprint: 10026018070057478800
SELECT (
    sum(cityHash64(*)) = 10026018070057478800
) AS ok -- assertion_15_determinism_fingerprint
FROM ghostslate.ssai_stitch_attempts;

-- Assertion 16: Day-to-day hourly traffic variance (proves non-flat diurnal profile across 30 days)
SELECT (
    count() = 24
    AND min(has_variance) = 1
    AND avg(rel_spread) >= 0.02
) AS ok -- assertion_16_hourly_variance_across_days
FROM (
    SELECT
        hr,
        (max(cnt) > min(cnt)) AS has_variance,
        (max(cnt) - min(cnt)) / avg(cnt) AS rel_spread
    FROM (
        SELECT
            toHour(attempt_time) AS hr,
            toStartOfDay(attempt_time) AS d,
            count() AS cnt
        FROM ghostslate.ssai_stitch_attempts
        GROUP BY hr, d
    )
    GROUP BY hr
);
