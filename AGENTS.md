# GhostSlate — Engineering Rules

**This file is canonical.** `CLAUDE.md` and `GEMINI.md` are one-line pointers that import it, and
Codex reads `AGENTS.md` natively. Never copy rules into a pointer file and never let the pointers
disagree — edit this file only.

Hackathon submission for the Agentic Cinema ClickHouse track. This repo is **public and
OSI-licensed**. Nothing proprietary, nothing carried over from another codebase.

## Hard constraints (violating these loses the submission)

- **Original work only.** Every line is written during the contest period (from 27 Jul 2026).
  Never copy code, schemas, config, or documentation from another project into this repo.
- **ClickHouse is reached by the agent only through the official `mcp-clickhouse` server.** The UI
  may read ClickHouse directly for dashboards, but the agent's data path must be MCP. A README
  mention is explicitly insufficient — the calls must be real and observable.
- **Google Cloud must be used at runtime**, not just referenced: Gemini via Vertex AI for both
  reasoning and vision, deployed on Cloud Run.
- **No credentials in the browser.** Service account keys and ClickHouse credentials live only in
  the server. The web app talks to the API; the API talks to everything else.
- **No real broadcast footage.** Demo media is synthetic or openly licensed.
- Keep `LICENSE` (OSI-approved, commercial use permitted) present and visible.

## Dependency discipline

One version of any technology, repo-wide. This is enforced, not aspirational:

- Shared versions are declared once in `pnpm-workspace.yaml` under `catalog:`. Packages reference
  them as `"catalog:"` and never as a literal range.
- `pnpm.overrides` in the root `package.json` collapses transitive duplicates.
- `engines` + `.nvmrc` pin Node 24.19.0 LTS; `engine-strict=true` makes a mismatch fail loudly.
- Run `pnpm dedupe --check` before any commit that touches dependencies.
- Adding a dependency is a deliberate decision. Prefer the standard library or a few lines of code
  over a package that must be learned, configured, and debugged inside a ten-day budget.

## Architecture

```
web/     Vite + React + TypeScript. Presentation only.
server/  Express API. Agent orchestration, MCP client, ClickHouse reads, SSE, ffmpeg.
tools/   Python data generator (anomaly injection).
sql/     Schema DDL and benchmark queries. The schema lives here, not in application code.
eval/    Ground-truth incident cases.
infra/   Dockerfile, docker-compose, Cloud Run config.
```

**Layering in `server/`:** route → controller → service. Routes wire middleware and nothing else.
Controllers translate results to HTTP. Services own logic and data access and never see `req`/`res`.

**Errors:** services throw typed domain errors; the HTTP layer maps them to status codes in one
place. Never select a status code inline. An unexpected throw becomes an opaque 500 — so a plain
`Error` is never how a service reports an expected failure.

**Single ownership.** Every derived value is computed in exactly one place and read from there.
The financial loss figure, the slate-bleed percentage, and the confidence thresholds each have one
definition. If the UI and the agent disagree about a number, the architecture is wrong.

**Grounding rule.** Every figure the agent states in its final answer must trace to a value returned
by ClickHouse or computed from one. The model never estimates a number it could have queried. This
is the project's core credibility property — treat a violation as a bug, not a nuance.

## SQL

- Queries live in `sql/`, are parameterised, and are benchmarked before they are wired to the agent.
- `ASOF JOIN` returns exactly one match per left row. Never compute a ratio at a grain where the
  denominator is 1 — aggregate across cues, not within one.
- Guard small samples (`HAVING cues >= 20`) so noise cannot be reported as a root cause.
- Use `LowCardinality` and `AggregatingMergeTree` where the query pattern needs them. Do not add
  ClickHouse features to look impressive; judges recognise feature-stuffing.

## Frontend

- Tailwind v4 token syntax: `bg-(--surface)`, not `bg-[var(--surface)]`.
- Component files PascalCase and matching their export; everything else kebab-case; hooks camelCase
  beginning with `use`.
- No `any` for domain or API types. Shapes are decoded once at the API boundary with zod.
- The war-room view must surface, live: the prompt, each MCP tool call with its actual SQL, rows
  scanned and execution time, the agent's narrowing hypotheses, classified frames, and the final
  grounded diagnosis. Showing real SQL and real timings is the cheapest proof of runtime use.

## Complexity budget

**The domain is allowed to be complex. The code is not.**

SCTE-35 semantics, ASOF temporal matching and multi-step agent reasoning are genuinely intricate
problems. That is the point of the project. It is also exactly why the implementation must stay
plain: a reader who does not know broadcast advertising should be able to open any file and follow
what it does. Complexity belongs in the problem being solved, never in the solution's shape.

Concretely:

- **Single responsibility.** A module does one thing and is named for that thing. If a name needs
  "and" to be accurate, it is two modules.
- **DRY, with judgement.** Extract logic the second time it is genuinely the same decision. Do not
  extract two things that merely look alike today — a wrong abstraction costs more than the
  duplication it removed.
- **Patterns earn their place.** Use a factory where construction genuinely varies (for example
  building MCP tool handlers, or selecting a frame-classifier implementation). Do not introduce a
  factory, strategy or wrapper to satisfy a checklist. A pattern applied without a real variation to
  absorb is added complexity wearing a respectable name, and it contradicts the rule above it.
- **Business logic is readable prose.** Services read top to bottom as the steps a domain expert
  would describe. Push clever code down into small, well-named helpers.
- **File size.** 500 lines hard maximum repo-wide; target 280 under `web/src`. Split when
  responsibilities or control flow diverge, not when a counter crosses a line.
- **Comments** explain intent, invariants or non-obvious constraints — never mechanics or diff
  history. A comment restating the code is deleted on sight.
- **No speculative generality.** Build for the one channel and one failure mode in scope. A seam for
  a second one is only worth adding when the second one exists.

## Testing

**Test where the value is created, nowhere else.**

A test earns its place only if it guards business logic — the reasoning that turns raw telemetry
into a defensible answer. If a function does not participate in producing the diagnosis, the loss
figure or the decision to stay silent, it does not get a test. Coverage percentage is not a goal and
is not measured.

Vitest is the runner for all TypeScript. Its version comes from the catalog, so `web/` and `server/`
can never drift apart.

**Tested, because this is where the product's value is made:**

- **The ASOF JOIN aggregation.** The highest-risk logic in the repo. Test against a fixture with a
  known slate-bleed ratio, including the denominator-of-one trap that made the original query
  meaningless.
- **The grounding rule.** Every numeric claim in an agent answer must trace to a queried value. This
  is a correctness property of the product, so it is asserted, not hoped for.
- **Loss attribution.** Known impressions plus a known rate card must produce an exact figure.
- **The negative control.** Given a window with no real root cause, the agent declines to assert
  one. Restraint is business logic and is tested as explicitly as the positive cases.
- **Small-sample guarding.** Below `cues >= 20`, nothing is reported.

**Not tested:** React rendering, glue code, config, HTTP wiring, the SSE transport, and the data
generator. These either fail loudly and immediately, or are verified by the demo path itself.

The generator in `tools/generator/` produces test data rather than business value, so it gets no
unit tests and needs no second runner — its output is verified by SQL assertions against the
expected anomaly. If a case later appears where Vitest genuinely cannot cover business logic, raise
it with options rather than introducing a second toolchain unilaterally.

## Infrastructure minimalism

Every piece of infrastructure is something a judge must install and something that can fail on
recording day. The required set is fixed: ClickHouse Cloud, the `mcp-clickhouse` server, Vertex AI,
Cloud Run, ffmpeg. Local development is one `docker-compose up`.

Before adding anything beyond that, it must clear all three bars:

1. A specific requirement in `PROJECT-OVERVIEW.md` demands it.
2. No already-present component can do the job acceptably.
3. It does not complicate the cold-clone setup a judge follows.

**Redis is permitted but not assumed.** It is justified only if a real need appears — for example
caching expensive frame-classification results across demo runs, or backing SSE state if the agent
run outlives a single request. In-memory state in a single Cloud Run container is sufficient for the
demo and requires no extra service. Do not add Redis pre-emptively.

Anything added under this rule must be documented in `PROJECT-OVERVIEW.md` §7 with the reason it was
needed, in the same commit that introduces it.

## Idempotency

There is no billing here, so idempotency is not a financial control. It protects three things:
duplicate Gemini spend, correctness of one-shot side effects, and the demo surviving a dropped
connection.

Apply it exactly where a repeat causes real harm:

- **Investigation runs.** An investigation is expensive — multiple Gemini turns, several ClickHouse
  queries, frame classification. A double-click, an impatient retry or an SSE reconnect must attach
  to the run already in flight, never start a second one. Key a run by a hash of its normalised
  inputs (channel, time window, prompt); an identical key returns the existing run's stream or its
  completed result.
- **Frame classification.** Cache by content hash of the frame. The same frame is never sent to
  Gemini twice, across runs or across restarts within a session.
- **Remediation emission.** The operator-approved payload is a one-shot side effect. A repeated
  approval for the same investigation is a no-op returning the original result, not a second emission.

Read paths need none of this — ClickHouse queries are naturally idempotent, and dashboard reads
should stay plain.

**This requires no new infrastructure.** A `Map` of run-key to run state inside the single Cloud Run
container is sufficient for the demo, and satisfies the minimalism rule above. Redis becomes
justified only if runs must survive a container restart or be shared across instances — neither is
in scope. Do not reach for it first.

A practical benefit worth protecting: replaying a completed investigation from its cached result
makes the demo deterministic and instant. That is what lets you re-record the video without
re-running the agent and hoping for the same output.

## Scope discipline

Ten days, one developer. The plan is deliberately narrow: one channel, one failure mode, one
polished screen. Before building anything not in `PROJECT-OVERVIEW.md` §3, check whether it moves
one of the four judging criteria. If it does not, it does not get built.

Protected regardless of schedule pressure: the vision layer, the negative-control demo case, and a
full day for the demo video.
