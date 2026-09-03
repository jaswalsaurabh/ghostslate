"""The scripted incidents planted into the baseline telemetry.

Each incident is a declarative description of a cohort, a time window and the
way that cohort's auction latency (or error rate) departs from the baseline.
The injector turns each one into a single ``ALTER TABLE ... UPDATE``.

Every incident also carries the verdict a correct investigation should reach.
That verdict is written to the ground-truth ledger, so the eval harness asserts
against the same definition the data was built from.
"""

from dataclasses import dataclass, field

# Stitcher deadlines. These originate in sql/seed/003-baseline-telemetry.sql;
# an injected latency is only meaningful relative to the thresholds the
# baseline used to assign a status.
SLATE_THRESHOLD_MS = 450
TIMEOUT_THRESHOLD_MS = 1200

CHANNEL = "ch-01"


@dataclass(frozen=True)
class Incident:
    incident_id: str
    kind: str  # 'primary' | 'positive_variant' | 'confounder' | 'negative_control'
    window_start: str
    window_end: str
    # SQL fragment producing the new latency in ms. May reference the existing
    # row's columns; ALTER UPDATE evaluates it against pre-update values.
    latency_expr: str
    description: str
    expected_root_cause: str
    ssp_id: str = ""
    device_class: str = ""
    codec: str = ""
    # Set when the incident changes status directly rather than through latency.
    status_expr: str = ""
    extra_where: list[str] = field(default_factory=list)

    def cohort_where(self) -> str:
        """The rows this incident touches."""
        clauses = [
            f"channel_id = '{CHANNEL}'",
            f"attempt_time >= toDateTime64('{self.window_start}', 3, 'UTC')",
            f"attempt_time < toDateTime64('{self.window_end}', 3, 'UTC')",
        ]
        for column, value in (
            ("ssp_id", self.ssp_id),
            ("device_class", self.device_class),
            ("codec", self.codec),
        ):
            if value:
                clauses.append(f"{column} = '{value}'")
        clauses.extend(self.extra_where)
        return " AND ".join(clauses)

    def set_clause(self) -> str:
        """The SET fragment, with status kept consistent with the new latency.

        A row that already failed outright stays an ERROR: a slow auction does
        not retroactively turn a hard failure into a fill.
        """
        latency = self.latency_expr
        status = self.status_expr or (
            "multiIf("
            "stitch_status = 'ERROR', 'ERROR', "
            f"{latency} > {TIMEOUT_THRESHOLD_MS}, 'TIMEOUT', "
            f"{latency} > {SLATE_THRESHOLD_MS}, 'SLATE_FALLBACK', "
            "'FILLED')"
        )
        return f"ad_response_latency_ms = {latency}, stitch_status = {status}"


def uniform(salt: int) -> str:
    """A deterministic per-row draw in [0, 1).

    Stitch attempts have no primary key, so the draw is hashed from the columns
    that together identify a row. Deterministic means re-running the injector on
    a rebuilt baseline reproduces the same incident exactly.
    """
    return (
        "((cityHash64(splice_event_id, toUnixTimestamp64Milli(attempt_time), "
        f"ad_response_latency_ms, {salt}) % 100000) / 100000.0)"
    )


def severity_ramp(start: str, end: str) -> str:
    """Smooth rise and fall across the window, peaking in the middle.

    A real SSP degradation ramps; a rectangular step would be the tell that the
    data was scripted.
    """
    start_ms = f"toUnixTimestamp64Milli(toDateTime64('{start}', 3, 'UTC'))"
    end_ms = f"toUnixTimestamp64Milli(toDateTime64('{end}', 3, 'UTC'))"
    position = (
        f"((toUnixTimestamp64Milli(attempt_time) - {start_ms}) / "
        f"toFloat64({end_ms} - {start_ms}))"
    )
    return f"(0.35 + 0.65 * sin(pi() * {position}))"


def _clamped(expr: str) -> str:
    return f"toUInt32(least(greatest(round({expr}), 20), 5000))"


PRIMARY_START = "2026-08-14 19:00:00.000"
PRIMARY_END = "2026-08-14 23:00:00.000"

INCIDENTS: list[Incident] = [
    Incident(
        incident_id="primary-ssp-beta-ctv-hevc",
        kind="primary",
        window_start=PRIMARY_START,
        window_end=PRIMARY_END,
        ssp_id="ssp-beta",
        device_class="connected_tv",
        codec="hevc",
        latency_expr=_clamped(
            "ad_response_latency_ms + 1150 * "
            f"{severity_ramp(PRIMARY_START, PRIMARY_END)} * (0.5 + 1.1 * {uniform(7001)})"
        ),
        description=(
            "ssp-beta auction latency breaches the stitcher deadline for HEVC "
            "connected-TV inventory across primetime, so the stitcher falls back "
            "to slate instead of an ad."
        ),
        expected_root_cause="ssp-beta auction latency on connected_tv/hevc",
    ),
    Incident(
        incident_id="confounder-ssp-gamma-slow-but-inside-deadline",
        kind="confounder",
        window_start="2026-08-14 20:00:00.000",
        window_end="2026-08-14 21:00:00.000",
        ssp_id="ssp-gamma",
        # Capped below the slate threshold: latency charts show a spike, the
        # fill rate does not move. A correct investigation rejects this.
        latency_expr=_clamped(
            f"if(ad_response_latency_ms > {SLATE_THRESHOLD_MS - 20}, "
            f"ad_response_latency_ms, "
            f"least(ad_response_latency_ms + 120, {SLATE_THRESHOLD_MS - 20}))"
        ),
        description=(
            "ssp-gamma latency rises during the same hour as the primary incident "
            "but stays inside the stitcher deadline and causes no slate."
        ),
        expected_root_cause="",
    ),
    Incident(
        incident_id="confounder-set-top-box-errors",
        kind="confounder",
        window_start="2026-08-12 08:00:00.000",
        window_end="2026-08-12 12:00:00.000",
        device_class="set_top_box",
        latency_expr="ad_response_latency_ms",
        status_expr=f"if({uniform(7003)} < 0.03, 'ERROR', stitch_status)",
        description=(
            "An unrelated set-top-box ad-call error blip two days earlier. Errors "
            "are not slate: conflating the two is the mistake this case catches."
        ),
        expected_root_cause="",
    ),
    Incident(
        incident_id="negative-control-diffuse-primetime",
        kind="negative_control",
        window_start="2026-08-09 19:00:00.000",
        window_end="2026-08-09 23:00:00.000",
        latency_expr=_clamped(f"ad_response_latency_ms + 40 + 30 * {uniform(7004)}"),
        description=(
            "Slate rate is mildly elevated across the whole window with no cohort "
            "concentration. There is no root cause to find, and the correct "
            "answer is to say so."
        ),
        expected_root_cause="",
    ),
    Incident(
        incident_id="variant-ssp-delta-mobile-h264-black-screen",
        kind="positive_variant",
        window_start="2026-08-16 10:00:00.000",
        window_end="2026-08-16 12:00:00.000",
        ssp_id="ssp-delta",
        device_class="mobile",
        codec="h264",
        latency_expr=_clamped(
            "ad_response_latency_ms + 1250 * "
            f"{severity_ramp('2026-08-16 10:00:00.000', '2026-08-16 12:00:00.000')} "
            f"* (0.55 + 1.0 * {uniform(7005)})"
        ),
        description=(
            "ssp-delta auction latency breaches the stitcher deadline for mobile "
            "H.264 daytime inventory and manifests as a black-screen fallback slate."
        ),
        expected_root_cause="ssp-delta auction latency on mobile/h264",
    ),
]
