# GhostSlate Live Gemini → MCP → ClickHouse Verification Record

**Date:** 19 August 2026  
**Status:** Verified & Empirically Grounded  
**Scope:** Real runtime verification of Google Gemini 2.5 Flash via Vertex AI, the official `mcp-clickhouse` 0.4.1 SSE server, ClickHouse Server 24.8 (101.4M rows), and ffmpeg visual frame extraction.

> **Note on Artifact Structure:** This document is a human-readable summary of the live verification runs. Complete, lossless machine-readable response payloads are stored alongside this document in [`evidence/`](evidence/):
>
> - [`live-positive-canonical-response-2026-08-19.json`](evidence/live-positive-canonical-response-2026-08-19.json) (complete 44-row positive canonical MCP response)
> - [`live-negative-canonical-response-2026-08-19.json`](evidence/live-negative-canonical-response-2026-08-19.json) (complete 44-row negative canonical MCP response)
> - [`live-self-correction-2026-08-19.jsonl`](evidence/live-self-correction-2026-08-19.jsonl) (exact malformed query, ClickHouse error, schema inspection, and corrected query trace)
>
> These linked payloads provide the exact raw data required for independent recomputation of incident selection and loss attribution.

---

## 1. Environment Identity & Runtime Configuration

All commands executed on the evaluation host; all timestamps in UTC.

```bash
$ git rev-parse HEAD
56159688f193ba2c89e8b8623a2dc6667c228e4e

$ docker compose -f infra/docker-compose.yml images
CONTAINER                   REPOSITORY                          TAG          PLATFORM     IMAGE ID      SIZE    CREATED
ghostslate-clickhouse       clickhouse/clickhouse-server        24.8-alpine  linux/arm64  b002e56ed5c1  143MB   23 hours ago
ghostslate-mcp-clickhouse   ghcr.io/clickhouse/mcp-clickhouse   <none>       linux/arm64  f4d9f1502a14  81.7MB  24 hours ago

$ docker exec ghostslate-clickhouse clickhouse-client --query "SELECT version()"
24.8.14.39
```

### Runtime Parameters (No Credentials Recorded)

- **Gemini Model:** `gemini-2.5-flash`
- **Inference Runtime:** Google Cloud Vertex AI
- **Vertex AI Region:** `us-central1`
- **MCP Server:** `ghcr.io/clickhouse/mcp-clickhouse@sha256:f4d9f1502a14a98fd17f3ecf8654bd102ba5b1a5bde86e54a9579ed8871ef8d7` (v0.4.1)
- **MCP Protocol Transport:** Server-Sent Events (SSE) on port 8000
- **ClickHouse Server:** ClickHouse 24.8.14.39 Alpine Container (101.4M synthetic SCTE-35 and SSAI telemetry rows)
- **Target Channel:** `ch-01`
- **Primary Incident Window:** `2026-08-14T19:00:00.000Z` to `2026-08-14T23:00:00.000Z` (UTC)
- **Negative Control Window:** `2026-08-09T19:00:00.000Z` to `2026-08-09T23:00:00.000Z` (UTC)

---

## 2. Positive Incident Investigation Transcript

### A. Investigation Input

- **Channel:** `ch-01`
- **Window (UTC):** `2026-08-14T19:00:00.000Z` to `2026-08-14T23:00:00.000Z`
- **Prompt:** _"We observed a sudden spike in slate fallback fill rate on channel ch-01 during primetime. Investigate whether an SSAI degradation occurred, isolate the offending cohort, visually inspect the stream, collect authoritative evidence, and finalize the diagnosis."_

### B. Turn-by-Turn Execution Trace

#### Turn 1 — Schema Discovery

- **Reasoning / Working Hypothesis:** _"I will begin by inspecting the available tables to understand their structure and then query for baseline SCTE-35 cue events and SSAI stitch attempts on `ch-01` within the specified incident window to establish a baseline for further analysis."_
- **Tool Call #1:** `list_tables({"database": "ghostslate"})`
- **Tool Result:**
  ```json
  {
    "tables": [
      { "database": "ghostslate", "name": "advertiser_inventory", "engine": "MergeTree" },
      { "database": "ghostslate", "name": "scte35_cue_events", "engine": "MergeTree" },
      { "database": "ghostslate", "name": "slate_observations", "engine": "MergeTree" },
      { "database": "ghostslate", "name": "ssai_stitch_attempts", "engine": "MergeTree" }
    ]
  }
  ```
- **Duration:** 37 ms | **Error:** false

#### Turn 2 — Baseline Volume Validation

- **Reasoning / Working Hypothesis:** _"Now that I have the table schemas, I will query the `scte35_cue_events` and `ssai_stitch_attempts` tables to get a baseline count of events for `ch-01` within the incident window."_
- **Tool Call #2:** `run_query`
  ```sql
  SELECT count() FROM ghostslate.scte35_cue_events
  WHERE channel_id = 'ch-01'
    AND cue_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
    AND cue_time <= toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
  ```
  - **Tool Result:** `{"columns": ["count()"], "rows": [[81]]}` | **Duration:** 27 ms
- **Tool Call #3:** `run_query`
  ```sql
  SELECT count() FROM ghostslate.ssai_stitch_attempts
  WHERE channel_id = 'ch-01'
    AND attempt_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
    AND attempt_time <= toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
  ```
  - **Tool Result:** `{"columns": ["count()"], "rows": [[922684]]}` | **Duration:** 18 ms

#### Turn 3 — Temporal Correlation & Cohort Isolation (ASOF JOIN)

- **Reasoning / Working Hypothesis:** _"I will now correlate SCTE-35 cue events with SSAI stitch attempts for `ch-01` within the incident window. I'll group the results by `ssp_id`, `device_class`, and `codec` to identify cohorts. For each cohort, I will calculate the total number of cues, the total number of stitch attempts, and the unmonetized rate (SLATE_FALLBACK + TIMEOUT). I will filter for cohorts with at least 20 cues and order by the unmonetized rate to detect any anomalies."_
- **Tool Call #4:** `run_query`
  ```sql
  SELECT
      s.channel_id,
      s.ssp_id,
      s.device_class,
      s.codec,
      count(DISTINCT c.splice_event_id) AS cues,
      count() AS total_stitch_attempts,
      (countIf(s.stitch_status = 'SLATE_FALLBACK') + countIf(s.stitch_status = 'TIMEOUT')) AS unmonetized_attempts,
      (countIf(s.stitch_status = 'SLATE_FALLBACK') + countIf(s.stitch_status = 'TIMEOUT')) * 100.0 / count() AS unmonetized_rate
  FROM
      ghostslate.ssai_stitch_attempts AS s
  ASOF LEFT JOIN
      ghostslate.scte35_cue_events AS c ON s.channel_id = c.channel_id AND s.splice_event_id = c.splice_event_id AND s.attempt_time >= c.cue_time
  WHERE
      s.channel_id = 'ch-01'
      AND s.attempt_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
      AND s.attempt_time <= toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
  GROUP BY
      s.channel_id,
      s.ssp_id,
      s.device_class,
      s.codec
  HAVING
      cues >= 20
  ORDER BY
      unmonetized_rate DESC
  ```
- **Tool Result:**
  - **Rows Returned:** 44 cohorts | **Duration:** 67 ms
  - **Top Cohort:** `ssp-beta` × `connected_tv` × `hevc` (cues: 80, total_attempts: 60,862, unmonetized: 59,482, unmonetized_rate: **97.73%**)
  - **Sibling Cohorts:** 1.90% to 3.39% unmonetized.

#### Turn 4 — Anomaly Pinpointing

- **Reasoning / Working Hypothesis:** _"I have identified a significant anomaly: the cohort `ch-01`, `ssp-beta`, `connected_tv`, `hevc` exhibits an unmonetized rate of 97.73%. To visually confirm this SSAI degradation, I will now find a specific `SLATE_FALLBACK` event within this cohort and incident window, and then use `classify_frame` to inspect the video at that timestamp for slate bleed."_
- **Tool Call #5:** `run_query`
  ```sql
  SELECT attempt_time
  FROM ghostslate.ssai_stitch_attempts
  WHERE channel_id = 'ch-01'
    AND ssp_id = 'ssp-beta'
    AND device_class = 'connected_tv'
    AND codec = 'hevc'
    AND stitch_status = 'SLATE_FALLBACK'
    AND attempt_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
    AND attempt_time <= toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
  ORDER BY attempt_time ASC
  LIMIT 1
  ```
- **Tool Result:** `{"columns": ["attempt_time"], "rows": [["2026-08-14 19:00:00.100000"]]}` | **Duration:** 41 ms

#### Turn 5 — Visual Frame Classification (`classify_frame`)

- **Reasoning / Working Hypothesis:** _"I have identified a `SLATE_FALLBACK` event at `2026-08-14 19:00:00.100000` UTC for the anomalous cohort. To visually confirm the slate bleed, I will use `classify_frame` with `slate.mp4` and a timestamp of `0.1` seconds, as this timestamp falls within the incident window and represents the start of a potential slate display."_
- **Vision Call #6:** `classify_frame({"video_file": "slate.mp4", "timestamp_seconds": 0.1})`
- **Structured Vision Outcome:**
  ```json
  {
    "classification": "slate",
    "confidence": 0.98,
    "slate_type": "looping_card",
    "text_detected": "We'll be right back",
    "visual_summary": "Dark blue background with a dashed pink border. A red pill-shaped box at the top says 'COMMERCIAL BREAK IN PROGRESS'. Below it, large white text reads 'We'll be right back', followed by smaller white text 'Coverage will resume shortly'."
  }
  ```

#### Turn 6 — Canonical Evidence Collection (`collect_diagnosis_evidence`)

- **Reasoning / Working Hypothesis:** _"Visual confirmation of slate bleed has been achieved for the anomalous cohort. I will now proceed to collect authoritative server-rendered evidence by calling `collect_diagnosis_evidence` to prepare for the final diagnosis."_
- **Tool Call #7:** `collect_diagnosis_evidence({})`
- **Rendered Server SQL Executed via MCP:**
  ```sql
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
      WHERE s.attempt_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC') AND s.attempt_time < toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')
        AND s.channel_id = 'ch-01'
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
  ```
- **Tool Result:** 44 cohort rows returned | **MCP Wall Time:** 86 ms
  - **Top Cohort Latency:** `1812.789794921875 ms` in captured canonical response payload. (Note: the initial query benchmark in `sql/benchmarks/005-query-correctness.md` and the original Gemini run recorded `1812.57 ms` as quoted in Turn 7 below; the captured evidence payload comes from a later canonical rerun. `quantileTDigest` is an approximate streaming quantile algorithm that produces minor floating-point variations across executions. Both round to `1813 ms` in the final grounded diagnosis).
- **Complete Payload Reference:** See [`evidence/live-positive-canonical-response-2026-08-19.json`](evidence/live-positive-canonical-response-2026-08-19.json) for all 44 rows.

#### Turn 7 — Finalization & Server-Rendered Diagnosis

- **Reasoning / Working Hypothesis:** _"I have collected the authoritative evidence, which confirms the severe unmonetized rate (97.73%) for the `ch-01`, `ssp-beta`, `connected_tv`, `hevc` cohort, directly linked to auction timeouts (p95 latency of 1812.57ms). I will now finalize the investigation to publish this diagnosis."_
- **Tool Call #8:** `finalize_investigation({})`
- **Result:** Gemini completed its reasoning and called `finalize_investigation` in turn 7. The server then rendered the deterministic diagnosis from the canonical evidence snapshot.

### C. Server-Rendered Diagnosis Output

```markdown
### Forensic Investigation Diagnosis

**Target Channel:** `ch-01` | **Investigation Window:** `2026-08-14T19:00:00.000Z` to `2026-08-14T23:00:00.000Z` (UTC)

**Root Cause Cohort:** `ssp-beta` on device class `connected_tv` (codec `hevc`) during `primetime`

**Telemetry Analysis:**

- Cues analyzed: 80
- Total stitch attempts: 60,862
- Unmonetized impressions (slate fallbacks + timeouts): 59,482 (97.73%)
- Measured p95 auction latency: 1813ms (exceeding the 450ms stitcher deadline; exceeding the 1200ms hard auction timeout threshold)

**Visual Confirmation:**

- On-air stream verification: Frame classified as 'slate' at 0.1s with 98% confidence; slate type: looping card.

**Financial Loss Attribution:**

- Estimated revenue loss in window: $1,933.17 (contracted CPM rate: $32.50).

**Operational Remediation Proposal:**

- Immediately reroute SSAI ad requests away from ssp-beta for connected_tv (hevc) traffic to restore monetization and eliminate on-air slate bleed.
```

- **Grounding Report:** `{"grounded": true, "violations": [], "checkedClaims": 11}`
- **Total Gemini Reasoning Turns:** 7 (Budget: 15)
- **Total Tool Calls:** 8

---

## 3. Negative Control Investigation Transcript

### A. Investigation Input

- **Channel:** `ch-01`
- **Window (UTC):** `2026-08-09T19:00:00.000Z` to `2026-08-09T23:00:00.000Z`
- **Prompt:** _"Investigate channel ch-01 telemetry during the 2026-08-09 primetime window to check if any localized SSAI incident or slate bleed occurred."_

### B. Turn-by-Turn Execution Trace

- **Turn 1 (Schema Discovery):** Called `list_tables` → 4 tables discovered (33 ms).
- **Turn 2 (Baseline Counts):**
  - Cues: 81 (inclusive query)
  - Attempts: 923,879
- **Turn 3 (Cohort Scan via ASOF):**
  - Queried 44 cohorts with `HAVING cues >= 20`.
  - Max unmonetized cohort was `ssp-beta` × `mobile` × `av1` at **4.60%** (150 unmonetized / 3,259 attempts; p95 latency 433 ms).
  - Breaching cohorts ($\ge 20\%$ unmonetized): **0 cohorts**.
- **Turn 4 (Visual Frame Probe):**
  - Gemini probed `slate.mp4` at 5s.
- **Turn 5 (Canonical Evidence Collection):**
  - Executed `collect_diagnosis_evidence` for negative window (`2026-08-09 19:00:00` to `23:00:00`).
  - Decoded 44 cohorts. `selectIncidentCohort(rows)` returned `null` (no cohort breached $\ge 20\%$ failure threshold or $\ge 15\text{pp}$ peer dispersion).
  - **Complete Payload Reference:** See [`evidence/live-negative-canonical-response-2026-08-19.json`](evidence/live-negative-canonical-response-2026-08-19.json) for all 44 rows.
- **Turn 6 (Finalization):**
  - Gemini called `finalize_investigation({})` in turn 6.
  - Server rendered deterministic negative control diagnosis.

### C. Server-Rendered Negative Control Diagnosis

```markdown
### Forensic Investigation Diagnosis

**Target Channel:** `ch-01` | **Investigation Window:** `2026-08-09T19:00:00.000Z` to `2026-08-09T23:00:00.000Z` (UTC)

**Findings:**
Telemetry analysis across all cohorts in this window confirms that no isolated cohort breached the 20.0% unmonetized failure threshold with >=15.0pp cohort dispersion over peers (with cues >= 20).

**Conclusion:**
Observed telemetry is consistent with nominal baseline traffic and diffuse platform noise. No isolated root cause, on-air slate bleed, or financial loss is asserted.

**Operational Remediation Proposal:**

- No remediation action required for this window.
```

- **Grounding Report:** `{"grounded": true, "violations": [], "checkedClaims": 3}`
- **Negative Control Properties:**
  - Selected Incident Cohort: `null`
  - Financial Loss Claim: **No financial loss asserted** (contains no `$0.00` and no dollar amount)
  - Remediation Action: No action required
  - Total Gemini Turns: 6 (< 15)

---

## 4. Query Error Handling & Self-Correction Verification

Empirically verified that Gemini recovers from malformed ClickHouse queries through MCP without human intervention:

- **Complete Event Log:** See [`evidence/live-self-correction-2026-08-19.jsonl`](evidence/live-self-correction-2026-08-19.jsonl) for the exact tool calls and ClickHouse error payloads.

```text
Turn 1: Gemini queries legacy/misspelled table 'ghostslate.ssai_stitches_raw'
  → MCP returns ClickHouse error: UNKNOWN_TABLE (Table ghostslate.ssai_stitches_raw does not exist)
Turn 2: Gemini inspects schema via list_tables({"database": "ghostslate"})
  → MCP returns valid table list including ssai_stitch_attempts
Turn 3: Gemini corrects query to valid table ssai_stitch_attempts
  → Query executes successfully (922,684 attempts returned)
Turn 4-6: Gemini proceeds normally to classify_frame, collect_diagnosis_evidence, and finalize_investigation
```

---

## 5. Rows-Read Provenance & Metrics Resolution

`mcp-clickhouse` 0.4.1 returned 44 cohort rows and exposed no `rows_read` statistic. The application therefore omitted the rows-scanned badge for this call.

| Metric                 | Value                                            | Provenance                                                                                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rows Returned          | 44 cohorts                                       | Live `mcp-clickhouse` 0.4.1 response payload                                                                                                                                                                                                                                                             |
| MCP Query Wall Time    | **86 ms** (0.086s)                               | Application SSE duration around `callTool('run_query', ...)`                                                                                                                                                                                                                                             |
| Direct Server Duration | **44 ms**                                        | Direct ClickHouse execution benchmark (`system.query_log`)                                                                                                                                                                                                                                               |
| Rows Read              | 954,325                                          | Direct ClickHouse benchmark (`system.query_log`); **unavailable** in MCP 0.4.1 response                                                                                                                                                                                                                  |
| Bytes Read             | 19.00 MiB (19,925,484 bytes)                     | Direct ClickHouse benchmark (`system.query_log`); **unavailable** in MCP 0.4.1 response                                                                                                                                                                                                                  |
| p95 Auction Latency    | **1812.789794921875 ms** (rounds to **1813 ms**) | Captured in live canonical rerun payload [`evidence/live-positive-canonical-response-2026-08-19.json`](evidence/live-positive-canonical-response-2026-08-19.json) (earlier benchmark and original Gemini run recorded `1812.57 ms`; variation is from `quantileTDigest` approximate quantile estimation) |
| Grounded Loss          | **$1,933.17**                                    | 59,482 unmonetized impressions × $32.50 CPM / 1,000 = $1,933.165 → **$1,933.17**                                                                                                                                                                                                                         |

---

## 6. 81-vs-80 SCTE-35 Cue Count Discrepancy Resolution

The exploratory baseline query reported **81 cues** while the canonical diagnosis reported **80 cues**. The root cause was identified through direct ClickHouse analysis:

```sql
-- Inclusive boundary (<= 23:00:00.000) includes the exact 23:00 boundary cue (event 12941)
SELECT count(DISTINCT splice_event_id) FROM ghostslate.scte35_cue_events
WHERE channel_id = 'ch-01'
  AND cue_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
  AND cue_time <= toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC');
-- Result: 81

-- Canonical half-open interval (< 23:00:00.000) strictly covers [19:00, 23:00)
SELECT count(DISTINCT splice_event_id) FROM ghostslate.scte35_cue_events
WHERE channel_id = 'ch-01'
  AND cue_time >= toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')
  AND cue_time < toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC');
-- Result: 80 (event 12941 at 2026-08-14 23:00:00.000 belongs to the subsequent 23:00 window)
```

**Resolution:**
In accordance with `AGENTS.md` §Time ("Every timestamp is UTC everywhere except the moment it is rendered"), the system prompt **instructs Gemini** to use half-open UTC intervals (`timestamp >= from AND timestamp < to`) and avoid `BETWEEN` or `<=` boundary conditions in exploratory SQL. The canonical server query strictly enforces this half-open interval.

---

## 7. Redaction Audit & Verification

A manual review of all tracked documents, scripts, and machine-readable evidence files ([`live-positive-canonical-response-2026-08-19.json`](evidence/live-positive-canonical-response-2026-08-19.json), [`live-negative-canonical-response-2026-08-19.json`](evidence/live-negative-canonical-response-2026-08-19.json), [`live-self-correction-2026-08-19.jsonl`](evidence/live-self-correction-2026-08-19.jsonl)) verified that zero authorization headers, bearer tokens, passwords, private keys, service-account JSON payloads, or credential paths are present.

---

## 8. Phase 2 Visual Binding & Neutral Synthetic Slate Retest (19 Aug 2026)

### A. Scenario-to-Media Mapping Enforcement

Per `AGENTS.md` Single Ownership discipline, `InvestigationToolService` enforces scenario-bound visual evidence against the active `InvestigationContext`:

- **Primary Incident Window (`ch-01` | `2026-08-14 19:00:00` to `23:00:00` UTC):** Bound to the neutral synthetic `slate.mp4` fixture within `[0, 15)` seconds. Any timestamp within this range is accepted.
- **Unrelated Media & Windows:** Calls specifying non-mapped media (e.g. `content.mp4`, `ad.mp4`, or random filenames) or calls made during unmapped negative control windows (`2026-08-09T...`) are rejected with a structured tool error without invoking Gemini vision.
- **Scope Discipline:** This is scenario-bound evidence for the single scoped demo (ensuring the model inspects the permitted scenario asset), not enforcement that a particular exploratory telemetry row was queried first.
- **Finalization Invariants:** If canonical telemetry detects an incident cohort, `finalize_investigation` strictly requires prior on-air slate confirmation. If no incident is detected, finalization succeeds without vision.

### B. Empirical Neutral Slate Classification Outcome

The synthetic demo card was updated to eliminate all diagnostic text (`FORENSIC ALERT: SSAI SLATE BLEED DETECTED`, SSP names, or failure rates), replaced by standard broadcast continuity typography (`COMMERCIAL BREAK IN PROGRESS`, `We'll be right back`, `Coverage will resume shortly`).

Live Gemini 2.5 Flash classification against the regenerated neutral asset:

```json
{
  "classification": "slate",
  "confidence": 0.99,
  "slate_type": "looping_card",
  "text_detected": "We'll be right back",
  "visual_summary": "A dark blue screen with a dashed purple border. In the center, there's a purple pill-shaped button with 'COMMERCIAL BREAK IN PROGRESS' in white text. Below it, in large white text, is 'We'll be right back', followed by 'Coverage will resume shortly' in smaller white text. At the bottom, there's another dark grey pill-shaped button with 'GhostSlate Network Feed • FAST-01' in white text.",
  "contentHash": "e80dab32367521be22917984b89f1fcdb8039d145bebcb8a1091ed0560a4bd5b",
  "cached": false,
  "timestampSeconds": 5
}
```
