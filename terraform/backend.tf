terraform {
  # Supply the real bucket during `terraform init` with -backend-config.
  # This keeps deployment-project metadata out of the public repository.
  backend "gcs" {}
}
