#!/bin/bash
set -e

# Provision read-only ghostslate_agent user for agent MCP interactions.
# Uses distinct admin credentials to create the agent user with sha256_password.
ADMIN_PASS="${CLICKHOUSE_ADMIN_PASSWORD:-ghostslate_admin_local_dev}"
AGENT_PASS="${CLICKHOUSE_AGENT_PASSWORD:-ghostslate_agent_local_dev}"

clickhouse-client -u default --password "$ADMIN_PASS" --query "CREATE USER IF NOT EXISTS ghostslate_agent IDENTIFIED WITH sha256_password BY '${AGENT_PASS}';"
clickhouse-client -u default --password "$ADMIN_PASS" --query "GRANT SELECT ON ghostslate.* TO ghostslate_agent;"
