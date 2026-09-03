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

variable "mcp_service_name" {
  description = "Private Cloud Run service name for the official ClickHouse MCP server."
  type        = string
  default     = "ghostslate-mcp-clickhouse"
}

variable "mcp_image" {
  description = "Pinned official ClickHouse MCP server image."
  type        = string
  default     = "ghcr.io/clickhouse/mcp-clickhouse@sha256:f4d9f1502a14a98fd17f3ecf8654bd102ba5bde86e54a9579ed8871ef8d7"
}

variable "secret_ids" {
  description = "Secret Manager containers consumed by the GhostSlate runtime or MCP service."
  type        = map(string)
  default = {
    mcp_auth_token      = "example-mcp-auth-token"
    mcp_server_url      = "example-mcp-server-url"
    run_key             = "example-run-key"
    clickhouse_host     = "example-clickhouse-host"
    clickhouse_user     = "example-clickhouse-user"
    clickhouse_password = "example-clickhouse-password"
  }
}
