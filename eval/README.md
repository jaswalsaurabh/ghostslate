# GhostSlate Evaluation Harness

Ground-truth incident cases for verifying the agent's analytical reasoning, tool-calling discipline, and negative control restraint.

## Evaluation Cases

1. **Incident Case 1 (Primary):** SSP auction latency breach causing slate fallback for specific device/codec cohort (`connected_tv` × `hevc`).
2. **Incident Case 2 (Confounder Isolation):** Benign regional latency blip vs true systemic auction failure.
3. **Negative Control:** Incident-free window where the agent must decline to assert a root cause and confirm normal operations.

## Correctness Properties Asserted

- Grounding rule: every figure cited traces to ClickHouse telemetry.
- Small-sample suppression: no cause reported when sample size `cues < 20`.
- Restraint: no hallucinated root cause on negative control.
