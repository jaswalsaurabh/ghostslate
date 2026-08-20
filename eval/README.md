# GhostSlate Evaluation Harness

This directory contains five narrow evaluation cases for the diagnosis decisions that matter to the submission. The Vitest harness replays captured evidence offline; it does not call Gemini, MCP, or ClickHouse during the test suite.

## Case Matrix

The machine-readable matrix is [`cases.json`](./cases.json).

| Case                           | UTC window             | Expected business outcome                                                                                                 |
| ------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `primary-incident`             | 2026-08-14 19:00–23:00 | Select `ssp-beta × connected_tv × hevc`; attribute exactly **$1,933.17** using the captured frame.                        |
| `latency-confounder-isolation` | 2026-08-14 20:00–21:00 | Keep `ssp-gamma` at 430ms below the 450ms deadline and select `ssp-beta`; verify **$555.43** arithmetic only.             |
| `stb-error-confounder`         | 2026-08-12 08:00–12:00 | Select no incident. Hard `ERROR` injection is setup data, not an unmonetized impression.                                  |
| `negative-control`             | 2026-08-09 19:00–23:00 | Select no incident and publish no root cause or loss.                                                                     |
| `small-sample-guard`           | 2026-08-14 19:00–19:15 | Preserve observed traffic (5 cues, 61,405 attempts), reject all cohorts below 20 cues, and publish insufficient evidence. |

## Evidence Provenance

### Immutable historical captures

These JSONL files are normalized records of live Gemini → official `mcp-clickhouse` → ClickHouse runs captured before the small-sample correction:

- `transcript-primary-incident.jsonl`
- `transcript-negative-control.jsonl`
- `transcript-stb-error-confounder.jsonl`

Their reasoning, timestamps, tool order, tool failures, and diagnoses are preserved. Normalization converts SSE data events to one JSON object per line and removes only binary `frameBase64` data. In particular, the control traces retain their real denied vision calls. They are evidence of the behavior at capture time, not proof of later prompt ordering or vision optimizations.

### Small-sample captures

- `transcript-small-sample-guard-failed.jsonl` preserves the original failed empirical run. Gemini asserted an exploratory anomaly after canonical evidence returned no eligible rows, although the server-owned final diagnosis stayed nominal.
- `sse-small-sample-guard-2026-08-20.sse` is the byte-for-byte live SSE recapture (SHA-256 `96f627319c1d686bb90a210663f3fb34ade9873bc02be1b2c6588575ed0f53a8`).
- `transcript-small-sample-guard-2026-08-20.jsonl` is the mechanically derived offline replay of that SSE stream. It queried 5 cues and 61,405 attempts, received an empty canonical result, and finalized with insufficient qualifying evidence on turn 6. The trace also preserves its first premature finalization attempt and the server rejection that caused Gemini to self-correct.

Neither capture has been rewritten to improve reasoning or tool order.

### Canonical-only latency case

`canonical-latency-confounder-2026-08-14.json` is a ClickHouse canonical response with no agent transcript or captured frame. The harness uses it only to verify cohort selection, the 430ms deadline comparison, and loss arithmetic. It does not render or approve a publishable positive diagnosis.

The set-top-box `ERROR` condition remains part of the generator and SQL answer-key setup. The eval harness deliberately checks only the relevant product decision: the captured canonical rows must not select an incident. There is no separately hand-shaped MCP response artifact.

## What the Offline Harness Checks

- Every configured transcript contains exactly one successful `collect_diagnosis_evidence` result, and that transcript result is its sole canonical evidence source.
- Every captured run eventually finalizes successfully within the 15-turn budget.
- The primary run contains schema discovery, successful exploratory SQL, a real captured slate frame, the expected cohort, a grounded diagnosis, and exact $1,933.17 loss.
- The latency-only case proves `ssp-gamma` reaches 430ms without crossing the 450ms deadline and is not selected.
- The set-top-box and negative-control cases select no incident.
- The small-sample run proves nonzero raw activity, zero canonical eligible rows, and the deterministic insufficient-evidence diagnosis with no root cause, dollar loss, or reroute.

The harness does not police model prose, impose synthetic tool ordering, compare transcripts with duplicate snapshots, or test SSE transport glue.

## Run

```bash
pnpm --filter server test test/eval-harness.test.ts
```

The full repository suite remains:

```bash
pnpm test
```
