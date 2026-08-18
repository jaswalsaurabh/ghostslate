-- Day 1 spike only. Throwaway table proving the agent can reach real data
-- through MCP. The real schema arrives on Day 3 and this file is deleted then.

CREATE DATABASE IF NOT EXISTS ghostslate;

CREATE TABLE IF NOT EXISTS ghostslate.spike_cue_events
(
    event_time   DateTime,
    channel_id   LowCardinality(String),
    ssp_id       LowCardinality(String),
    latency_ms   UInt32,
    stitch_ok    UInt8
)
ENGINE = MergeTree
ORDER BY (channel_id, event_time);

INSERT INTO ghostslate.spike_cue_events
SELECT
    now() - INTERVAL number MINUTE                     AS event_time,
    'ch-01'                                            AS channel_id,
    ['ssp-alpha', 'ssp-beta', 'ssp-gamma'][number % 3 + 1] AS ssp_id,
    -- ssp-beta runs slow on purpose, so a correct answer is checkable by eye
    if(number % 3 = 1, 400 + number % 200, 80 + number % 60) AS latency_ms,
    if(number % 3 = 1 AND number % 7 = 0, 0, 1)        AS stitch_ok
FROM numbers(100);

-- Expected: ssp-beta shows the highest mean latency and the only failures.
SELECT ssp_id, count() AS cues, round(avg(latency_ms)) AS avg_latency_ms, sum(stitch_ok = 0) AS failures
FROM ghostslate.spike_cue_events
GROUP BY ssp_id
ORDER BY avg_latency_ms DESC;
