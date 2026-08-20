-- GhostSlate Incident Integrity Assertions
-- Every query must return ok = 1.

-- Assertion 1: Injected incident ledger contains exactly the 4 documented incidents
SELECT (
    count() = 4
    AND countIf(incident_id = 'primary-ssp-beta-ctv-hevc' AND kind = 'primary') = 1
    AND countIf(incident_id = 'confounder-ssp-gamma-slow-but-inside-deadline' AND kind = 'confounder') = 1
    AND countIf(incident_id = 'confounder-set-top-box-errors' AND kind = 'confounder') = 1
    AND countIf(incident_id = 'negative-control-diffuse-primetime' AND kind = 'negative_control') = 1
) AS ok -- assertion_1_ledger_contains_all_four_incidents
FROM ghostslate_eval.injected_incidents FINAL;

-- Assertion 2: Primary incident cohort (ssp-beta x connected_tv x hevc) has slate+timeout rate > 90% in window
SELECT (
    bad_rate >= 0.90
    AND slate_rate >= 0.50
    AND timeout_rate >= 0.30
    AND p95_latency >= 1500
) AS ok -- assertion_2_primary_cohort_degraded_in_window
FROM (
    SELECT
        countIf(stitch_status IN ('SLATE_FALLBACK', 'TIMEOUT')) / count() AS bad_rate,
        countIf(stitch_status = 'SLATE_FALLBACK') / count() AS slate_rate,
        countIf(stitch_status = 'TIMEOUT') / count() AS timeout_rate,
        quantileTDigest(0.95)(ad_response_latency_ms) AS p95_latency
    FROM ghostslate.ssai_stitch_attempts
    WHERE attempt_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
      AND attempt_time < toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
      AND ssp_id = 'ssp-beta' AND device_class = 'connected_tv' AND codec = 'hevc'
);

-- Assertion 3: Primary cohort clears the small-sample guard (cues >= 20)
SELECT (
    cues >= 20 AND total_attempts >= 20000
) AS ok -- assertion_3_primary_cohort_clears_sample_guard
FROM (
    SELECT
        count(DISTINCT splice_event_id) AS cues,
        count() AS total_attempts
    FROM ghostslate.ssai_stitch_attempts
    WHERE attempt_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
      AND attempt_time < toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
      AND ssp_id = 'ssp-beta' AND device_class = 'connected_tv' AND codec = 'hevc'
);

-- Assertion 4: Primary cohort outside incident window (same day) maintains normal baseline slate+timeout (< 5%)
SELECT (
    bad_rate < 0.05
) AS ok -- assertion_4_primary_cohort_normal_outside_window
FROM (
    SELECT
        countIf(stitch_status IN ('SLATE_FALLBACK', 'TIMEOUT')) / count() AS bad_rate
    FROM ghostslate.ssai_stitch_attempts
    WHERE attempt_time >= toDateTime64('2026-08-14 00:00:00.000', 3, 'UTC')
      AND attempt_time < toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
      AND ssp_id = 'ssp-beta' AND device_class = 'connected_tv' AND codec = 'hevc'
);

-- Assertion 5: Sibling cohorts in the same window have slate+timeout rate < 5% (no leakage)
SELECT (
    countIf(bad_rate >= 0.05) = 0
) AS ok -- assertion_5_sibling_cohorts_healthy_in_primary_window
FROM (
    SELECT
        ssp_id, device_class, codec,
        countIf(stitch_status IN ('SLATE_FALLBACK', 'TIMEOUT')) / count() AS bad_rate
    FROM ghostslate.ssai_stitch_attempts
    WHERE attempt_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
      AND attempt_time < toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
      AND NOT (ssp_id = 'ssp-beta' AND device_class = 'connected_tv' AND codec = 'hevc')
    GROUP BY ssp_id, device_class, codec
    HAVING count() >= 20
);

-- Assertion 6: Confounder ssp-gamma has elevated p95 latency (>= 420ms) with flat slate rate (< 3.0%)
SELECT (
    p95_latency >= 420
    AND slate_rate >= 0.015 AND slate_rate <= 0.030
    AND timeout_rate < 0.005
) AS ok -- assertion_6_gamma_confounder_latency_spike_no_slate
FROM (
    SELECT
        quantileTDigest(0.95)(ad_response_latency_ms) AS p95_latency,
        countIf(stitch_status = 'SLATE_FALLBACK') / count() AS slate_rate,
        countIf(stitch_status = 'TIMEOUT') / count() AS timeout_rate
    FROM ghostslate.ssai_stitch_attempts
    WHERE attempt_time >= toDateTime64('2026-08-14 20:00:00.000', 3, 'UTC')
      AND attempt_time < toDateTime64('2026-08-14 21:00:00.000', 3, 'UTC')
      AND ssp_id = 'ssp-gamma'
);

-- Assertion 7: Confounder set-top-box has elevated ERROR rate (2.5%–4.0%) with flat slate rate (< 2.5%)
SELECT (
    error_rate >= 0.025 AND error_rate <= 0.040
    AND slate_rate < 0.025
    AND p95_latency <= 350
) AS ok -- assertion_7_stb_confounder_error_blip_no_slate
FROM (
    SELECT
        countIf(stitch_status = 'ERROR') / count() AS error_rate,
        countIf(stitch_status = 'SLATE_FALLBACK') / count() AS slate_rate,
        quantileTDigest(0.95)(ad_response_latency_ms) AS p95_latency
    FROM ghostslate.ssai_stitch_attempts
    WHERE attempt_time >= toDateTime64('2026-08-12 08:00:00.000', 3, 'UTC')
      AND attempt_time < toDateTime64('2026-08-12 12:00:00.000', 3, 'UTC')
      AND device_class = 'set_top_box'
);

-- Assertion 8: Negative control diffuse check (cohort slate delta vs surrounding hours on same day)
-- Diffuse means uniform elevation across all slices: max cohort delta is within a small factor of median delta.
-- Measured spread: median delta = ~1.00pp (0.00997), top-to-sixth spread was 1.86pp -> 1.21pp, max delta = ~2.10pp.
SELECT (
    overall_slate >= 0.025 AND overall_slate <= 0.035
    AND max_delta <= 0.025
    AND (max_delta / median_delta) <= 2.5
) AS ok -- assertion_8_negative_control_diffuse_slate_deltas
FROM (
    WITH
        in_window AS (
            SELECT
                ssp_id, device_class, codec,
                count() AS in_n,
                countIf(stitch_status = 'SLATE_FALLBACK') / count() AS in_slate_rate
            FROM ghostslate.ssai_stitch_attempts
            WHERE attempt_time >= toDateTime64('2026-08-09 19:00:00.000', 3, 'UTC')
              AND attempt_time < toDateTime64('2026-08-09 23:00:00.000', 3, 'UTC')
            GROUP BY ssp_id, device_class, codec
            HAVING in_n >= 20
        ),
        out_window AS (
            SELECT
                ssp_id, device_class, codec,
                count() AS out_n,
                countIf(stitch_status = 'SLATE_FALLBACK') / count() AS out_slate_rate
            FROM ghostslate.ssai_stitch_attempts
            WHERE attempt_time >= toDateTime64('2026-08-09 00:00:00.000', 3, 'UTC')
              AND attempt_time < toDateTime64('2026-08-09 19:00:00.000', 3, 'UTC')
            GROUP BY ssp_id, device_class, codec
            HAVING out_n >= 20
        ),
        deltas AS (
            SELECT (i.in_slate_rate - o.out_slate_rate) AS slate_delta
            FROM in_window AS i
            JOIN out_window AS o ON i.ssp_id = o.ssp_id AND i.device_class = o.device_class AND i.codec = o.codec
        )
    SELECT
        (SELECT countIf(stitch_status = 'SLATE_FALLBACK') / count()
         FROM ghostslate.ssai_stitch_attempts
         WHERE attempt_time >= toDateTime64('2026-08-09 19:00:00.000', 3, 'UTC')
           AND attempt_time < toDateTime64('2026-08-09 23:00:00.000', 3, 'UTC')) AS overall_slate,
        max(slate_delta) AS max_delta,
        median(slate_delta) AS median_delta
    FROM deltas
);

-- Assertion 9: Ledger constants check (asserts stored windows match source-of-truth literals)
SELECT (
    count() = 4
    AND countIf(
        incident_id = 'primary-ssp-beta-ctv-hevc'
        AND kind = 'primary'
        AND channel_id = 'ch-01'
        AND window_start = toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
        AND window_end = toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
        AND ssp_id = 'ssp-beta'
        AND device_class = 'connected_tv'
        AND codec = 'hevc'
        AND expected_root_cause = 'ssp-beta auction latency on connected_tv/hevc'
    ) = 1
    AND countIf(
        incident_id = 'confounder-ssp-gamma-slow-but-inside-deadline'
        AND kind = 'confounder'
        AND channel_id = 'ch-01'
        AND window_start = toDateTime64('2026-08-14 20:00:00.000', 3, 'UTC')
        AND window_end = toDateTime64('2026-08-14 21:00:00.000', 3, 'UTC')
        AND ssp_id = 'ssp-gamma'
        AND expected_root_cause = ''
    ) = 1
    AND countIf(
        incident_id = 'confounder-set-top-box-errors'
        AND kind = 'confounder'
        AND channel_id = 'ch-01'
        AND window_start = toDateTime64('2026-08-12 08:00:00.000', 3, 'UTC')
        AND window_end = toDateTime64('2026-08-12 12:00:00.000', 3, 'UTC')
        AND device_class = 'set_top_box'
        AND expected_root_cause = ''
    ) = 1
    AND countIf(
        incident_id = 'negative-control-diffuse-primetime'
        AND kind = 'negative_control'
        AND channel_id = 'ch-01'
        AND window_start = toDateTime64('2026-08-09 19:00:00.000', 3, 'UTC')
        AND window_end = toDateTime64('2026-08-09 23:00:00.000', 3, 'UTC')
        AND expected_root_cause = ''
    ) = 1
) AS ok -- assertion_9_ledger_constants_match_source_of_truth
FROM ghostslate_eval.injected_incidents FINAL;

-- Assertion 10: Status/latency invariant across all mutated partitions (20260809, 20260812, 20260814)
-- Asserts zero rows have stitch_status disagreeing with ad_response_latency_ms under 450/1200 thresholds, ERROR excepted.
SELECT (
    countIf(
        stitch_status != 'ERROR' AND (
            (ad_response_latency_ms > 1200 AND stitch_status != 'TIMEOUT') OR
            (ad_response_latency_ms > 450 AND ad_response_latency_ms <= 1200 AND stitch_status != 'SLATE_FALLBACK') OR
            (ad_response_latency_ms <= 450 AND stitch_status != 'FILLED')
        )
    ) = 0
) AS ok -- assertion_10_status_latency_invariant_across_mutated_partitions
FROM ghostslate.ssai_stitch_attempts
WHERE toDate(attempt_time) IN ('2026-08-09', '2026-08-12', '2026-08-14');
