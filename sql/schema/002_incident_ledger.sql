-- Ground-truth ledger for injected incidents.
--
-- Deliberately in a separate database: ghostslate_agent is granted SELECT on
-- ghostslate.* only, so the agent cannot read the answer key it is being
-- evaluated against. The eval harness and the injector read it — the agent never does.

CREATE DATABASE IF NOT EXISTS ghostslate_eval;

CREATE TABLE IF NOT EXISTS ghostslate_eval.injected_incidents (
    incident_id LowCardinality(String),
    kind LowCardinality(String), -- 'primary', 'positive_variant', 'confounder', 'negative_control'
    channel_id LowCardinality(String),
    window_start DateTime64(3, 'UTC'),
    window_end DateTime64(3, 'UTC'),
    -- Dimension values that define the affected cohort. Empty for window-wide effects.
    ssp_id LowCardinality(String),
    device_class LowCardinality(String),
    codec LowCardinality(String),
    -- What a correct investigation should conclude. The negative control's
    -- expected root cause is the empty string: the correct answer is silence.
    expected_root_cause String,
    description String,
    injected_at DateTime('UTC')
) ENGINE = ReplacingMergeTree(injected_at)
ORDER BY incident_id;
