import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildRemediationDecision,
  RemediationService,
  type RemediationProposal,
} from '../src/services/remediation.service.js';
import type { DiagnosisEvidence, GroundingReport } from '../src/services/grounding.service.js';
import type { InvestigationRun } from '../src/services/investigation-runs.service.js';
import type { DiagnosisRow } from '../src/services/evidence.helper.js';
import { STITCHER_DEADLINE_MS } from '../src/services/incident.constants.js';
import { ConflictError } from '../src/errors/domain-error.js';

describe('Remediation Domain Logic & Service', () => {
  const baseContext = {
    channel: 'ch-01',
    from: '2026-08-14T19:00:00.000Z',
    to: '2026-08-14T23:00:00.000Z',
  };

  const incidentRow: DiagnosisRow = {
    channelId: 'ch-01',
    sspId: 'ssp-beta',
    deviceClass: 'ctv',
    codec: 'hevc',
    daypart: 'prime',
    cues: 44,
    totalAttempts: 132,
    unmonetizedImpressions: 129,
    unmonetizedPct: 97.72727,
    p95AuctionMs: 1450.5,
    cpmUsd: 14.9858,
  };

  const peerRow: DiagnosisRow = {
    channelId: 'ch-01',
    sspId: 'ssp-alpha',
    deviceClass: 'mobile',
    codec: 'h264',
    daypart: 'prime',
    cues: 44,
    totalAttempts: 132,
    unmonetizedImpressions: 4,
    unmonetizedPct: 3.0303,
    p95AuctionMs: 120.0,
    cpmUsd: 18.5,
  };

  const groundedReport: GroundingReport = { grounded: true, violations: [], checkedClaims: 11 };
  const ungroundedReport: GroundingReport = {
    grounded: false,
    violations: [{ claim: '99.9%', context: 'invalid' }],
    checkedClaims: 1,
  };

  const positiveEvidence: DiagnosisEvidence = {
    context: baseContext,
    rows: [incidentRow, peerRow],
    incident: incidentRow,
    frame: {
      classification: 'slate',
      confidence: 0.98,
      slate_type: 'looping_card',
      text_detected: 'Break',
      visual_summary: 'Slate card',
      contentHash: 'hash-abc',
      cached: false,
      timestampSeconds: 5,
    },
  };

  describe('1. buildRemediationDecision Pure Function', () => {
    it('1. Positive grounded evidence builds exact staged reroute proposal', () => {
      const decision = buildRemediationDecision(positiveEvidence, groundedReport);
      expect(decision.status).toBe('staged');
      if (decision.status === 'staged') {
        expect(decision.proposal.action).toBe('reroute_ssp_cohort');
        expect(decision.proposal.target).toEqual({
          channelId: 'ch-01',
          sspId: 'ssp-beta',
          deviceClass: 'ctv',
          codec: 'hevc',
          daypart: 'prime',
        });
        expect(decision.proposal.window).toEqual({
          from: '2026-08-14T19:00:00.000Z',
          to: '2026-08-14T23:00:00.000Z',
        });
        expect(decision.proposal.evidence).toEqual({
          cues: 44,
          unmonetizedImpressions: 129,
          unmonetizedPct: 97.72727,
          p95AuctionMs: 1450.5,
          stitcherDeadlineMs: STITCHER_DEADLINE_MS,
        });
      }
    });

    it('2. Grounding rule: every identifier & numeric field traces to evidence or constants', () => {
      const decision = buildRemediationDecision(positiveEvidence, groundedReport);
      expect(decision.status).toBe('staged');
      if (decision.status === 'staged') {
        const { target, window, evidence } = decision.proposal;
        expect(target.sspId).toBe(incidentRow.sspId);
        expect(window.from).toBe(baseContext.from);
        expect(evidence.cues).toBe(incidentRow.cues);
        expect(evidence.stitcherDeadlineMs).toBe(STITCHER_DEADLINE_MS);
      }
    });

    it('3. Ungrounded evidence produces UNGROUNDED decision', () => {
      const decision = buildRemediationDecision(positiveEvidence, ungroundedReport);
      expect(decision).toEqual({ status: 'unavailable', reason: 'UNGROUNDED' });
    });

    it('4. Empty canonical rows produce INSUFFICIENT_EVIDENCE decision', () => {
      const emptyEvidence = { context: baseContext, rows: [], incident: null, frame: null };
      expect(buildRemediationDecision(emptyEvidence, groundedReport)).toEqual({
        status: 'unavailable',
        reason: 'INSUFFICIENT_EVIDENCE',
      });
    });

    it('5. Non-empty evidence with no incident produces NO_INCIDENT decision', () => {
      const nominalEvidence = {
        context: baseContext,
        rows: [peerRow],
        incident: null,
        frame: null,
      };
      expect(buildRemediationDecision(nominalEvidence, groundedReport)).toEqual({
        status: 'unavailable',
        reason: 'NO_INCIDENT',
      });
    });
  });

  describe('2. RemediationService Approval & Idempotency', () => {
    const fixedIsoTime = '2026-08-14T20:00:00.000Z';
    const mockNow = () => new Date(fixedIsoTime);

    const stagedProposal: RemediationProposal = {
      action: 'reroute_ssp_cohort',
      target: {
        channelId: 'ch-01',
        sspId: 'ssp-beta',
        deviceClass: 'ctv',
        codec: 'hevc',
        daypart: 'prime',
      },
      window: baseContext,
      evidence: {
        cues: 44,
        unmonetizedImpressions: 129,
        unmonetizedPct: 97.73,
        p95AuctionMs: 1450,
        stitcherDeadlineMs: STITCHER_DEADLINE_MS,
      },
    };

    const makeCompletedRun = (runKey: string): InvestigationRun => ({
      runKey,
      status: 'complete',
      startedAt: '2026-08-14T19:59:00.000Z',
      events: [],
      result: {
        diagnosis: 'Root cause confirmed.',
        steps: [],
        toolCallsCount: 2,
        remediation: { status: 'staged', proposal: stagedProposal },
      },
    });

    it('6. First approval returns created: true, stores an emitted state, and logs exactly once', () => {
      const logger = { info: vi.fn() };
      const service = new RemediationService(logger, mockNow);
      const runKey = 'run-test-01';
      const run = makeCompletedRun(runKey);

      const res = service.approve(runKey, run);
      expect(res.created).toBe(true);
      expect(res.remediation.status).toBe('emitted');

      const expectedEmissionId = createHash('sha256')
        .update(`${runKey}|reroute_ssp_cohort`)
        .digest('hex');
      expect(res.remediation.emission).toEqual({
        emissionId: expectedEmissionId,
        runKey,
        approvedAt: fixedIsoTime,
        emittedAt: fixedIsoTime,
      });

      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(service.getState(runKey, run)).toEqual(res.remediation);
    });

    it('7. Second approval returns created: false with deeply equal original emitted state and preserves timestamps', () => {
      const logger = { info: vi.fn() };
      let clockTime = new Date('2026-08-14T20:00:00.000Z');
      const service = new RemediationService(logger, () => clockTime);
      const runKey = 'run-test-02';
      const run = makeCompletedRun(runKey);

      const first = service.approve(runKey, run);
      expect(first.created).toBe(true);

      clockTime = new Date('2026-08-14T20:05:00.000Z');
      const second = service.approve(runKey, run);
      expect(second.created).toBe(false);
      expect(second.remediation).toEqual(first.remediation);
      expect(second.remediation.emission.approvedAt).toBe('2026-08-14T20:00:00.000Z');
    });

    it('8. Duplicate approval does not call the logger again', () => {
      const logger = { info: vi.fn() };
      const service = new RemediationService(logger, mockNow);
      const runKey = 'run-test-03';
      const run = makeCompletedRun(runKey);

      service.approve(runKey, run);
      service.approve(runKey, run);
      expect(logger.info).toHaveBeenCalledTimes(1);
    });

    it('9. Running and failed runs are rejected with typed ConflictError', () => {
      const service = new RemediationService({ info: vi.fn() }, mockNow);
      const running: InvestigationRun = {
        runKey: 'k',
        status: 'running',
        startedAt: fixedIsoTime,
        events: [],
      };
      const failed: InvestigationRun = {
        runKey: 'k',
        status: 'failed',
        startedAt: fixedIsoTime,
        events: [],
      };
      const noRes: InvestigationRun = {
        runKey: 'k',
        status: 'complete',
        startedAt: fixedIsoTime,
        events: [],
      };

      expect(() => service.getState('k', running)).toThrow(ConflictError);
      expect(() => service.approve('k', running)).toThrow(ConflictError);
      expect(() => service.getState('k', failed)).toThrow(ConflictError);
      expect(() => service.approve('k', failed)).toThrow(ConflictError);
      expect(() => service.getState('k', noRes)).toThrow(ConflictError);
      expect(() => service.approve('k', noRes)).toThrow(ConflictError);
    });

    it('10. All three unavailable decisions reject approval with reason-specific ConflictError', () => {
      const service = new RemediationService({ info: vi.fn() }, mockNow);
      const makeRun = (
        reason: 'UNGROUNDED' | 'INSUFFICIENT_EVIDENCE' | 'NO_INCIDENT',
      ): InvestigationRun => ({
        runKey: 'k',
        status: 'complete',
        startedAt: fixedIsoTime,
        events: [],
        result: {
          diagnosis: 'diag',
          steps: [],
          toolCallsCount: 1,
          remediation: { status: 'unavailable', reason },
        },
      });

      expect(() => service.approve('k', makeRun('UNGROUNDED'))).toThrow(/grounding validation/);
      expect(() => service.approve('k', makeRun('INSUFFICIENT_EVIDENCE'))).toThrow(
        /insufficient qualifying/,
      );
      expect(() => service.approve('k', makeRun('NO_INCIDENT'))).toThrow(/no incident cohort/);
    });

    it('11. Deterministic clock injection preserves exact approval and emission timestamps', () => {
      const explicit = '2026-08-14T22:30:15.123Z';
      const service = new RemediationService({ info: vi.fn() }, () => new Date(explicit));
      const res = service.approve('k', makeCompletedRun('k'));
      expect(res.remediation.emission.approvedAt).toBe(explicit);
      expect(res.remediation.emission.emittedAt).toBe(explicit);
    });
  });

  describe('3. InvestigationService Integration', () => {
    it('12. The investigation result and diagnosis SSE event contain the server-built remediation decision', async () => {
      const { InvestigationService } = await import('../src/services/investigation.service.js');
      const mcpResult = JSON.stringify({
        columns: [
          'channel_id',
          'ssp_id',
          'device_class',
          'codec',
          'daypart',
          'cues',
          'total_attempts',
          'unmonetized_impressions',
          'unmonetized_pct',
          'p95_auction_ms',
          'cpm_usd',
        ],
        rows: [
          ['ch-01', 'ssp-beta', 'ctv', 'hevc', 'prime', 80, 60862, 59482, 97.73, 1812.0, 32.5],
          ['ch-01', 'ssp-alpha', 'ctv', 'hevc', 'prime', 80, 75000, 1800, 2.4, 305.0, 32.5],
        ],
        statistics: { rows_read: 60862 },
      });

      const mockMcpService = {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
        callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: mcpResult }] }),
        listTools: vi.fn(),
      };

      const mockVisionService = {
        classifyVideoTimestamp: vi.fn().mockResolvedValue({
          classification: 'slate',
          confidence: 0.98,
          slate_type: 'looping_card',
          text_detected: 'Break',
          visual_summary: 'Slate screen',
          contentHash: 'hash-123',
          cached: false,
          timestampSeconds: 12,
        }),
      };

      const mockGenerateContent = vi
        .fn()
        .mockResolvedValueOnce({
          candidates: [
            {
              content: {
                parts: [{ functionCall: { name: 'collect_diagnosis_evidence', args: {} } }],
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'classify_frame',
                      args: { video_file: 'slate.mp4', timestamp_seconds: 5 },
                    },
                  },
                ],
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          candidates: [
            {
              content: { parts: [{ functionCall: { name: 'finalize_investigation', args: {} } }] },
            },
          ],
        });

      const service = new InvestigationService(
        mockMcpService as unknown as import('../src/services/mcp.service.js').McpClientService,
        mockVisionService as unknown as import('../src/services/vision.service.js').VisionService,
      );
      (
        service as unknown as { ai: { models: { generateContent: typeof mockGenerateContent } } }
      ).ai = { models: { generateContent: mockGenerateContent } };

      const generator = service.investigateSpike('Investigate slate bleed on ch-01', baseContext);
      const events = [];
      let result;
      while (true) {
        const next = await generator.next();
        if (next.done) {
          result = next.value;
          break;
        }
        events.push(next.value);
      }

      const diagnosisEvent = events.find((e) => e.type === 'diagnosis');
      expect(diagnosisEvent?.data.remediation).toBeDefined();
      expect(diagnosisEvent?.data.remediation).toEqual({
        status: 'staged',
        proposal: {
          action: 'reroute_ssp_cohort',
          target: {
            channelId: 'ch-01',
            sspId: 'ssp-beta',
            deviceClass: 'ctv',
            codec: 'hevc',
            daypart: 'prime',
          },
          window: {
            from: baseContext.from,
            to: baseContext.to,
          },
          evidence: {
            cues: 80,
            unmonetizedImpressions: 59482,
            unmonetizedPct: 97.73,
            p95AuctionMs: 1812.0,
            stitcherDeadlineMs: STITCHER_DEADLINE_MS,
          },
        },
      });
      expect(result?.remediation).toEqual(diagnosisEvent?.data.remediation);
    });
  });
});
