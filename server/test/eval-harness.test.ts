import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  decodeDiagnosisRows,
  type DiagnosisRow,
  type InvestigationContext,
} from '../src/services/evidence.helper.js';
import {
  GroundingService,
  renderDiagnosis,
  type DiagnosisEvidence,
} from '../src/services/grounding.service.js';
import { MetricsService, selectIncidentCohort } from '../src/services/metrics.service.js';
import { STITCHER_DEADLINE_MS } from '../src/services/incident.constants.js';
import type { InvestigationEvent } from '../src/services/investigation.service.js';
import type { FrameClassification } from '../src/services/vision.service.js';

interface ExpectedIncident {
  sspId: string;
  deviceClass: string;
  codec: string;
  cues: number;
  totalAttempts: number;
  unmonetizedImpressions: number;
  unmonetizedPct: number;
  cpmUsd: number;
  expectedLoss: number;
}

interface EvalCase {
  id: string;
  channel: string;
  from: string;
  to: string;
  canonicalEvidencePath: string | null;
  transcriptPath: string | null;
  expected: {
    selectedIncident: ExpectedIncident | null;
    requireVisionConfirmation: boolean;
  };
}

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../..');
const evalCases = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'eval/cases.json'), 'utf8'),
) as EvalCase[];

function readJson(relativePath: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function readTranscript(relativePath: string): InvestigationEvent[] {
  return fs
    .readFileSync(path.join(repoRoot, relativePath), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as InvestigationEvent);
}

function canonicalRowsFromTranscript(
  evalCase: EvalCase,
  events: InvestigationEvent[],
): DiagnosisRow[] {
  const results = events.filter(
    (event) =>
      event.type === 'tool_result' &&
      event.data.name === 'collect_diagnosis_evidence' &&
      event.data.isError === false,
  );
  if (results.length !== 1) {
    throw new Error(
      `${evalCase.id} must contain exactly one successful canonical evidence result; found ${results.length}`,
    );
  }

  const result = results[0]?.data.result;
  if (typeof result !== 'string') {
    throw new Error(`${evalCase.id} canonical evidence result is not a string`);
  }
  return decodeDiagnosisRows(JSON.parse(result), evalCase.channel);
}

function capturedFrame(events: InvestigationEvent[]): FrameClassification | null {
  const data = events.find((event) => event.type === 'frame_classified')?.data;
  if (!data) return null;
  return {
    classification: data.classification as FrameClassification['classification'],
    confidence: data.confidence as number,
    slate_type: data.slate_type as FrameClassification['slate_type'],
    text_detected: data.text_detected as string,
    visual_summary: data.visual_summary as string,
    contentHash: data.contentHash as string,
    cached: data.cached as boolean,
    timestampSeconds: data.timestampSeconds as number,
  };
}

function maximumReasoningTurn(events: InvestigationEvent[]): number {
  const turns = events
    .filter((event) => event.type === 'status')
    .map((event) => /^Reasoning turn (\d+)\.\.\.$/.exec(String(event.data.message))?.[1])
    .filter((turn): turn is string => Boolean(turn))
    .map(Number);

  if (turns.length === 0) {
    throw new Error('Transcript contains no reasoning-turn status events.');
  }
  return Math.max(...turns);
}

function caseEvidence(evalCase: EvalCase): {
  rows: DiagnosisRow[];
  events: InvestigationEvent[] | null;
} {
  if (evalCase.transcriptPath) {
    const events = readTranscript(evalCase.transcriptPath);
    return { rows: canonicalRowsFromTranscript(evalCase, events), events };
  }
  if (evalCase.canonicalEvidencePath) {
    return {
      rows: decodeDiagnosisRows(readJson(evalCase.canonicalEvidencePath), evalCase.channel),
      events: null,
    };
  }
  throw new Error(`${evalCase.id} has no evidence source`);
}

describe('GhostSlate evaluation harness', () => {
  const metrics = new MetricsService();
  const grounding = new GroundingService();

  it('defines the five roadmap cases', () => {
    expect(evalCases.map((evalCase) => evalCase.id)).toEqual([
      'primary-incident',
      'latency-confounder-isolation',
      'stb-error-confounder',
      'negative-control',
      'small-sample-guard',
    ]);
  });

  describe.each(evalCases)('$id', (evalCase) => {
    const { rows, events } = caseEvidence(evalCase);
    const incident = selectIncidentCohort(rows);

    it('selects only the expected incident', () => {
      if (!evalCase.expected.selectedIncident) {
        expect(incident).toBeNull();
        return;
      }

      const expected = evalCase.expected.selectedIncident;
      expect(incident).toMatchObject({
        sspId: expected.sspId,
        deviceClass: expected.deviceClass,
        codec: expected.codec,
        cues: expected.cues,
        totalAttempts: expected.totalAttempts,
        unmonetizedImpressions: expected.unmonetizedImpressions,
        unmonetizedPct: expected.unmonetizedPct,
        cpmUsd: expected.cpmUsd,
      });
      expect(metrics.computeLoss(incident!.unmonetizedImpressions, incident!.cpmUsd!)).toBe(
        expected.expectedLoss,
      );
    });

    it('finishes every captured run successfully within 15 turns', () => {
      if (!events) return;
      expect(maximumReasoningTurn(events)).toBeLessThanOrEqual(15);
      const finalizations = events.filter(
        (event) => event.type === 'tool_result' && event.data.name === 'finalize_investigation',
      );
      expect(finalizations.length).toBeGreaterThan(0);
      expect(finalizations.at(-1)?.data.isError).toBe(false);
      expect(events.find((event) => event.type === 'diagnosis')).toBeDefined();
    });
  });

  it('grounds the primary diagnosis in its captured canonical rows and frame', () => {
    const evalCase = evalCases.find((candidate) => candidate.id === 'primary-incident')!;
    const { rows, events } = caseEvidence(evalCase);
    const frame = capturedFrame(events!);
    const evidence: DiagnosisEvidence = {
      context: { channel: evalCase.channel, from: evalCase.from, to: evalCase.to },
      rows,
      incident: selectIncidentCohort(rows),
      frame,
    };
    const diagnosis = renderDiagnosis(evidence);
    const capturedDiagnosis = events!.find((event) => event.type === 'diagnosis')!;

    expect(frame).toMatchObject({ classification: 'slate', contentHash: expect.any(String) });
    expect(diagnosis).toContain('`ssp-beta`');
    expect(diagnosis).toContain('$1,933.17');
    expect(grounding.buildReport(evidence).grounded).toBe(true);
    expect((capturedDiagnosis.data.grounding as { grounded: boolean }).grounded).toBe(true);
  });

  it('captures primary schema discovery and exploratory SQL through MCP', () => {
    const evalCase = evalCases.find((candidate) => candidate.id === 'primary-incident')!;
    const events = caseEvidence(evalCase).events!;
    expect(
      events.some(
        (event) =>
          event.type === 'tool_result' &&
          event.data.name === 'list_tables' &&
          event.data.isError === false,
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'tool_result' &&
          event.data.name === 'run_query' &&
          event.data.isError === false &&
          typeof event.data.sql === 'string' &&
          event.data.sql.length > 0,
      ),
    ).toBe(true);
  });

  it('keeps the 430ms ssp-gamma latency confounder below the deadline and unselected', () => {
    const evalCase = evalCases.find(
      (candidate) => candidate.id === 'latency-confounder-isolation',
    )!;
    const rows = caseEvidence(evalCase).rows;
    const gammaRows = rows.filter((row) => row.sspId === 'ssp-gamma');

    expect(gammaRows.length).toBeGreaterThan(0);
    expect(Math.max(...gammaRows.map((row) => row.p95AuctionMs))).toBe(430);
    expect(430).toBeLessThan(STITCHER_DEADLINE_MS);
    expect(selectIncidentCohort(rows)?.sspId).toBe('ssp-beta');
  });

  it('suppresses a busy five-cue window and renders insufficient evidence', () => {
    const evalCase = evalCases.find((candidate) => candidate.id === 'small-sample-guard')!;
    const { rows, events } = caseEvidence(evalCase);
    const queryResults = events!
      .filter((event) => event.type === 'tool_result' && event.data.name === 'run_query')
      .map((event) => JSON.parse(String(event.data.result)) as { rows: unknown[][] });
    const context: InvestigationContext = {
      channel: evalCase.channel,
      from: evalCase.from,
      to: evalCase.to,
    };
    const evidence: DiagnosisEvidence = {
      context,
      rows,
      incident: selectIncidentCohort(rows),
      frame: null,
    };
    const diagnosis = renderDiagnosis(evidence);

    expect(queryResults[0]?.rows).toEqual([[5]]);
    expect(queryResults[1]?.rows).toEqual([[61405]]);
    expect(rows).toEqual([]);
    expect(evidence.incident).toBeNull();
    expect(diagnosis).toContain('insufficient qualifying evidence');
    expect(diagnosis).not.toContain('$');
    expect(diagnosis).not.toContain('**Root Cause Cohort:**');
    expect(diagnosis).not.toContain('Immediately reroute');
  });
});
