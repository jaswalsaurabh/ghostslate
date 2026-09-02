variable "project_id" {
  description = "Active Google Cloud project hosting GhostSlate."
  type        = string
}

variable "region" {
  description = "Shared region for Cloud Run and Artifact Registry."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository allowed to federate into deployment identities."
  type        = string
}

variable "production_environment" {
  description = "GitHub environment allowed to federate into the deployer identity."
  type        = string
}

variable "workload_identity_pool_id" {
  description = "Workload Identity Federation pool ID."
  type        = string
  default     = "github-actions"
}

variable "workload_identity_provider_id" {
  description = "GitHub OIDC provider ID inside the workload identity pool."
  type        = string
  default     = "ghostslate"
}

variable "artifact_repository_id" {
  description = "Artifact Registry Docker repository ID."
  type        = string
  default     = "ghostslate"
}

variable "secret_ids" {
  description = "Secret Manager containers consumed by the GhostSlate runtime."
  type        = map(string)
  default = {
    mcp_auth_token = "ghostslate-clickhouse-mcp-auth-token"
    mcp_server_url = "ghostslate-mcp-server-url"
    run_key        = "ghostslate-run-key"
  }
}
