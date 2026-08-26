# Security

GhostSlate is currently a public, unauthenticated demonstration application. Its server can query
only the synthetic GhostSlate ClickHouse dataset through the official MCP server, classify bundled
synthetic media, and emit an in-memory demonstration remediation event. It does not accept uploads,
store browser credentials, or execute remediation against production ad infrastructure.

## Implemented controls

- Every API request is limited per client IP. Expensive investigation, vision, stream, and
  remediation routes have tighter limits in addition to the global limit.
- JSON bodies are capped at 16 KB. Prompts, investigation windows, channel IDs, run keys, media
  filenames, and timestamps have explicit schema bounds.
- Unsafe browser requests require JSON and pass same-origin / allowlisted-origin and Fetch Metadata
  checks. No cookies or ambient browser credentials are used.
- CSP, anti-framing, MIME-sniffing, referrer, permissions, HSTS, cross-origin isolation, and
  no-store API headers are applied centrally. React renders model and database text as escaped text;
  there is no raw HTML rendering sink.
- Exploratory agent SQL is allowlisted to single read-only query forms. External table functions,
  system namespaces, output files, and multiple statements are rejected before MCP. The MCP
  ClickHouse user remains read-only and scoped to the application database.
- Media access accepts only simple server-owned MP4 filenames and verifies the resolved path stays
  inside the media directory. Browser uploads and user-selected filesystem paths are unsupported.
- Investigation and vision caches are bounded. Public error responses do not include upstream
  service details. Tool traces are row- and size-limited before being retained or streamed.
- Secrets remain in server environment variables / Secret Manager. CI scans tracked files for
  credentials, CodeQL runs extended security queries, and dependency review blocks new high-severity
  advisories.
- The production container runs as the unprivileged `node` user. The local MCP endpoint binds to
  loopback and requires a bearer token by default.

## DDoS boundary

Application rate limiting mitigates abusive clients and protects expensive Gemini and ClickHouse
operations; it cannot absorb a volumetric network attack. A public production deployment must put
Cloud Run behind a Google Cloud external Application Load Balancer with Cloud Armor, restrict Cloud
Run ingress to internal/load-balancer traffic, and configure Cloud Armor rate-based bans or adaptive
protection. Set a conservative Cloud Run maximum instance count as a cost and dependency safeguard.

The in-memory limiter is intentionally per container. Multi-instance enforcement belongs at Cloud
Armor, where a client cannot multiply its allowance by reaching different containers.

## Authentication boundary

The current remediation emission is a demo-only in-memory/log event. Before it is connected to any
real external system, require authenticated operators, authorization for the target channel, and an
auditable approval token. Rate limiting and CSRF checks are not substitutes for authorization.

## Production configuration

- Set `NODE_ENV=production` and set `TRUST_PROXY_HOPS` to the exact trusted proxy topology. Re-verify
  it after adding a load balancer or CDN; never use an unbounded trust-proxy setting.
- Set `ALLOWED_ORIGINS` only when the browser is hosted on additional HTTPS origins. Same-origin
  hosting needs no value. Never use a wildcard.
- Keep `CLICKHOUSE_MCP_AUTH_DISABLED=false` and inject a random `CLICKHOUSE_MCP_AUTH_TOKEN` through
  Secret Manager.
- Use dedicated service accounts with only Vertex AI invocation and the exact Secret Manager access
  required by the service. Keep ClickHouse write and DDL privileges disabled.
- Terminate TLS at Google Cloud and do not expose ClickHouse or MCP directly to the public internet.

## Reporting a vulnerability

Do not open a public issue containing exploit details or credentials. Contact the repository owner
privately with the affected revision, reproduction steps, impact, and any suggested mitigation.
