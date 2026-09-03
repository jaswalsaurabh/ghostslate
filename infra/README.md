# GhostSlate Infrastructure

This directory holds infrastructure configuration for local development and production deployment to Google Cloud Run.

## Deployment Target

- **Production:** Google Cloud Run (single container serving API + built web SPA).
- **Local:** `docker compose -f infra/docker-compose.yml up --build`.

The local Compose stack runs `incident-injector` after ClickHouse finishes seeding. This is
required: the baseline is intentionally nominal, while the primary, confounder, and negative
control cases are created by the idempotent injector. The app waits for that job to complete.

## Required Services

1. **ClickHouse Cloud** (or local instance) reachable by `mcp-clickhouse`.
2. **Gemini on Vertex AI via `@google/genai`** for multimodal reasoning and vision.
3. **Cloud Run** for hosting.

## Cloud Run deployment

Build and deploy the single-container service from the repository root. The commands below keep
credentials in Secret Manager; do not pass ClickHouse or MCP passwords on the command line.

```bash
: "${CLICKHOUSE_MCP_AUTH_TOKEN_SECRET_NAME:?Set the Secret Manager name before deploying}"
: "${MCP_SERVER_URL_SECRET_NAME:?Set the Secret Manager name before deploying}"
: "${RUN_KEY_SECRET_NAME:?Set the Secret Manager name before deploying}"

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
  --ingress internal-and-cloud-load-balancing \
  --no-default-url \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,TRUST_PROXY_HOPS=1,GCP_PROJECT_ID=PROJECT_ID,GCP_REGION=REGION,GEMINI_MODEL=gemini-2.5-flash,CLICKHOUSE_MCP_SERVER_TRANSPORT=sse,REMEDIATION_ENABLED=false \
  --set-secrets CLICKHOUSE_MCP_AUTH_TOKEN=${CLICKHOUSE_MCP_AUTH_TOKEN_SECRET_NAME}:latest,MCP_SERVER_URL=${MCP_SERVER_URL_SECRET_NAME}:latest,RUN_KEY_SECRET=${RUN_KEY_SECRET_NAME}:latest
```

Replace `PROJECT_ID`, `REGION`, `TAG`, the Artifact Registry repository, and Secret Manager names
with deployment-specific values. Grant the Cloud Run service account Vertex AI invocation access,
Secret Manager access for only these secrets, and no ClickHouse write permission. Keep the MCP
server reachable from the Cloud Run network; the agent must continue to use MCP rather than a
direct ClickHouse client.

## Deployment smoke test

Before deploying the app to Cloud Run, apply `tools/generator/inject.py` once against the seeded
ClickHouse Cloud database as the admin user. The Cloud Run agent user is read-only and cannot apply
these mutations. Verify the injector ledger and run `sql/checks/004-incident-assertions.sql`
before capturing a demo.

After deployment, capture the service URL and verify the health endpoint before running a full
investigation:

```bash
curl --fail "https://PUBLIC_LOAD_BALANCER_HOST/api/health"
```

The health response must report the service as healthy and show a connected MCP dependency. Then
run all six scenarios from the UI. Confirm that the primary, latency-isolation, and black-screen
cases select their measured cohorts and that the clean-control, set-top-box confounder, and
small-sample cases produce no root cause, loss, or remediation. Both positive visual variants must
classify the server-mapped frame before finalization.

## Public HTTPS edge with Terraform

Terraform provisions the external HTTPS load balancer, Cloud Run serverless NEG, Google-managed
certificate, reserved global IP, and a DNS record for `app.example.com`. The checked-in Terraform
configuration uses Cloudflare as its DNS provider; another provider can use the same hostname and
load-balancer IP with an equivalent `A` record. Cloudflare authentication is read from
`CLOUDFLARE_API_TOKEN`; never put the token in a `.tfvars` file or commit it.

```bash
export CLOUDFLARE_API_TOKEN='your-dns-edit-token'
terraform -chdir=terraform init
terraform -chdir=terraform plan \
  -var='project_id=PROJECT_ID' \
  -var='region=us-central1' \
  -var='github_repository=jaswalsaurabh/ghostslate' \
  -var='production_environment=production' \
  -var='cloudflare_zone_id=CLOUDFLARE_ZONE_ID'
terraform -chdir=terraform apply \
  -var='project_id=PROJECT_ID' \
  -var='region=us-central1' \
  -var='github_repository=jaswalsaurabh/ghostslate' \
  -var='production_environment=production' \
  -var='cloudflare_zone_id=CLOUDFLARE_ZONE_ID'
```

The DNS record is initially DNS-only so the Google-managed certificate can validate the hostname.
Wait for the certificate output by `managed_certificate_name` to become `ACTIVE`, then set the
GitHub repository variable `GCP_PUBLIC_URL` to `https://app.example.com`.

## Required production settings

- ClickHouse credentials are runtime secrets on the `mcp-clickhouse` service only; the GhostSlate
  API receives only the MCP endpoint and bearer token.
- `MCP_SERVER_URL` points to the official SSE `mcp-clickhouse` service.
- The MCP service connects to ClickHouse Cloud over HTTPS port `8443`; native
  `clickhouse-client` maintenance commands use port `9440`.
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
- Set `RUN_KEY_SECRET` to a randomly generated value of at least 32 characters. It scopes anonymous
  idempotency keys to a session and must never be committed.

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
