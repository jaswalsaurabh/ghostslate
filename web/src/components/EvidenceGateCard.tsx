import type { InvestigationEvidenceSummary } from '../types.js';

interface EvidenceGateCardProps {
  summary?: InvestigationEvidenceSummary | undefined;
  visionConfirmed: boolean;
  visionConfidence?: number | null | undefined;
}

export function EvidenceGateCard({
  summary,
  visionConfirmed,
  visionConfidence,
}: EvidenceGateCardProps) {
  if (!summary?.candidate) return null;

  const { candidate, thresholds } = summary;
  const incident = summary.outcome === 'incident';

  if (incident) {
    const latencyBreached = candidate.p95AuctionMs > thresholds.stitcherDeadlineMs;
    const hardTimeoutBreached = candidate.p95AuctionMs > thresholds.hardAuctionTimeoutMs;
    const maxVal = latencyBreached
      ? Math.max(
          candidate.p95AuctionMs,
          thresholds.stitcherDeadlineMs,
          thresholds.hardAuctionTimeoutMs,
        )
      : Math.max(candidate.unmonetizedPct, thresholds.incidentFailurePct);
    const firstGatePct = latencyBreached
      ? (thresholds.stitcherDeadlineMs / maxVal) * 100
      : (thresholds.incidentFailurePct / maxVal) * 100;
    const observedPct = latencyBreached
      ? (candidate.p95AuctionMs / maxVal) * 100
      : (candidate.unmonetizedPct / maxVal) * 100;
    const deadlineMultiplier = Math.round(candidate.p95AuctionMs / thresholds.stitcherDeadlineMs);

    return (
      <section
        className="mx-5 mb-5 rounded-inset border border-border-subtle bg-surface-card p-4"
        aria-labelledby="causal-title"
      >
        <div className="flex items-start justify-between gap-3 font-mono">
          <div>
            <span className="block text-micro uppercase tracking-widest text-text-muted">
              Causal evidence
            </span>
            <h3 id="causal-title" className="mt-1 font-sans text-xs font-bold text-text-primary">
              Why the slate appeared
            </h3>
          </div>
          <strong className="text-detail font-bold text-status-critical whitespace-nowrap">
            {latencyBreached
              ? deadlineMultiplier > 1
                ? `${deadlineMultiplier}× deadline`
                : 'Deadline breached'
              : 'Isolation proven'}
          </strong>
        </div>

        <p className="my-2 mb-4 text-compact leading-normal text-text-secondary">
          {hardTimeoutBreached
            ? 'The affected SSP completed after both SSAI auction thresholds, forcing the stream to use replacement inventory.'
            : latencyBreached
              ? 'The affected SSP exceeded the stitcher deadline, causing the ad stitcher to fallback to slate.'
              : `The selected cohort exceeded the ${thresholds.incidentFailurePct}% incident threshold and passed the ${thresholds.cohortDispersionPp}pp isolation gate. Its latency remained within the stitcher deadline, so latency is not presented as the cause.`}
        </p>

        <div className="relative mx-1 h-1.5 rounded-full bg-border-strong" aria-hidden="true">
          <div className="absolute inset-0 rounded-inherit bg-linear-to-r from-status-success via-status-warning to-status-critical opacity-75" />
          <i
            style={{ left: `${Math.min(95, Math.max(5, firstGatePct)).toFixed(1)}%` }}
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-panel bg-status-warning shadow-status-warning-ring"
            title={
              latencyBreached
                ? `Deadline: ${thresholds.stitcherDeadlineMs} ms`
                : `Incident threshold: ${thresholds.incidentFailurePct}%`
            }
          />
          {latencyBreached && (
            <i
              style={{
                left: `${Math.min(95, Math.max(5, (thresholds.hardAuctionTimeoutMs / maxVal) * 100)).toFixed(1)}%`,
              }}
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-panel bg-status-warning shadow-status-warning-ring"
              title={`Timeout: ${thresholds.hardAuctionTimeoutMs} ms`}
            />
          )}
          <i
            style={{ left: `${Math.min(100, Math.max(5, observedPct)).toFixed(1)}%` }}
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-panel bg-status-critical shadow-status-critical-ring"
            title={
              latencyBreached
                ? `Observed: ${Math.round(candidate.p95AuctionMs)} ms`
                : `Observed: ${candidate.unmonetizedPct.toFixed(1)}%`
            }
          />
        </div>

        <div
          className={`mt-2.5 grid gap-2 font-mono text-micro leading-dense text-text-muted ${latencyBreached ? 'grid-cols-4' : 'grid-cols-3'}`}
          aria-label={latencyBreached ? 'Auction latency comparison' : 'Incident rate comparison'}
        >
          <div>
            <b className="block font-bold text-text-secondary">{latencyBreached ? '0 ms' : '0%'}</b>
            {latencyBreached ? 'Cue' : 'Baseline'}
          </div>
          <div className="text-center">
            <b className="block font-bold text-text-secondary">
              {latencyBreached
                ? `${thresholds.stitcherDeadlineMs} ms`
                : `${thresholds.incidentFailurePct}%`}
            </b>
            {latencyBreached ? 'Deadline' : 'Incident threshold'}
          </div>
          {latencyBreached && (
            <div className="text-center">
              <b className="block font-bold text-text-secondary">
                {thresholds.hardAuctionTimeoutMs.toLocaleString()} ms
              </b>
              Hard timeout
            </div>
          )}
          <div className="text-right text-status-critical">
            <b className="block font-bold text-status-critical">
              {latencyBreached
                ? `${Math.round(candidate.p95AuctionMs).toLocaleString()} ms`
                : `${candidate.unmonetizedPct.toFixed(1)}%`}
            </b>
            {latencyBreached ? 'Observed p95' : 'Observed cohort'}
          </div>
        </div>

        <div className="mt-3 border-t border-border-subtle pt-3 font-mono text-caption text-text-secondary">
          <strong className={visionConfirmed ? 'text-status-critical' : 'text-text-secondary'}>
            {visionConfirmed ? 'Slate confirmed by Gemini Vision' : 'Awaiting Vision confirmation'}
          </strong>
          {visionConfirmed && typeof visionConfidence === 'number'
            ? ` · ${Math.round(visionConfidence * 100)}% confidence`
            : ''}
        </div>
      </section>
    );
  }

  const thresholdPosPct = 95;
  const ratio =
    thresholds.incidentFailurePct > 0
      ? candidate.unmonetizedPct / thresholds.incidentFailurePct
      : 0;
  const observedPct = Math.min(thresholdPosPct, Math.max(5, ratio * thresholdPosPct));
  const showsFailureThreshold = summary.reason === 'BELOW_FAILURE_THRESHOLD';
  const gateLabel =
    summary.reason === 'INSUFFICIENT_SAMPLE_SIZE'
      ? 'Sample guard held'
      : summary.reason === 'DIFFUSE_VARIATION'
        ? 'Isolation not proven'
        : summary.reason === 'LONE_COHORT'
          ? 'Peers unavailable'
          : summary.reason === 'NO_DATA'
            ? 'No telemetry'
            : 'At or below threshold';

  return (
    <section
      className="mx-5 mb-5 rounded-inset border border-border-subtle bg-surface-card p-4"
      aria-labelledby="control-gate-title"
    >
      <div className="flex items-start justify-between gap-3 font-mono">
        <div>
          <span className="block text-micro uppercase tracking-widest text-text-muted">
            Evidence gate
          </span>
          <h3
            id="control-gate-title"
            className="mt-1 font-sans text-xs font-bold text-text-primary"
          >
            Why the agent stopped
          </h3>
        </div>
        <strong className="text-detail font-bold text-status-success whitespace-nowrap">
          {gateLabel}
        </strong>
      </div>

      <p className="my-2 mb-4 text-compact leading-normal text-text-secondary">
        {summary.reason === 'INSUFFICIENT_SAMPLE_SIZE'
          ? `All observed cohorts had fewer than ${thresholds.minimumCues} cues; small-sample guard prevented ungrounded causal attribution.`
          : summary.reason === 'DIFFUSE_VARIATION'
            ? `Cohort dispersion remained below the ${thresholds.cohortDispersionPp}pp isolation threshold against peer cohorts.`
            : summary.reason === 'LONE_COHORT'
              ? 'No peer cohorts were available in the daypart to evaluate dispersion and verify anomaly isolation.'
              : summary.reason === 'NO_DATA'
                ? 'No telemetry records were found in this window.'
                : 'The strongest cohort did not exceed the incident threshold, so the agent made no causal or financial claim.'}
      </p>

      {showsFailureThreshold && (
        <>
          <div className="relative mx-1 h-1.5 rounded-full bg-border-strong" aria-hidden="true">
            <div
              className="absolute inset-y-0 left-0 rounded-inherit bg-status-success opacity-85"
              style={{ width: `${observedPct.toFixed(1)}%` }}
            />
            <i
              style={{ left: `${observedPct.toFixed(1)}%` }}
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-panel bg-status-success shadow-status-success-ring"
              title={`Observed: ${candidate.unmonetizedPct.toFixed(1)}%`}
            />
            <i
              style={{ left: `${thresholdPosPct}%` }}
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-panel bg-text-muted shadow-text-muted-ring"
              title={`Threshold: ${thresholds.incidentFailurePct}%`}
            />
          </div>

          <div
            className="mt-2.5 grid grid-cols-3 gap-2 font-mono text-micro leading-dense text-text-muted"
            aria-label="Incident threshold comparison"
          >
            <div>
              <b className="block font-bold text-text-secondary">0%</b>Baseline
            </div>
            <div className="text-center text-status-success">
              <b className="block font-bold text-status-success">
                {candidate.unmonetizedPct.toFixed(1)}%
              </b>
              Observed maximum
            </div>
            <div className="text-right">
              <b className="block font-bold text-text-secondary">
                {thresholds.incidentFailurePct}%
              </b>
              Incident threshold
            </div>
          </div>
        </>
      )}

      <div className="mt-3 border-t border-border-subtle pt-3 font-mono text-caption text-text-secondary">
        <strong className="text-status-success">Evidence gate held</strong> · no agent Vision
        evidence admitted · no remediation
      </div>
    </section>
  );
}
