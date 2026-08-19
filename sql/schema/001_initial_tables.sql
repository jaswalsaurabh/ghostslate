-- GhostSlate ClickHouse Schema DDL

CREATE DATABASE IF NOT EXISTS ghostslate;

CREATE TABLE IF NOT EXISTS ghostslate.scte35_cue_events (
    channel_id LowCardinality(String),
    splice_event_id UInt64,
    cue_time DateTime64(3, 'UTC'),
    avail_num UInt16,
    segmentation_type_id UInt16,
    expected_duration_ms UInt32
) ENGINE = MergeTree()
ORDER BY (channel_id, cue_time, splice_event_id);

CREATE TABLE IF NOT EXISTS ghostslate.ssai_stitch_attempts (
    channel_id LowCardinality(String),
    splice_event_id UInt64,
    attempt_time DateTime64(3, 'UTC'),
    stitch_status LowCardinality(String), -- 'FILLED', 'SLATE_FALLBACK', 'TIMEOUT', 'ERROR'
    ssp_id LowCardinality(String),
    ad_response_latency_ms UInt32,
    device_class LowCardinality(String), -- 'connected_tv', 'mobile', 'web', 'set_top_box'
    codec LowCardinality(String), -- 'h264', 'hevc', 'av1'
    vast_version LowCardinality(String) -- '2.0', '3.0', '4.0', '4.2'
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(attempt_time)
ORDER BY (channel_id, attempt_time, splice_event_id);

CREATE TABLE IF NOT EXISTS ghostslate.slate_observations (
    session_id UUID,
    channel_id LowCardinality(String),
    observed_at DateTime64(3, 'UTC'),
    frame_class LowCardinality(String), -- 'SLATE', 'CONTENT', 'AD'
    confidence Float32
) ENGINE = MergeTree()
ORDER BY (channel_id, observed_at, session_id);

CREATE TABLE IF NOT EXISTS ghostslate.advertiser_inventory (
    channel_id LowCardinality(String),
    daypart LowCardinality(String), -- 'primetime', 'daytime', 'late_night', 'early_morning'
    cpm_usd Decimal(8, 2),
    -- Unit invariant: percentages are stored 0–100, never 0–1
    fill_target_pct Float32
) ENGINE = MergeTree()
ORDER BY (channel_id, daypart);
