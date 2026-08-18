-- Parameterized ASOF JOIN correlation query aggregating across cues
-- Never computes ratio at denominator-of-one grain.
-- Guarded by HAVING cues >= 20 to suppress small-sample noise.

WITH matched AS (
    SELECT
        c.channel_id             AS channel_id,
        c.splice_event_id        AS splice_event_id,
        s.ssp_id                 AS ssp_id,
        s.device_class           AS device_class,
        s.stitch_status          AS stitch_status,
        s.ad_response_latency_ms AS latency_ms
    FROM scte35_cue_events AS c
    ASOF LEFT JOIN ssai_stitch_attempts AS s
      ON c.channel_id = s.channel_id
     AND c.splice_event_id = s.splice_event_id
     AND s.attempt_time >= c.cue_time
    WHERE c.cue_time BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}
)
SELECT
    channel_id,
    ssp_id,
    device_class,
    count()                                                               AS cues,
    countIf(stitch_status = 'SLATE_FALLBACK')                             AS slate_cues,
    round(100.0 * countIf(stitch_status = 'SLATE_FALLBACK') / count(), 2) AS slate_bleed_pct,
    quantileTDigest(0.95)(latency_ms)                                     AS p95_auction_ms
FROM matched
GROUP BY channel_id, ssp_id, device_class
HAVING cues >= 20 AND slate_bleed_pct > 5
ORDER BY slate_bleed_pct DESC;
