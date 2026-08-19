-- Seed data: Baseline Telemetry (14,400 SCTE-35 Cues and 101,400,000 SSAI Stitch Attempts)
-- Deterministic in-database generation via numbers() and numbers_mt().
-- Incorporates per-day ±5% deterministic jitter while maintaining exact 3,380,000 daily rows.
-- Guarded against additive re-execution.

SET max_partitions_per_insert_block = 100;

-- 1. SCTE-35 Cue Events (14,400 cues over 30 days)
INSERT INTO ghostslate.scte35_cue_events (
    channel_id,
    splice_event_id,
    cue_time,
    avail_num,
    segmentation_type_id,
    expected_duration_ms
)
SELECT
    'ch-01' AS channel_id,
    number + 1 AS splice_event_id,
    fromUnixTimestamp64Milli(toInt64(1784419200000 + number * 180000), 'UTC') AS cue_time,
    toUInt16(number % 4 + 1) AS avail_num,
    -- 0x34 Provider Placement Opportunity Start is the common case; 0x30 Provider
    -- Advertisement Start appears on the rotation where the break is provider-owned.
    toUInt16(if(number % 5 = 0, 48, 52)) AS segmentation_type_id,
    toUInt32([30000, 60000, 90000][number % 3 + 1]) AS expected_duration_ms
FROM numbers(14400)
WHERE (SELECT count() FROM ghostslate.scte35_cue_events) = 0;

-- 2. SSAI Stitch Attempts (101,400,000 stitch attempts over 30 days)
INSERT INTO ghostslate.ssai_stitch_attempts (
    channel_id,
    splice_event_id,
    attempt_time,
    stitch_status,
    ssp_id,
    ad_response_latency_ms,
    device_class,
    codec,
    vast_version
)
WITH day_profile AS (
    SELECT
        number AS day,
        arrayMap(
            i -> toUInt32(round(3380000.0 * cum_raw[i] / cum_raw[24])),
            range(1, 25)
        ) AS rows_cum
    FROM (
        SELECT
            number,
            arrayCumSum(
                arrayMap(
                    h -> [6500, 5200, 4200, 3400, 2900, 2700, 3000, 3800, 4800, 5600, 6200, 6700,
                          7200, 7400, 7600, 8000, 8800, 9800, 11000, 12200, 12500, 11600, 9800,
                          8100][h] * (0.95 + 0.10 * ((cityHash64(number, h, 21) % 100000) / 100000.0)),
                    range(1, 25)
                )
            ) AS cum_raw
        FROM numbers(30)
    )
)
SELECT
    'ch-01' AS channel_id,
    cue_index + 1 AS splice_event_id,
    fromUnixTimestamp64Milli(
        toUnixTimestamp64Milli(cue_time) + latency_ms + stitcher_overhead_ms,
        'UTC'
    ) AS attempt_time,
    multiIf(
        u_err < 0.0015, 'ERROR',
        latency_ms > 1200, 'TIMEOUT',
        latency_ms > 450, 'SLATE_FALLBACK',
        'FILLED'
    ) AS stitch_status,
    ssp_id,
    latency_ms AS ad_response_latency_ms,
    device_class,
    codec,
    vast_version
FROM (
    SELECT
        cue_time,
        cue_index,
        ssp_id,
        device_class,
        codec,
        vast_version,
        toUInt32(least(greatest(round(base_ms + scale * (-log(1.0 - u_lat))), 20), 5000)) AS latency_ms,
        u_err,
        stitcher_overhead_ms
    FROM (
        SELECT
            cue_time,
            cue_index,
            ssp_id,
            device_class,
            codec,
            vast_version,
            multiIf(
                ssp_id = 'ssp-alpha', 60.0,
                ssp_id = 'ssp-beta', 75.0,
                ssp_id = 'ssp-gamma', 68.0,
                85.0
            ) AS base_ms,
            multiIf(
                ssp_id = 'ssp-alpha', 55.0,
                ssp_id = 'ssp-beta', 64.0,
                ssp_id = 'ssp-gamma', 58.0,
                62.0
            ) * load_factor * if(u_branch < 0.05, 6.0, 1.0) AS scale,
            u_lat,
            u_err,
            toUInt32(25 + (cityHash64(number, 18) % 30)) AS stitcher_overhead_ms
        FROM (
            SELECT
                number,
                cue_time,
                cue_index,
                load_factor,
                multiIf(
                    u_ssp < 0.34, 'ssp-alpha',
                    u_ssp < 0.60, 'ssp-beta',
                    u_ssp < 0.82, 'ssp-gamma',
                    'ssp-delta'
                ) AS ssp_id,
                device_class,
                multiIf(
                    device_class = 'connected_tv',
                    multiIf(u_codec < 0.35, 'h264', u_codec < 0.90, 'hevc', 'av1'),
                    device_class = 'mobile',
                    multiIf(u_codec < 0.62, 'h264', u_codec < 0.95, 'hevc', 'av1'),
                    device_class = 'web',
                    multiIf(u_codec < 0.70, 'h264', u_codec < 0.80, 'hevc', 'av1'),
                    multiIf(u_codec < 0.88, 'h264', 'hevc')
                ) AS codec,
                multiIf(
                    u_vast < 0.41, '4.2',
                    u_vast < 0.70, '4.0',
                    u_vast < 0.92, '3.0',
                    '2.0'
                ) AS vast_version,
                u_branch,
                u_lat,
                u_err
            FROM (
                SELECT
                    number,
                    cue_time,
                    cue_index,
                    1.0 + 0.20 * (toFloat64(sessions) / 12500.0) AS load_factor,
                    (cityHash64(number, 12) % 100000) / 100000.0 AS u_ssp,
                    multiIf(
                        u_dev < 0.46, 'connected_tv',
                        u_dev < 0.73, 'mobile',
                        u_dev < 0.90, 'web',
                        'set_top_box'
                    ) AS device_class,
                    (cityHash64(number, 13) % 100000) / 100000.0 AS u_codec,
                    (cityHash64(number, 14) % 100000) / 100000.0 AS u_vast,
                    (cityHash64(number, 15) % 100000) / 100000.0 AS u_branch,
                    (cityHash64(number, 16) % 100000) / 100000.0 AS u_lat,
                    (cityHash64(number, 17) % 100000) / 100000.0 AS u_err
                FROM (
                    SELECT
                        number,
                        fromUnixTimestamp64Milli(toInt64(1784419200000 + cue_index * 180000), 'UTC') AS cue_time,
                        day * 480 + hour * 20 + (within_hour % 20) AS cue_index,
                        (rows_this_hour / 20.0) AS sessions,
                        (cityHash64(number, 11) % 100000) / 100000.0 AS u_dev
                    FROM (
                        SELECT
                            number,
                            day,
                            hour,
                            n - prev_cum AS within_hour,
                            rows_cum[hour + 1] - prev_cum AS rows_this_hour
                        FROM (
                            SELECT
                                number,
                                raw.day AS day,
                                n,
                                dp.rows_cum AS rows_cum,
                                arrayFirstIndex(x -> raw.n < x, dp.rows_cum) - 1 AS hour,
                                if(hour = 0, 0, dp.rows_cum[hour]) AS prev_cum
                            FROM (
                                SELECT
                                    number,
                                    intDiv(number, 3380000) AS day,
                                    number % 3380000 AS n
                                FROM numbers_mt(101400000)
                                WHERE (SELECT count() FROM ghostslate.ssai_stitch_attempts) = 0
                            ) AS raw
                            JOIN day_profile AS dp ON raw.day = dp.day
                        )
                    )
                )
            )
        )
    )
);
