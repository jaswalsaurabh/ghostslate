"""ClickHouse connection for the injector.

The injector writes, so it connects as the admin user. The read-only
``ghostslate_agent`` account exists precisely so the agent cannot do what this
script does.
"""

import os

import clickhouse_connect
from clickhouse_connect.driver.client import Client


def connect() -> Client:
    return clickhouse_connect.get_client(
        host=os.environ.get("CLICKHOUSE_HOST") or "localhost",
        port=int(os.environ.get("CLICKHOUSE_PORT", "8123")),
        username=os.environ.get("CLICKHOUSE_ADMIN_USER", "default"),
        password=os.environ.get("CLICKHOUSE_ADMIN_PASSWORD", "ghostslate_admin_local_dev"),
        secure=os.environ.get("CLICKHOUSE_SECURE", "false").lower() == "true",
        verify=os.environ.get("CLICKHOUSE_VERIFY", "false").lower() == "true",
    )
