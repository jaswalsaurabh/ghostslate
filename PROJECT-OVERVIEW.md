# GhostSlate — project overview

GhostSlate helps broadcast and advertising operations teams investigate ad breaks where viewers
see filler instead of paid advertisements. Playback can remain healthy while ad delivery fails.
The product connects delivery records, visual confirmation, and calculated financial exposure so
an operator can review a targeted response.

For the nontechnical introduction and terminology, start with the [README](README.md).
This document records the current engineering scope, not a promise of a deployed production system.

## 1. Problem and audience

The primary user is an ad-operations or broadcast analyst investigating suspected lost ad revenue
on a FAST channel (free ad-supported streaming television). Server-side ad insertion (SSAI) uses
SCTE-35 cues to mark breaks; a stitcher inserts the chosen ad. When a supplier responds too late,
the stream can fall back to a slate while playback-availability checks remain healthy.

The logs contain useful clues, but do not by themselves show the viewer's screen. GhostSlate asks
which supplier/device/codec group failed, checks a scenario-mapped frame, and values the missed
opportunities using queried rate cards. The operator receives evidence and a proposal, not an
automatic change to an advertising system.

## 2. Demonstrated outcome

The primary **synthetic** incident selects `ssp-beta × connected_tv × hevc` over
`2026-08-14T19:00:00.000Z` to `2026-08-14T23:00:00.000Z`. Captured evidence contains 80 distinct
cues, 60,862 attempts, and 59,482 unmonetized opportunities (97.73%). The queried CPM of $32.50
produces $1,933.17 exposure, rounded to cents.

These are demo measurements, not customer losses or recovered revenue. The negative control
produces no isolated cause or dollar claim. The sparse window preserves observed traffic while
declining attribution. See [evaluation evidence](eval/README.md) for all six cases and capture dates.

## 3. Scope

| Implemented                                         | Outside the current demo                                |
| --------------------------------------------------- | ------------------------------------------------------- |
| One channel and six server-owned scenarios          | Arbitrary live channels or uploaded footage             |
| One primary failure mechanism: late ad responses    | Encoder cue-drift diagnosis                             |
| Holding-card and black-screen positive variants     | Continuous visual anomaly discovery                     |
| Supplier/device/codec isolation with evidence gates | A general observability platform                        |
| Scenario-bound visual confirmation                  | Exact telemetry-event-to-frame synchronization          |
| Rate-card-based financial exposure                  | Billing reconciliation or measured savings              |
| Local mock approval; proposal review in production  | Real ad rerouting or authenticated production approvals |
| In-memory replay and evidence export                | Durable or cross-instance investigation storage         |

The six scenarios exercise the same narrow diagnosis path, including misleading latency, hard
errors, clean traffic, and insufficient evidence. They do not introduce six unrelated failure modes.

## 4. Investigation flow and ownership

1. The operator selects a scenario and submits its prompt. The server owns the channel, UTC window,
   media mapping, and permitted frame timestamp.
2. Gemini reasoning on Vertex AI calls `list_tables` and `run_query` through official
   `mcp-clickhouse` for schema discovery and exploratory SQL.
3. `collect_diagnosis_evidence` runs the server-rendered canonical SQL through the same MCP server.
4. For a qualifying incident, `classify_frame` extracts the mapped sample with ffmpeg and calls
   Gemini vision. The returned pixels and classification appear in the trace; no observation row
   is written to ClickHouse.
5. Gemini requests finalization. The server checks canonical evidence and visual confirmation,
   selects the incident, computes financial exposure, and renders the final answer.
6. The UI receives results through SSE and offers evidence export and proposal review. Local
   approval emits an in-memory/log mock event; production rejects approval emission.

Exploratory tool order can vary. The server's finalization gates, not a fixed model script, protect
the published diagnosis. Dashboard figures use the same evidence events, not direct database reads.

Business figures derive from queried telemetry and rate cards. Visual confidence and sample time
come from the vision result and scenario mapping; decision thresholds come from server constants.
Those sources must remain distinguishable. The offline harness checks deterministic decisions and
captured evidence; it does not certify every sentence of exploratory model prose.

## 5. Data model and query correctness

The canonical schema lives in [sql/schema](sql/schema/), with these application tables:

| Table                  | Current purpose                                                             |
| ---------------------- | --------------------------------------------------------------------------- |
| `scte35_cue_events`    | Ad-break markers and expected duration.                                     |
| `ssai_stitch_attempts` | Per-viewer delivery attempts, supplier, device, codec, status, and latency. |
| `advertiser_inventory` | Seeded CPM and fill-target values by UTC pricing period.                    |
| `slate_observations`   | Schema present; not populated by the current vision service.                |

`ghostslate_eval.injected_incidents` holds the injector ledger in a separate database outside the
agent's read permission. All stored timestamps and investigation comparisons are UTC.

### ASOF JOIN direction and the denominator

The production query puts **stitch attempts on the left** and matches each to its preceding cue by
channel, splice event, and time. That preserves viewer attempts. Putting cues on the left selects
only one attempt per cue and can hide failures among other viewers.

Count distinct splice events for the minimum-cue guard, but calculate the unmonetized percentage
across attempts. `SLATE_FALLBACK` and `TIMEOUT` contribute to that numerator; hard `ERROR` rows do
not. Use half-open windows (`>= from`, `< to`) to avoid counting a boundary cue twice.

The runnable definitions are [loss_attribution.sql](sql/queries/loss_attribution.sql) and
[slate_bleed_correlation.sql](sql/queries/slate_bleed_correlation.sql). Do not copy another executable
version here. The exploratory correlation threshold is not the final incident decision; that
decision belongs to [MetricsService](server/src/services/metrics.service.ts) and
[incident constants](server/src/services/incident.constants.ts).

Financial exposure is unmonetized impressions × queried CPM ÷ 1,000, rounded to cents by
`MetricsService`. Pricing-period boundaries are implemented in the loss query and documented in
the [SQL guide](sql/README.md).

## 6. Synthetic data and evidence

The baseline contains 101.4M delivery attempts over 30 days, generated inside ClickHouse. Python
applies deterministic incident mutations and records them in the ledger. The data includes benign
latency variation, unrelated hard errors, diffuse noise, and the two positive visual variants.
The bundled video clips are synthetic broadcast cards; no real broadcast footage is used.

The [generator guide](tools/generator/README.md) explains resets and the mutation/ledger crash
window. The [evaluation guide](eval/README.md) distinguishes immutable historical transcripts,
later recaptures, canonical fixtures, and offline replay tests.

The UI reports tool-call wall time and returned rows. Rows scanned appear only if MCP returns that
statistic. The pinned version's captures omit it; separate direct ClickHouse benchmarks must not be
presented as live MCP scan metrics. SQL benchmarks are not end-to-end investigation benchmarks.

## 7. Technology and infrastructure decisions

The application uses Node, TypeScript, Express, React, Vite, Tailwind, Zod, and Pino. Exact versions
belong to the package manifests and [workspace catalog](pnpm-workspace.yaml). Gemini reasoning and
vision use `@google/genai` with Vertex AI authentication. Official `mcp-clickhouse` is the agent's
only database path. No direct ClickHouse JavaScript client or Recharts dependency is currently used.

The runtime components are ClickHouse, official MCP, Vertex AI, Cloud Run, and ffmpeg. Local
development uses Compose for the database, MCP, and injector; a containerized app additionally needs
an ADC mount. Cloud Run hosts the API and built UI in one application container, with MCP separate.

For the public deployment described in [SECURITY.md](SECURITY.md), supporting resources have these
specific purposes:

| Resource                              | Reason within this scope                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Artifact Registry                     | Stores the application image that Cloud Run deploys.                                              |
| Secret Manager and service accounts   | Keep runtime credentials out of the browser, repository, and image.                               |
| Workload Identity Federation          | Lets GitHub deploy without a stored service-account key.                                          |
| HTTPS load balancer, certificate, DNS | Provide the public HTTPS edge while restricting direct Cloud Run access.                          |
| Cloud Armor                           | Required public-edge protection in the security policy; not provisioned by the current Terraform. |
| Terraform and its state bucket        | Reproduce and track the supporting cloud resources; not an application runtime service.           |

The checked-in DNS implementation uses Cloudflare; an equivalent DNS record can use another
provider. This complexity is confined to production provisioning, not required for local judging.
The deployment guide records bootstrap/networking gaps instead of claiming one-command cloud setup.

**One active application instance is the intended demo topology.** In-memory run state cannot
support transparent cross-instance replay. The current deployment workflow still permits three
instances; reconcile that before relying on hosted reconnect/deduplication guarantees. A
single-instance cap also does not make state durable across restarts or overlapping revisions.

No Redis or rollup table is justified by the demonstrated workload. Measured incident-window SQL
is already interactive; adding infrastructure merely to showcase it would increase setup risk.

## 8. Lessons learned

- Join direction matters: choosing one attempt per cue masked failures across viewer sessions.
- A slow supplier is not necessarily the culprit: compare failed delivery and healthy peer groups,
  not latency alone.
- An empty eligible result is not zero traffic: the small-sample case must decline attribution.
- Visible filler confirms the symptom, not the financial amount; telemetry and rate cards own that.
- Evidence provenance matters: model exploration, canonical queries, vision output, and historical
  benchmarks have different roles and must not be presented interchangeably.

## 9. Submission readiness

The [official rules](https://agentic-cinema.devpost.com/rules) govern submission; `AGENTS.md` also
contains stricter project-specific choices, including Cloud Run deployment and synthetic media.
The checklist below is not a claim that external submission work has been completed.

- [x] MIT license present and linked prominently.
- [x] Official MCP calls and Vertex AI reasoning/vision call sites present in the implementation.
- [x] Historical live-run evidence and six-case offline evaluation documented.
- [x] Synthetic data, media, limitations, technical choices, and lessons explained.
- [ ] Publish and verify the hosted project URL; add it to the README and submission form.
- [ ] Rehearse the cold-clone setup and all six hosted scenarios against the submitted revision.
- [ ] Resolve the deployment gates in the infrastructure guide and capture hosted runtime evidence.
- [ ] Publish an English demonstration video of at most three minutes on YouTube or Vimeo and link it.
- [ ] Confirm repository visibility, contest-period originality, and all required Devpost fields.

## 10. Three-minute demonstration outline

1. **0:00** — Explain the operator's problem: playback can succeed while ads fail. Show the
   synthetic primary scenario; do not present a simulated indicator as a measured external monitor.
2. **0:25** — Start the investigation using the scenario prompt. Avoid an unsupported percentage
   revenue-drop claim.
3. **0:40** — Show actual MCP SQL and returned evidence, then the classified holding-screen frame.
4. **1:35** — Explain the affected group and the calculated demo exposure in everyday language.
5. **2:10** — Show the negative control declining to assert a cause or loss.
6. **2:40** — Review the proposed response and evidence export. Explain that production approval
   is blocked; if showing local mock approval, label the environment and simulation explicitly.

These are editing targets, not measured investigation durations. Record real runs and clearly label
cuts or cached replay. Keep historical transcripts unchanged; capture a new run for current behaviour.
