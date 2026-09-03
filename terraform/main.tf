locals {
  required_services = toset([
    "aiplatform.googleapis.com",
    "artifactregistry.googleapis.com",
    "iamcredentials.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "sts.googleapis.com",
  ])

  image_publisher_email = google_service_account.image_publisher.email
  deployer_email        = google_service_account.deployer.email
  runtime_email         = google_service_account.runtime.email
  mcp_runtime_email     = google_service_account.mcp_runtime.email

  runtime_secret_keys = toset([
    "mcp_auth_token",
    "mcp_server_url",
    "run_key",
  ])

  mcp_secret_keys = toset([
    "clickhouse_host",
    "clickhouse_user",
    "clickhouse_password",
    "mcp_auth_token",
  ])
}

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_project_service" "required" {
  for_each = local.required_services

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_iam_workload_identity_pool" "github" {
  # The imported WIF resources use the project number in their canonical ID.
  project                   = data.google_project.current.number
  workload_identity_pool_id = var.workload_identity_pool_id
  display_name              = "GhostSlate GitHub Actions"
  disabled                  = false

  depends_on = [google_project_service.required["iamcredentials.googleapis.com"]]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = data.google_project.current.number
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = var.workload_identity_provider_id
  display_name                       = "GhostSlate GitHub OIDC"
  disabled                           = false

  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.actor"       = "assertion.actor"
    "attribute.environment" = "assertion.environment"
    "attribute.ref"         = "assertion.ref"
    "attribute.repository"  = "assertion.repository"
  }

  attribute_condition = "assertion.repository == '${var.github_repository}' && assertion.ref == 'refs/heads/main'"

  oidc {
    issuer_uri        = "https://token.actions.githubusercontent.com"
    allowed_audiences = []
  }
}

resource "google_service_account" "image_publisher" {
  project      = var.project_id
  account_id   = "ghostslate-gh-image"
  display_name = "ghostslate-gh-image"
}

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "ghostslate-gh-deploy"
  display_name = "ghostslate-gh-deploy"
}

resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = "ghostslate-runtime"
  display_name = "ghostslate-runtime"
}

resource "google_service_account" "mcp_runtime" {
  project      = var.project_id
  account_id   = "ghostslate-mcp-runtime"
  display_name = "GhostSlate MCP runtime"
}

resource "google_artifact_registry_repository" "ghostslate" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_repository_id
  description   = "GhostSlate production container images"
  format        = "DOCKER"

  depends_on = [google_project_service.required["artifactregistry.googleapis.com"]]
}

resource "google_secret_manager_secret" "application" {
  for_each = var.secret_ids

  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.required["secretmanager.googleapis.com"]]
}

resource "google_cloud_run_v2_service" "mcp" {
  project             = var.project_id
  name                = var.mcp_service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = true

  template {
    service_account = google_service_account.mcp_runtime.email

    scaling {
      max_instance_count = 1
    }

    containers {
      image = var.mcp_image

      ports {
        container_port = 8000
      }

      env {
        name = "CLICKHOUSE_HOST"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.application["clickhouse_host"].secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "CLICKHOUSE_PORT"
        value = "9440"
      }

      env {
        name  = "CLICKHOUSE_SECURE"
        value = "true"
      }

      env {
        name  = "CLICKHOUSE_VERIFY"
        value = "true"
      }

      env {
        name = "CLICKHOUSE_USER"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.application["clickhouse_user"].secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "CLICKHOUSE_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.application["clickhouse_password"].secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "CLICKHOUSE_DATABASE"
        value = "ghostslate"
      }

      env {
        name  = "CLICKHOUSE_MCP_SERVER_TRANSPORT"
        value = "sse"
      }

      env {
        name  = "CLICKHOUSE_MCP_BIND_HOST"
        value = "0.0.0.0"
      }

      env {
        name  = "CLICKHOUSE_MCP_BIND_PORT"
        value = "8000"
      }

      env {
        name = "CLICKHOUSE_MCP_AUTH_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.application["mcp_auth_token"].secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "CLICKHOUSE_MCP_AUTH_DISABLED"
        value = "false"
      }

      env {
        name  = "CLICKHOUSE_ALLOW_WRITE_ACCESS"
        value = "false"
      }
    }
  }

  depends_on = [
    google_project_service.required["run.googleapis.com"],
    google_secret_manager_secret_iam_member.mcp_runtime,
  ]
}
