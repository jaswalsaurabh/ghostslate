output "terraform_state_bucket" {
  description = "Existing GCS bucket used by the Terraform backend."
  value       = "gs://${var.project_id}-tfstate"
}

output "workload_identity_provider" {
  description = "Full provider resource name for the GitHub Actions auth action."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "image_publisher_service_account" {
  description = "GitHub image publisher service-account email."
  value       = google_service_account.image_publisher.email
}

output "deployer_service_account" {
  description = "GitHub Cloud Run deployer service-account email."
  value       = google_service_account.deployer.email
}

output "runtime_service_account" {
  description = "Cloud Run runtime service-account email."
  value       = google_service_account.runtime.email
}

output "mcp_runtime_service_account" {
  description = "Cloud Run runtime service-account email for the MCP service."
  value       = google_service_account.mcp_runtime.email
}

output "mcp_service_url" {
  description = "Private Cloud Run URL for the MCP service."
  value       = google_cloud_run_v2_service.mcp.uri
}

output "artifact_registry_repository" {
  description = "Artifact Registry repository path."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.ghostslate.repository_id}"
}

output "secret_ids" {
  description = "Secret Manager secret IDs; values are intentionally never output."
  value       = { for key, secret in google_secret_manager_secret.application : key => secret.secret_id }
}
