-- Parameterized SSAI Stitch Attempt correlation query across SCTE-35 ad break boundaries.
-- Aggregates stitch attempts matched to preceding cue events via ASOF JOIN.
-- Defines unmonetized traffic as SLATE_FALLBACK + TIMEOUT (neither delivered an ad).
-- Deliberately excludes ERROR: hard ad-call errors are a distinct failure mode with a distinct
-- remedy; conflating errors with slate/timeout would incorrectly trigger on confounder-set-top-box-errors.
-- Grouped at channel_id x ssp_id x device_class x codec grain.
-- Guarded by HAVING cues >= 20 AND unmonetized_pct > 5 to suppress small-sample noise.

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
    WHERE s.attempt_time >= {from:DateTime64(3)} AND s.attempt_time < {to:DateTime64(3)}
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
ORDER BY unmonetized_pct DESC
