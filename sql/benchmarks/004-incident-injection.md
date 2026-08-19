# Incident Mutation Benchmarks & Ground Truth Ledger (Block 2 / Day 4)

Measured against the canonical 101.4M-row dataset running on ClickHouse Server 24.8.
All mutations execute with `IN PARTITION 'YYYYMMDD'` and `mutations_sync = 2` (synchronous partition mutation).

---

## 1. Incident Mutation Wall-Clock Timings

| Incident ID                                     | Target Partition | Cohort / Scope                       | Mutation Wall Time | Affected Rows in Window |
| :---------------------------------------------- | :--------------- | :----------------------------------- | :----------------- | :---------------------- |
| `primary-ssp-beta-ctv-hevc`                     | `20260814`       | `ssp-beta` × `connected_tv` × `hevc` | **168 ms**         | 60,862 rows (80 cues)   |
| `confounder-ssp-gamma-slow-but-inside-deadline` | `20260814`       | `ssp-gamma`                          | **328 ms**         | 56,239 rows             |
| `confounder-set-top-box-errors`                 | `20260812`       | `device_class = 'set_top_box'`       | **93 ms**          | 46,403 rows             |
| `negative-control-diffuse-primetime`            | `20260809`       | Window-wide (all cohorts)            | **191 ms**         | 923,879 rows            |

---

## 2. Injected Incidents Summary & Metrics

### 1. Primary Root Cause: `primary-ssp-beta-ctv-hevc`

- **Window (UTC):** `2026-08-14 19:00:00` → `2026-08-14 23:00:00` (4h primetime)
- **Cohort:** `ssp-beta` × `connected_tv` × `hevc`
- **Mechanism:** `+1150ms` sinusoidal ramp with deterministic `cityHash64` per-row jitter. Breaches the 450ms slate threshold and 1200ms timeout threshold.
- **Observed Metrics in Window:**
  - Slate fallback rate: **59.98%** (baseline was ~2.53%)
  - Timeout rate: **37.75%** (baseline was ~0.43%)
  - Total degradation (`SLATE_FALLBACK` + `TIMEOUT`): **97.73%**
  - Latency p95: **1,812 ms** (baseline was 358 ms)
  - Sibling cohort maximum degradation in window: **3.39%** (overwhelming ~28x signal-to-noise ratio)
  - Small sample guard: **80 distinct cues** (`cues >= 20` threshold comfortably cleared)

### 2. Confounder A (Latency Spike Without Slate): `confounder-ssp-gamma-slow-but-inside-deadline`

- **Window (UTC):** `2026-08-14 20:00:00` → `2026-08-14 21:00:00` (1h co-occurring with primary)
- **Cohort:** `ssp-gamma`
- **Mechanism:** Latency increased by up to +120ms, clamped at 430ms (`SLATE_THRESHOLD_MS - 20`).
- **Observed Metrics in Window:**
  - Latency p95: **430.00 ms** (elevated from 330.16 ms baseline)
  - Slate fallback rate: **2.13%** (identically matching baseline 2.13%)
  - Timeout rate: **0.36%** (identically matching baseline 0.36%)
  - Status changes: **0 rows** (tests agent's ability to reject latency spikes that do not breach SLA)

### 3. Confounder B (Ad-Call Hard Errors): `confounder-set-top-box-errors`

- **Window (UTC):** `2026-08-12 08:00:00` → `2026-08-12 12:00:00`
- **Cohort:** `device_class = 'set_top_box'`
- **Mechanism:** 3% deterministic flip to `stitch_status = 'ERROR'`, latency untouched.
- **Observed Metrics in Window:**
  - Error rate: **3.16%** (baseline was 0.14%)
  - Slate fallback rate: **1.80%** (flat, unaffected)
  - Latency p95: **312.42 ms** (untouched)

### 4. Negative Control (Diffuse Elevation): `negative-control-diffuse-primetime`

- **Window (UTC):** `2026-08-09 19:00:00` → `2026-08-09 23:00:00` (4h primetime)
- **Cohort:** Window-wide (no cohort concentration)
- **Mechanism:** Mild uniform latency addition (+40ms to +70ms) across all attempts in the window.
- **Observed Metrics in Window:**
  - Overall window slate rate: **2.91%** (elevated from 2.15% baseline)
  - Max slate rate across all 44 cohort slices: **4.11%** (all slices remain < 5.0%)
  - Slice delta distribution: All slices show mild uniform +0.4% to +1.3% delta with no outlier concentration. Correct agent conclusion is silence / no localized root cause.

---

## 3. Ground-Truth Answer Key Table

```sql
SELECT incident_id, kind, window_start, window_end, ssp_id, device_class, codec, expected_root_cause
FROM ghostslate_eval.injected_incidents FINAL;
```

The eval database `ghostslate_eval` is partitioned from `ghostslate` permissions so that `ghostslate_agent` cannot query the ground-truth table during runtime reasoning.
