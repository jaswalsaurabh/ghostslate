-- Parameterized Loss Attribution query joining unmonetized stitch attempts to advertiser_inventory.
-- Slices by channel_id, ssp_id, device_class, codec, and daypart.
-- Defines unmonetized traffic as SLATE_FALLBACK + TIMEOUT (excluding hard ERRORs).
-- Returns unmonetized_impressions and cpm_usd. Single ownership rule: MetricsService owns financial loss arithmetic.
-- Guarded by HAVING cues >= 20.

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
    WHERE s.attempt_time >= {from:DateTime64(3)} AND s.attempt_time < {to:DateTime64(3)}
      AND s.channel_id = {channel:String}
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
ORDER BY unmonetized_impressions DESC
