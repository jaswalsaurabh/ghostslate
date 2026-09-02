resource "google_artifact_registry_repository_iam_member" "image_publisher" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.ghostslate.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${local.image_publisher_email}"
  depends_on = [google_project_service.required["artifactregistry.googleapis.com"]]
}

resource "google_artifact_registry_repository_iam_member" "deployer_reader" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.ghostslate.repository_id
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${local.deployer_email}"
  depends_on = [google_project_service.required["artifactregistry.googleapis.com"]]
}

resource "google_project_iam_member" "deployer_cloud_run" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${local.deployer_email}"
}

resource "google_service_account_iam_member" "deployer_runtime_user" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${local.deployer_email}"
}

resource "google_project_iam_member" "runtime_vertex_ai" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${local.runtime_email}"
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  # Secret IDs are known from configuration, so Terraform can resolve the
  # instance addresses during import and plan before the secrets are created.
  for_each = var.secret_ids

  project   = var.project_id
  secret_id = google_secret_manager_secret.application[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.runtime_email}"
}

resource "google_service_account_iam_member" "github_image_publisher" {
  service_account_id = google_service_account.image_publisher.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_service_account_iam_member" "github_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.environment/${var.production_environment}"
}
