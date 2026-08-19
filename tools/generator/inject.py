"""Inject the scripted incidents into the baseline telemetry.

The 100M-row baseline is generated inside ClickHouse and is deliberately
uneventful. This script rewrites a few thousand of those rows so the telemetry
contains one real incident, two red herrings and a window where nothing is
wrong — the four cases the investigation is judged on.

    python tools/generator/inject.py            # apply everything not yet applied
    python tools/generator/inject.py --dry-run  # print the SQL instead
    python tools/generator/inject.py --status   # show what the ledger holds

Injection is one-way. To start over, rebuild the baseline from an empty volume.
"""

import argparse
import sys

from clickhouse_connect.driver.client import Client

from client import connect
from incidents import INCIDENTS, Incident
from ledger import LEDGER_TABLE, already_injected, ensure_ledger, record

TARGET_TABLE = "ghostslate.ssai_stitch_attempts"


def mutation_sql(incident: Incident) -> str:
    """One ALTER UPDATE, restricted to the single day partition it touches.

    The partition hint is what keeps the rewrite to a few million rows instead
    of a hundred million.
    """
    day = incident.window_start[:10].replace("-", "")
    if incident.window_end[:10].replace("-", "") != day:
        raise ValueError(f"{incident.incident_id} spans more than one partition")
    return (
        f"ALTER TABLE {TARGET_TABLE} "
        f"UPDATE {incident.set_clause()} "
        f"IN PARTITION '{day}' "
        f"WHERE {incident.cohort_where()}"
    )


def apply(client: Client, incident: Incident) -> None:
    client.command(mutation_sql(incident), settings={"mutations_sync": 2})
    record(client, incident)


def show_status(client: Client) -> None:
    rows = client.query(
        f"SELECT incident_id, kind, window_start, injected_at "
        f"FROM {LEDGER_TABLE} FINAL ORDER BY window_start"
    ).result_rows
    if not rows:
        print("No incidents injected.")
        return
    for incident_id, kind, window_start, injected_at in rows:
        print(f"{injected_at}  {kind:<16} {window_start}  {incident_id}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="print SQL, change nothing")
    parser.add_argument("--status", action="store_true", help="list injected incidents")
    parser.add_argument(
        "--repair-ledger",
        action="store_true",
        help="re-record incidents into ledger without mutating telemetry",
    )
    args = parser.parse_args()

    if args.dry_run:
        for incident in INCIDENTS:
            print(f"-- {incident.incident_id}\n{mutation_sql(incident)};\n")
        return 0

    client = connect()
    ensure_ledger(client)

    if args.status:
        show_status(client)
        return 0

    if args.repair_ledger:
        for incident in INCIDENTS:
            print(f"record {incident.incident_id} ...", flush=True)
            record(client, incident)
            print(f"done   {incident.incident_id}")
        return 0

    for incident in INCIDENTS:
        if already_injected(client, incident.incident_id):
            print(f"skip  {incident.incident_id} (already injected)")
            continue
        print(f"apply {incident.incident_id} ...", flush=True)
        apply(client, incident)
        print(f"done  {incident.incident_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
