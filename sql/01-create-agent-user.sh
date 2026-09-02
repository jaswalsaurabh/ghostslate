#!/bin/bash
set -e

# Provision read-only ghostslate_agent user for agent MCP interactions.
# Uses distinct admin credentials to create the agent user with sha256_password.
ADMIN_PASS="${CLICKHOUSE_ADMIN_PASSWORD:-ghostslate_admin_local_dev}"
AGENT_PASS="${CLICKHOUSE_AGENT_PASSWORD:-ghostslate_agent_local_dev}"

clickhouse-client -u default --password "$ADMIN_PASS" --param_agent_pass "$AGENT_PASS" --query "CREATE USER IF NOT EXISTS ghostslate_agent IDENTIFIED WITH sha256_password BY {agent_pass:String} SETTINGS readonly=1, max_execution_time=15, max_rows_to_read=500000, max_bytes_to_read=100000000, max_memory_usage=268435456, max_result_rows=1000, max_result_bytes=10485760, max_threads=2;"
clickhouse-client -u default --password "$ADMIN_PASS" --query "ALTER USER ghostslate_agent SETTINGS readonly=1, max_execution_time=15, max_rows_to_read=500000, max_bytes_to_read=100000000, max_memory_usage=268435456, max_result_rows=1000, max_result_bytes=10485760, max_threads=2;"
clickhouse-client -u default --password "$ADMIN_PASS" --query "GRANT SELECT ON ghostslate.* TO ghostslate_agent;"
