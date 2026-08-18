# GhostSlate Data Generator

Anomaly injector for SSAI telemetry and SCTE-35 cue markers.

## Architecture

- **Baseline Data (100M+ rows):** Generated directly inside ClickHouse using `INSERT ... SELECT ... FROM numbers()` with diurnal distribution functions and realistic latency quantiles.
- **Anomaly Injection (`tools/generator/`):** Python script using `clickhouse-connect` and `faker` to inject scripted auction timeouts, codec mismatches, and negative control scenarios.
