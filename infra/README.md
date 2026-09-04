# GhostSlate infrastructure

This guide covers running the app in Docker, preparing ClickHouse Cloud, and deploying an image
to an already provisioned Google Cloud environment. For the shortest local path, follow the
[main README](../README.md#local-setup). All commands here run from the repository root.

Cloud commands create billable resources or change deployment state. They are operator instructions,
not actions automatically performed by the app. No public deployment or fresh-cloud bootstrap is
certified by this document.

## Local app in Docker

Complete the README's `.env` configuration and ADC login first. The image includes ffmpeg, so
host ffmpeg is unnecessary for this path. A plain `docker compose up --build` does **not** mount
Google credentials; use a read-only mount when starting the app:

```bash
export GHOSTSLATE_ADC_FILE="$(gcloud info --format='value(config.paths.global_config_dir)')/application_default_credentials.json"
test -f "$GHOSTSLATE_ADC_FILE"
docker compose -f infra/docker-compose.yml up -d clickhouse mcp-clickhouse incident-injector
docker compose -f infra/docker-compose.yml logs -f incident-injector
```

Wait for successful injection. Stop any host API using port 8080, then run:

```bash
docker compose -f infra/docker-compose.yml build app
docker compose -f infra/docker-compose.yml run --rm --service-ports \
  -e MCP_SERVER_URL=http://mcp-clickhouse:8000 \
  -e GOOGLE_APPLICATION_CREDENTIALS=/tmp/ghostslate-adc.json \
  -v "$GHOSTSLATE_ADC_FILE:/tmp/ghostslate-adc.json:ro" \
  app
```

Open [localhost:8080](http://localhost:8080). This uses Compose's **development** mode, including
local mock remediation. The unprivileged container user must be able to read the mounted file;
check file permissions if authentication fails, without making credentials publicly readable.
If using a non-default ADC location, set `GHOSTSLATE_ADC_FILE` to its absolute path instead.

## Seed ClickHouse Cloud

Use a dedicated demo database and an admin account for this one-time setup—not the agent account.
Install `clickhouse-client` and Python 3.13. Export `CLICKHOUSE_HOST` as the Cloud hostname,
`CLICKHOUSE_ADMIN_USER` as your admin username, and `CLICKHOUSE_ADMIN_PASSWORD` from your secure
local environment. Do not commit these values or paste them into a public transcript.

The native client uses secure port **9440**. The Python injector and official MCP HTTP driver use
HTTPS port **8443**. Create the database before configuring the agent's scoped read permission.

```bash
clickhouse-client --host "$CLICKHOUSE_HOST" --port 9440 --secure \
  --user "$CLICKHOUSE_ADMIN_USER" --password "$CLICKHOUSE_ADMIN_PASSWORD" \
  --multiquery < sql/schema/001_initial_tables.sql
clickhouse-client --host "$CLICKHOUSE_HOST" --port 9440 --secure \
  --user "$CLICKHOUSE_ADMIN_USER" --password "$CLICKHOUSE_ADMIN_PASSWORD" \
  --multiquery < sql/seed/002-advertiser-inventory.sql
clickhouse-client --host "$CLICKHOUSE_HOST" --port 9440 --secure \
  --user "$CLICKHOUSE_ADMIN_USER" --password "$CLICKHOUSE_ADMIN_PASSWORD" \
  --multiquery < sql/seed/003-baseline-telemetry.sql
clickhouse-client --host "$CLICKHOUSE_HOST" --port 9440 --secure \
  --user "$CLICKHOUSE_ADMIN_USER" --password "$CLICKHOUSE_ADMIN_PASSWORD" \
  --multiquery < sql/checks/baseline-assertions.sql
```

Run baseline assertions **before** injection: some assertions describe healthy, unmutated data.
Then apply the incidents. The injector creates its separate ledger schema when needed.

```bash
python3.13 -m venv tools/generator/.venv
tools/generator/.venv/bin/pip install -r tools/generator/requirements.txt
CLICKHOUSE_PORT=8443 CLICKHOUSE_SECURE=true \
  tools/generator/.venv/bin/python tools/generator/inject.py
CLICKHOUSE_PORT=8443 CLICKHOUSE_SECURE=true \
  tools/generator/.venv/bin/python tools/generator/inject.py --status
clickhouse-client --host "$CLICKHOUSE_HOST" --port 9440 --secure \
  --user "$CLICKHOUSE_ADMIN_USER" --password "$CLICKHOUSE_ADMIN_PASSWORD" \
  --multiquery < sql/checks/004-incident-assertions.sql
```

In the Cloud console, provision a separate `ghostslate_agent` user with only `SELECT` on
`ghostslate.*`, and no access to `ghostslate_eval`. Configure MCP with that read-only account.
Confirm its permissions before investigating. Seeding and injection are admin operations;
the agent must always reach ClickHouse through official MCP.

## Production provisioning prerequisites

Provision or verify these before deploying the application:

1. A billing-enabled Google Cloud project and the APIs required by
   [`terraform/main.tf`](../terraform/main.tf).
2. An Artifact Registry Docker repository and permission to publish images.
3. A dedicated application service account with Vertex AI invocation and access only to its
   three runtime secrets: MCP URL, MCP bearer token, and a random run-key secret of at least 32 characters.
4. A deployed official MCP service using the seeded Cloud database and read-only account. Its bearer
   token must match the application secret. Keep database credentials on MCP, not the application.
5. Verified app-to-MCP networking. The checked-in Terraform marks MCP internal-only; an application
   deployment must have a compatible private network route. The current guide/configuration does
   not supply a complete fresh-project network bootstrap. Do not make MCP public to work around this.
6. The public HTTPS load balancer, certificate, DNS, and Cloud Armor policy required by
   [SECURITY.md](../SECURITY.md), with direct application ingress restricted.

### Terraform coverage and bootstrap limits

[`terraform/`](../terraform/) defines service accounts, GitHub Workload Identity Federation,
Artifact Registry, secret containers, the private MCP service, and the public HTTPS/DNS resources.
It does **not** create the application service or a Cloud Armor policy, populate secret versions,
or provide the complete private networking setup. The example hostname and secret IDs are placeholders.

The GCS state bucket must already exist and be accessible to the provisioning identity. Configure
an operator-owned `terraform/terraform.tfvars` from the example; supply the real project, region,
hostname, Cloudflare zone, GitHub repository/environment, and secret IDs. The file is git-ignored;
do not put secret values in it. Cloudflare DNS authentication uses `CLOUDFLARE_API_TOKEN`.

```bash
terraform -chdir=terraform init -backend-config="bucket=YOUR_EXISTING_STATE_BUCKET"
terraform -chdir=terraform plan
```

Review the plan before applying. A full fresh-project apply needs a staged bootstrap: secret
containers must exist and receive values before the MCP revision can start, and the application
must exist before its public edge is usable. Existing managed resources must be imported rather
than recreated. Do not assume a single full apply completes those prerequisites.

Populate secret versions through Secret Manager, not Terraform values/state. After configuring
DNS, wait for the Google-managed certificate to become active before testing the public hostname.
See [Terraform outputs](../terraform/outputs.tf) for resource identifiers, not secret values.

## Build and deploy the application

The following is for an **already provisioned and network-verified** environment. Set
`GCP_PROJECT_ID`, `GCP_REGION`, `GHOSTSLATE_ARTIFACT_REPOSITORY`, `GHOSTSLATE_IMAGE_TAG`,
`GHOSTSLATE_RUNTIME_SERVICE_ACCOUNT`, `CLICKHOUSE_MCP_AUTH_TOKEN_SECRET_NAME`,
`MCP_SERVER_URL_SECRET_NAME`, and `RUN_KEY_SECRET_NAME` to your deployment's non-secret identifiers.
Choose a unique image tag for the revision being deployed.

Use Docker Buildx to select the checked-in Dockerfile and Cloud Run's target architecture.
`gcloud builds submit -f infra/Dockerfile` is not a valid alternative; Cloud Build would require
a build configuration for a non-root Dockerfile. See the
[Google Cloud Build reference](https://cloud.google.com/sdk/gcloud/reference/builds/submit).

```bash
export GHOSTSLATE_IMAGE="$GCP_REGION-docker.pkg.dev/$GCP_PROJECT_ID/$GHOSTSLATE_ARTIFACT_REPOSITORY/ghostslate:$GHOSTSLATE_IMAGE_TAG"
gcloud auth configure-docker "$GCP_REGION-docker.pkg.dev"
docker buildx build --platform linux/amd64 --file infra/Dockerfile \
  --tag "$GHOSTSLATE_IMAGE" --push .
gcloud run deploy ghostslate \
  --project "$GCP_PROJECT_ID" --region "$GCP_REGION" \
  --image "$GHOSTSLATE_IMAGE" \
  --service-account "$GHOSTSLATE_RUNTIME_SERVICE_ACCOUNT" \
  --port 8080 --timeout 300 --concurrency 8 --max-instances 1 \
  --memory 1Gi --cpu 1 \
  --ingress internal-and-cloud-load-balancing --no-default-url --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,TRUST_PROXY_HOPS=1,GCP_PROJECT_ID=$GCP_PROJECT_ID,GCP_REGION=$GCP_REGION,GEMINI_MODEL=gemini-2.5-flash" \
  --set-secrets "CLICKHOUSE_MCP_AUTH_TOKEN=${CLICKHOUSE_MCP_AUTH_TOKEN_SECRET_NAME}:latest,MCP_SERVER_URL=${MCP_SERVER_URL_SECRET_NAME}:latest,RUN_KEY_SECRET=${RUN_KEY_SECRET_NAME}:latest"
```

Verify `TRUST_PROXY_HOPS` against the actual forwarding path before using this example. Preserve
the verified private-network configuration on the application service. Do not enable another
instance or overlap serving revisions while relying on the process-local run store. Even one
instance can restart; exported evidence, not the in-memory cache, is the durable review artifact.

### Existing GitHub deployment workflow

[`deploy.yml`](../.github/workflows/deploy.yml) builds an amd64 image and deploys its immutable
digest. It requires the Google project/region, registry, WIF provider, publisher/deployer/runtime
service accounts, secret names, and `GCP_PUBLIC_URL` repository/environment variables named in that
file. Configure its `production` environment and permissions before dispatching it.

**Release gate:** that workflow currently sets concurrency 20 and maximum instances 3, unlike the
single-instance demo command above. Reconcile the workflow before using it for judging; otherwise
it can overwrite the intended topology and break cross-request replay. Its HTTP health smoke test
alone does not verify MCP connectivity or a complete investigation. Documentation changes do not
change those workflow settings.

## Hosted verification and demo gates

Set `GHOSTSLATE_PUBLIC_URL` to the real HTTPS origin, then check:

```bash
curl --fail "$GHOSTSLATE_PUBLIC_URL/api/health"
```

Inspect `mcp.connected: true`, not just HTTP 200 or `status: "ok"`. Then run all six scenarios
through the hosted UI. Verify the expected decisions in [eval/README.md](../eval/README.md), mapped
vision calls for positive cases, actual SQL, and application-measured durations. Do not substitute
offline benchmark scan counts for unavailable live metrics.

Confirm SSE reconnect and retained-run replay on the deployed topology. Verify production
**rejects remediation approval**; `REMEDIATION_ENABLED` does not override the unconditional
production guard. Show proposal review—not a successful production approval—in the demo.

Record the deployed revision, UTC verification time, and evidence export. Add verified hosted and
video URLs to the main README only after they exist. Historical captures do not establish current
hosted health. Cloud Armor configuration, private MCP connectivity, and deployment-topology
alignment remain release checks rather than implied guarantees.

## Security boundary

Keep ClickHouse credentials only on MCP, bearer authentication enabled, database permissions
read-only, and all browser requests on the application API. Use Secret Manager at runtime and a
least-privilege service account. The process limiter is not a DDoS firewall; Cloud Armor belongs
before Cloud Run. Review [SECURITY.md](../SECURITY.md) before public exposure.
