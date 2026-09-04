# GhostSlate Data Generator & Anomaly Injector

Creates repeatable failures in synthetic ad-delivery records so GhostSlate can demonstrate both
finding an incident and rejecting misleading clues. It mutates SSAI telemetry associated with
SCTE-35 cue markers. See the [main glossary](../../README.md#the-technical-terms-in-plain-language)
for those terms. This is an admin/setup tool, not the agent's database access path.

## Architecture

- **Baseline Data (101.4M rows):** Generated directly inside ClickHouse using `INSERT ... SELECT ... FROM numbers()` with diurnal distribution functions, realistic latency quantiles, and deterministic pseudo-random seeds.
- **Incident Injection (`tools/generator/`):** Declarative Python mutations that execute partition-scoped `ALTER TABLE ... UPDATE` queries on the existing baseline rows.
- **Idempotency & Answer Key (`ghostslate_eval.injected_incidents`):** Each incident mutation is tracked in a dedicated `ghostslate_eval` database. If an incident has already been injected, subsequent runs skip it. The eval database is isolated from the `ghostslate_agent` user so the agent cannot read its own evaluation answer key.

## Injected Incident Scenarios

| Incident ID                                     | Kind             | Time Window (UTC)        | Target Cohort                        | Effect / Ground Truth                                                                                                                                                                              |
| :---------------------------------------------- | :--------------- | :----------------------- | :----------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `primary-ssp-beta-ctv-hevc`                     | Primary          | `2026-08-14 19:00–23:00` | `ssp-beta` × `connected_tv` × `hevc` | +1150ms sinusoidal ramp with jitter. Breaches 450ms slate / 1200ms timeout deadlines (97.7% failure rate).                                                                                         |
| `confounder-ssp-gamma-slow-but-inside-deadline` | Confounder       | `2026-08-14 20:00–21:00` | `ssp-gamma`                          | +120ms latency rise capped at 430ms (`if(lat > 430, lat, least(lat + 120, 430))`). p95 reaches 430ms with **0 status changes** (evaluates agent's ability to reject non-breaching latency spikes). |
| `confounder-set-top-box-errors`                 | Confounder       | `2026-08-12 08:00–12:00` | `device_class = 'set_top_box'`       | 3% hard error flip (`stitch_status = 'ERROR'`), latency untouched. Tests distinguishing slate from auction transport errors.                                                                       |
| `negative-control-diffuse-primetime`            | Negative Control | `2026-08-09 19:00–23:00` | Window-wide (all cohorts)            | Uniform mild latency addition (+40ms to +70ms). Slate rate rises mildly to 2.91% across all slices without cohort concentration. Expected conclusion: silence.                                     |
| `variant-ssp-delta-mobile-h264-black-screen`    | Positive Variant | `2026-08-16 10:00–12:00` | `ssp-delta` × `mobile` × `h264`      | Deterministic latency ramp produces 98.98% unmonetized traffic across 40 cues and is represented by the synthetic black-screen stream.                                                             |

## Important: One-Way Mutation & Reset

Injection mutates rows in-place within their respective daily partition (`IN PARTITION 'YYYYMMDD'`).
For the local Compose dataset, resetting the volume is the supported full reset. **This permanently
deletes the stack's stored database and ledger.** Back up anything needed first; do not use this as
routine troubleshooting. It is not a reset procedure for ClickHouse Cloud.

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d clickhouse mcp-clickhouse incident-injector
```

> [!WARNING]
> **Crash-Window Hazard:** `apply()` executes the synchronous partition mutation (`mutations_sync: 2`) and immediately records the completion in `ghostslate_eval.injected_incidents`. If the process is terminated in the millisecond window between mutation completion and ledger write, a subsequent run could re-apply the mutation. In that event, do not re-run blindly; inspect `ghostslate_eval.injected_incidents` or reset the volume.

## Usage

Run from the repository root with the database already seeded. Export `CLICKHOUSE_HOST`,
`CLICKHOUSE_PORT`, `CLICKHOUSE_ADMIN_USER`, `CLICKHOUSE_ADMIN_PASSWORD`, and `CLICKHOUSE_SECURE`
for the target. The script does not load `.env` itself. Use the [Cloud setup guide](../../infra/README.md#seed-clickhouse-cloud)
for secure ports and ordering. The Compose injector receives its environment automatically.

```bash
# Set up the virtual environment with Python 3.13 installed
python3.13 -m venv tools/generator/.venv
tools/generator/.venv/bin/pip install -r tools/generator/requirements.txt

# Inspect the generated ALTER UPDATE statements (runs offline without connecting)
tools/generator/.venv/bin/python tools/generator/inject.py --dry-run

# Apply all pending incident mutations
tools/generator/.venv/bin/python tools/generator/inject.py

# Check status of injected incidents in ledger
tools/generator/.venv/bin/python tools/generator/inject.py --status

# Repair or re-record ledger entries without touching telemetry
tools/generator/.venv/bin/python tools/generator/inject.py --repair-ledger
```

## SQL Integrity Checks

Verify incident integrity using the canonical assertion file (after injection). Baseline assertions
must run before mutation; their healthy-data expectations do not describe the injected dataset.
Use the configured local admin password rather than assuming an unchanged default:

```bash
docker exec -i ghostslate-clickhouse clickhouse-client \
  --password "$CLICKHOUSE_ADMIN_PASSWORD" \
  --multiquery < sql/checks/004-incident-assertions.sql
```
