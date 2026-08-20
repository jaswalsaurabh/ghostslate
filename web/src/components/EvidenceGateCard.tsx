import { CheckCircle2, Clock3 } from 'lucide-react';
import type { InvestigationEvidenceSummary } from '../types.js';
import { Card } from './ui/index.js';

interface EvidenceGateCardProps {
  summary?: InvestigationEvidenceSummary | undefined;
  visionConfirmed: boolean;
}

export function EvidenceGateCard({ summary, visionConfirmed }: EvidenceGateCardProps) {
  if (!summary?.candidate) return null;

  const { candidate, thresholds } = summary;
  const incident = summary.outcome === 'incident';

  return (
    <Card variant="card" className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="font-mono text-xs uppercase tracking-wider text-text-muted">
            {incident ? 'Causal evidence' : 'Evidence gate'}
          </span>
          <h3 className="mt-1 text-sm font-bold text-text-primary">
            {incident ? 'Why the slate appeared' : 'Why the agent stopped'}
          </h3>
        </div>
        <span className={incident ? 'text-status-critical' : 'text-status-success'}>
          {incident ? <Clock3 className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        </span>
      </div>

      {incident ? (
        <>
          <p className="mt-3 text-xs leading-relaxed text-text-secondary">
            {candidate.p95AuctionMs > thresholds.hardAuctionTimeoutMs
              ? `The selected cohort exceeded both SSAI timing boundaries (observed p95: ${Math.round(candidate.p95AuctionMs)} ms > ${thresholds.hardAuctionTimeoutMs} ms timeout), forcing replacement slate.`
              : candidate.p95AuctionMs > thresholds.stitcherDeadlineMs
                ? `The selected cohort exceeded the SSAI stitcher deadline (observed p95: ${Math.round(candidate.p95AuctionMs)} ms > ${thresholds.stitcherDeadlineMs} ms deadline), resulting in slate fallback.`
                : `The selected cohort exhibited an isolated unmonetized spike (${candidate.unmonetizedPct.toFixed(1)}%) with auction latency within deadlines.`}
          </p>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-surface-hover"
            aria-hidden="true"
          >
            <div className="h-full rounded-full bg-status-critical" style={{ width: '100%' }} />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 font-mono text-xs text-text-muted">
            <span>
              <b className="block text-text-primary">0 ms</b>Cue
            </span>
            <span>
              <b className="block text-text-primary">{thresholds.stitcherDeadlineMs} ms</b>Deadline
            </span>
            <span>
              <b className="block text-text-primary">
                {thresholds.hardAuctionTimeoutMs.toLocaleString()} ms
              </b>
              Timeout
            </span>
            <span>
              <b className="block text-status-critical">
                {Math.round(candidate.p95AuctionMs).toLocaleString()} ms
              </b>
              Observed
            </span>
          </div>
          <p className="mt-4 border-t border-border-subtle pt-3 font-mono text-xs text-text-secondary">
            {visionConfirmed ? 'Slate confirmed by Gemini Vision' : 'Awaiting visual confirmation'}
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-xs leading-relaxed text-text-secondary">
            {summary.reason === 'INSUFFICIENT_SAMPLE_SIZE'
              ? `All observed cohorts had fewer than ${thresholds.minimumCues} cues. Small-sample guard prevented ungrounded causal attribution.`
              : summary.reason === 'DIFFUSE_VARIATION'
                ? `Cohort dispersion remained below ${thresholds.cohortDispersionPp}pp against peer cohorts, indicating diffuse variation rather than isolated failure.`
                : summary.reason === 'LONE_COHORT'
                  ? 'No peer cohorts were available in the daypart to evaluate dispersion and verify anomaly isolation.'
                  : summary.reason === 'NO_DATA'
                    ? 'No telemetry records were found in this window.'
                    : `The strongest eligible cohort (${candidate.unmonetizedPct.toFixed(1)}%) remained below the ${thresholds.incidentFailurePct}% incident threshold.`}
          </p>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-surface-hover"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-status-success"
              style={{
                width: `${Math.min(100, (candidate.unmonetizedPct / thresholds.incidentFailurePct) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-xs text-text-muted">
            <span>
              <b className="block text-text-primary">0%</b>Baseline
            </span>
            <span>
              <b className="block text-status-success">{candidate.unmonetizedPct.toFixed(1)}%</b>
              Observed max
            </span>
            <span>
              <b className="block text-text-primary">{thresholds.incidentFailurePct}%</b>Threshold
            </span>
          </div>
          <p className="mt-4 border-t border-border-subtle pt-3 font-mono text-xs text-text-secondary">
            Evidence gate held · no Vision evidence admitted · no remediation
          </p>
        </>
      )}
    </Card>
  );
}
