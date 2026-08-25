# GhostSlate Infrastructure

This directory holds infrastructure configuration for local development and production deployment to Google Cloud Run.

## Deployment Target

- **Production:** Google Cloud Run (single container serving API + built web SPA).
- **Local:** `docker compose -f infra/docker-compose.yml up --build`.

## Required Services

1. **ClickHouse Cloud** (or local instance) reachable by `mcp-clickhouse`.
2. **Gemini on Vertex AI via `@google/genai`** for multimodal reasoning and vision.
3. **Cloud Run** for hosting.

## Cloud Run deployment

Build and deploy the single-container service from the repository root. The commands below keep
credentials in Secret Manager; do not pass ClickHouse or MCP passwords on the command line.

```bash
: "${CLICKHOUSE_HOST_SECRET_NAME:?Set the Secret Manager name before deploying}"
: "${CLICKHOUSE_USER_SECRET_NAME:?Set the Secret Manager name before deploying}"
: "${CLICKHOUSE_AGENT_PASSWORD_SECRET_NAME:?Set the Secret Manager name before deploying}"
: "${CLICKHOUSE_MCP_AUTH_TOKEN_SECRET_NAME:?Set the Secret Manager name before deploying}"
: "${MCP_SERVER_URL_SECRET_NAME:?Set the Secret Manager name before deploying}"

gcloud auth configure-docker REGION-docker.pkg.dev
gcloud builds submit \
  --tag REGION-docker.pkg.dev/PROJECT_ID/ghostslate/ghostslate:TAG \
  -f infra/Dockerfile .

gcloud run deploy ghostslate \
  --image REGION-docker.pkg.dev/PROJECT_ID/ghostslate/ghostslate:TAG \
  --region REGION \
  --port 8080 \
  --timeout 300 \
  --concurrency 20 \
  --max-instances 3 \
  --set-env-vars NODE_ENV=production,TRUST_PROXY_HOPS=1,GCP_PROJECT_ID=PROJECT_ID,GCP_REGION=REGION,GEMINI_MODEL=gemini-2.5-flash,CLICKHOUSE_DATABASE=ghostslate,CLICKHOUSE_PORT=8443,CLICKHOUSE_SECURE=true,CLICKHOUSE_MCP_SERVER_TRANSPORT=sse,PORT=8080 \
  --set-secrets CLICKHOUSE_HOST=${CLICKHOUSE_HOST_SECRET_NAME}:latest,CLICKHOUSE_USER=${CLICKHOUSE_USER_SECRET_NAME}:latest,CLICKHOUSE_AGENT_PASSWORD=${CLICKHOUSE_AGENT_PASSWORD_SECRET_NAME}:latest,CLICKHOUSE_MCP_AUTH_TOKEN=${CLICKHOUSE_MCP_AUTH_TOKEN_SECRET_NAME}:latest,MCP_SERVER_URL=${MCP_SERVER_URL_SECRET_NAME}:latest
```

Replace `PROJECT_ID`, `REGION`, `TAG`, the Artifact Registry repository, and Secret Manager names
with deployment-specific values. Grant the Cloud Run service account Vertex AI invocation access,
Secret Manager access for only these secrets, and no ClickHouse write permission. Keep the MCP
server reachable from the Cloud Run network; the agent must continue to use MCP rather than a
direct ClickHouse client.

## Deployment smoke test

After deployment, capture the service URL and verify the health endpoint before running a full
investigation:

```bash
SERVICE_URL="$(gcloud run services describe ghostslate --region REGION --format='value(status.url)')"
curl --fail "$SERVICE_URL/api/health"
```

The health response must report the service as healthy and show a connected MCP dependency. Then
run the primary, clean-control, and small-sample scenarios from the UI. Confirm that the primary
case produces grounded evidence and that the two guardrail cases produce no root cause, loss, or
remediation.

## Required production settings

- `CLICKHOUSE_HOST`, `CLICKHOUSE_USER`, and `CLICKHOUSE_AGENT_PASSWORD` are runtime secrets.
- `MCP_SERVER_URL` points to the official SSE `mcp-clickhouse` service.
- `CLICKHOUSE_MCP_AUTH_TOKEN` is supplied when the deployed MCP server requires authentication.
- `GCP_PROJECT_ID`, `GCP_REGION`, and `GEMINI_MODEL` select Vertex AI at runtime.
- `PORT` remains `8080`; Cloud Run provides the externally visible HTTPS endpoint.
- `TRUST_PROXY_HOPS` must equal the exact number of trusted proxy hops in front of the container.
  Re-verify it when adding the external load balancer; an incorrect value can group clients or trust
  a spoofed forwarding address. Use `0` only for a direct local connection.
- `ALLOWED_ORIGINS` is empty for same-origin hosting. If the SPA is hosted separately, set only its
  exact HTTPS origin; wildcards are intentionally unsupported.
- Use a dedicated read-only ClickHouse role for the agent and rotate secrets after the demo.
- Keep `CLICKHOUSE_MCP_AUTH_DISABLED=false`; production MCP traffic requires the Secret
  Manager-provided bearer token.

## Public edge protection

The process-level limiter protects expensive application operations, but volumetric DDoS controls
must run before Cloud Run. For an internet-facing unauthenticated deployment, put the service behind
a Google Cloud external Application Load Balancer and Cloud Armor, then restrict Cloud Run ingress
to `internal-and-cloud-load-balancing`. Configure Cloud Armor rate-based bans for `/api/*` and a
stricter rule for `/api/investigate/spike` and `/api/vision/classify`. Keep `--max-instances` bounded
to cap spend and prevent ClickHouse or Vertex AI overload.

Do not claim the in-process limiter alone provides DDoS protection: it is per container and traffic
has already reached the service by the time it runs. See [`../SECURITY.md`](../SECURITY.md) for the
threat model and the complete control inventory.
