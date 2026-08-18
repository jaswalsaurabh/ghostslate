# GhostSlate SQL

This directory holds the canonical ClickHouse schema DDL and benchmarked analytical queries.
Per `AGENTS.md`, the schema lives here, not in application code.

## Layout

- `schema/` — Table definitions and index structures (`001_initial_tables.sql`).
- `queries/` — Parameterized queries benchmarked for agent consumption (`slate_bleed_correlation.sql`).
- `benchmarks/` — Recorded query execution timings and scan performance.
