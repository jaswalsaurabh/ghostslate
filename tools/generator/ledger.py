"""Ground-truth ledger of what has been injected.

Serves two purposes at once: it makes the injector idempotent — an incident
already recorded is never applied a second time, and a second application would
compound the latency it added — and it is the answer key the eval harness
grades investigations against.
"""

from pathlib import Path

from clickhouse_connect.driver.client import Client

from incidents import CHANNEL, Incident

LEDGER_DDL = Path(__file__).resolve().parents[2] / "sql" / "schema" / "002_incident_ledger.sql"
LEDGER_TABLE = "ghostslate_eval.injected_incidents"


def ensure_ledger(client: Client) -> None:
    cleaned_lines = [
        line for line in LEDGER_DDL.read_text().splitlines()
        if not line.strip().startswith("--")
    ]
    cleaned_sql = "\n".join(cleaned_lines)
    for statement in cleaned_sql.split(";"):
        stmt = statement.strip()
        if stmt:
            client.command(stmt)


def already_injected(client: Client, incident_id: str) -> bool:
    rows = client.query(
        f"SELECT count() FROM {LEDGER_TABLE} FINAL WHERE incident_id = {{id:String}}",
        parameters={"id": incident_id},
    ).result_rows
    return rows[0][0] > 0


def record(client: Client, incident: Incident) -> None:
    client.command(
        f"INSERT INTO {LEDGER_TABLE} ("
        "incident_id, kind, channel_id, window_start, window_end, "
        "ssp_id, device_class, codec, expected_root_cause, description, injected_at"
        ") VALUES ("
        "{incident_id:String}, {kind:String}, {channel_id:String}, "
        "toDateTime64({window_start:String}, 3, 'UTC'), "
        "toDateTime64({window_end:String}, 3, 'UTC'), "
        "{ssp_id:String}, {device_class:String}, {codec:String}, "
        "{expected_root_cause:String}, {description:String}, now('UTC')"
        ")",
        parameters={
            "incident_id": incident.incident_id,
            "kind": incident.kind,
            "channel_id": CHANNEL,
            "window_start": incident.window_start,
            "window_end": incident.window_end,
            "ssp_id": incident.ssp_id,
            "device_class": incident.device_class,
            "codec": incident.codec,
            "expected_root_cause": incident.expected_root_cause,
            "description": incident.description,
        },
    )
