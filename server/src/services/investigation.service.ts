import { GoogleGenAI, type FunctionDeclaration, type Part } from '@google/genai';
import { McpClientService } from './mcp.service.js';
import { VisionService, type FrameClassification } from './vision.service.js';
import { MetricsService } from './metrics.service.js';
import { GroundingService, renderDiagnosis, type DiagnosisEvidence } from './grounding.service.js';
import { type InvestigationContext } from './evidence.helper.js';
import { selectIncidentCohort } from './metrics.service.js';
import { buildRemediationDecision, type RemediationDecision } from './remediation.service.js';
import { ServiceUnavailableError } from '../errors/domain-error.js';
import {
  createInvestigationToolDeclarations,
  InvestigationToolService,
  type ToolOutcome,
} from './investigation-tool.service.js';
import {
  HARD_AUCTION_TIMEOUT_MS,
  MINIMUM_COHORT_CUES,
  STITCHER_DEADLINE_MS,
} from './incident.constants.js';

export interface InvestigationEvent {
  type:
    | 'status'
    | 'tool_call'
    | 'tool_result'
    | 'vision_call'
    | 'frame_classified'
    | 'metrics'
    | 'reasoning'
    | 'diagnosis'
    | 'error';
  timestamp: string;
  data: Record<string, unknown>;
}

export interface InvestigationResult {
  diagnosis: string;
  steps: InvestigationEvent[];
  toolCallsCount: number;
  remediation: RemediationDecision;
}

// Maximum reasoning turns before budget exhaustion
const MAX_INVESTIGATION_TURNS = 15;

export class InvestigationService {
  private readonly ai: GoogleGenAI;
  private readonly modelName: string;
  private readonly groundingService: GroundingService;
  private readonly toolService: InvestigationToolService;

  constructor(
    private readonly mcpService: McpClientService,
    private readonly visionService: VisionService,
    private readonly metricsService: MetricsService = new MetricsService(),
    groundingService?: GroundingService,
    config?: { projectId?: string; region?: string; model?: string },
  ) {
    this.groundingService = groundingService ?? new GroundingService();
    this.toolService = new InvestigationToolService(this.mcpService, this.visionService);

    const project = config?.projectId || process.env.GCP_PROJECT_ID || 'agentic-cinema-ch-2026';
    const location = config?.region || process.env.GCP_REGION || 'us-central1';
    this.modelName = config?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    this.ai = new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
  }

  private getToolDeclarations(): FunctionDeclaration[] {
    return createInvestigationToolDeclarations();
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    context: InvestigationContext,
  ): Promise<ToolOutcome> {
    return this.toolService.execute(name, args, context);
  }

  async *investigateSpike(
    prompt: string,
    context: InvestigationContext,
  ): AsyncGenerator<InvestigationEvent, InvestigationResult, void> {
    const events: InvestigationEvent[] = [];

    const emit = (
      type: InvestigationEvent['type'],
      data: Record<string, unknown>,
    ): InvestigationEvent => {
      const ev: InvestigationEvent = {
        type,
        timestamp: new Date().toISOString(),
        data,
      };
      events.push(ev);
      return ev;
    };

    yield emit('status', { message: 'Connecting to ClickHouse via MCP protocol...' });
    try {
      await this.mcpService.connect();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      yield emit('error', { error: `MCP connection failed: ${msg}` });
      throw new ServiceUnavailableError(`MCP service unavailable: ${msg}`);
    }

    yield emit('status', { message: 'Initialized MCP tools. Starting Gemini reasoning loop...' });

    const { channel, from: fromTime, to: toTime } = context;

    const systemInstruction = `
You are the GhostSlate Forensic Investigator agent specializing in broadcast television, SSAI (Server-Side Ad Insertion), and SCTE-35 ad break telemetry.

Database Context:
- Database: \`ghostslate\`
- Tables:
  - \`ghostslate.scte35_cue_events\` (channel_id LowCardinality(String), splice_event_id UInt64, cue_time DateTime64(3, 'UTC'), avail_num UInt16, segmentation_type_id UInt16, expected_duration_ms UInt32)
  - \`ghostslate.ssai_stitch_attempts\` (channel_id LowCardinality(String), splice_event_id UInt64, attempt_time DateTime64(3, 'UTC'), stitch_status LowCardinality(String) ['FILLED', 'SLATE_FALLBACK', 'TIMEOUT', 'ERROR'], ssp_id LowCardinality(String), ad_response_latency_ms UInt32, device_class LowCardinality(String), codec LowCardinality(String), vast_version LowCardinality(String))
  - \`ghostslate.slate_observations\` (session_id UUID, channel_id LowCardinality(String), observed_at DateTime64(3, 'UTC'), frame_class LowCardinality(String) ['SLATE', 'CONTENT', 'AD'], confidence Float32)
  - \`ghostslate.advertiser_inventory\` (channel_id LowCardinality(String), daypart LowCardinality(String), cpm_usd Decimal(8, 2), fill_target_pct Float32)
- Target channel: \`${channel}\`
- Incident investigation window: \`${fromTime}\` to \`${toTime}\` (UTC). Note: in ClickHouse SQL, write DateTime64 literals as 'YYYY-MM-DD HH:MM:SS.NNN' (e.g. toDateTime64('${fromTime.replace('T', ' ').replace('Z', '')}', 3, 'UTC')). Use the investigation window as a half-open UTC interval in every exploratory query: timestamp >= from AND timestamp < to. Never use BETWEEN or include the end timestamp.
- Critical Thresholds: Stitcher deadline is ${STITCHER_DEADLINE_MS} ms (latencies above ${STITCHER_DEADLINE_MS} ms result in SLATE_FALLBACK); Hard auction timeout is ${HARD_AUCTION_TIMEOUT_MS} ms (TIMEOUT). Unmonetized failure is defined as SLATE_FALLBACK + TIMEOUT. Cohorts with fewer than ${MINIMUM_COHORT_CUES} cues (< ${MINIMUM_COHORT_CUES}) lack statistical significance and cannot establish a root cause.

Available tools:
- \`run_query\`: Execute read-only ClickHouse SQL for exploratory analysis.
- \`list_tables\`: Inspect available tables.
- \`classify_frame\`: Classify the active scenario's server-selected frame as 'slate', 'ad', or 'content'. It accepts no arguments; the server owns the media source and timestamp.
- \`collect_diagnosis_evidence\`: Collect authoritative server-rendered telemetry evidence for the investigation window (no arguments).
- \`finalize_investigation\`: Finalize the investigation and publish the grounded forensic diagnosis (no arguments).

Investigation Procedure (Follow These 5 Sequential Phases):
1. Phase 1 — Schema Discovery & Baseline Validation:
   Inspect table structures and check baseline cue events and stitch volume for channel \`${channel}\`.
2. Phase 2 — Temporal Correlation & Anomaly Detection:
   Use \`run_query\` to correlate SCTE-35 cue events with stitch attempts in the incident window using temporal ASOF matching (e.g. \`FROM ghostslate.ssai_stitch_attempts AS s ASOF LEFT JOIN ghostslate.scte35_cue_events AS c ON s.channel_id = c.channel_id AND s.splice_event_id = c.splice_event_id AND s.attempt_time >= c.cue_time\`). Aggregate across cues at cohort grain using \`GROUP BY s.channel_id, s.ssp_id, s.device_class, s.codec\`, count distinct splice events as \`cues\`, and guard small cohorts with \`HAVING cues >= ${MINIMUM_COHORT_CUES}\`.
3. Phase 3 — Multi-Dimensional Cohort Isolation & Visual Confirmation:
   Explore multi-dimensional dimensions (\`channel_id × ssp_id × device_class × codec\`) to check if a specific cohort exhibits anomalous unmonetized rates. If an anomaly is found, call \`classify_frame\` with no arguments to visually confirm the server-mapped incident frame.
4. Phase 4 — Evidence Collection:
   Call \`collect_diagnosis_evidence\` (with no arguments) to snapshot the authoritative server-rendered evidence and rate cards for this window.
5. Phase 5 — Finalization:
   Call \`finalize_investigation\` (with no arguments, alone in its turn) to conclude the investigation and publish the diagnosis.

Strict Grounding Rules:
1. Grounded facts and published metrics are owned exclusively by the authoritative \`collect_diagnosis_evidence\` snapshot.
2. Canonical Evidence Rule: If \`collect_diagnosis_evidence\` returns zero qualifying rows (because cues < ${MINIMUM_COHORT_CUES}), this explicitly and conclusively INVALIDATES all prior exploratory candidates due to insufficient qualifying evidence. You MUST NOT assert any root cause cohort, MUST NOT assert slate bleed or financial loss, and MUST NOT propose reroutes. You must conclude insufficient qualifying evidence and immediately finalize.
3. If an anomaly is identified, visual confirmation via \`classify_frame\` is required before finalization.
4. Before executing tools for a phase, state your working hypothesis concisely in text.
`.trim();

    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    let toolCallsCount = 0;
    let finalDiagnosis = '';
    let finalRemediation: RemediationDecision | null = null;
    let evidenceSnapshot: DiagnosisEvidence | null = null;
    let latestSlateFrame: FrameClassification | null = null;

    for (let turn = 0; turn < MAX_INVESTIGATION_TURNS; turn++) {
      yield emit('status', { message: `Reasoning turn ${turn + 1}...` });

      let response;
      try {
        response = await this.ai.models.generateContent({
          model: this.modelName,
          contents,
          config: {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            tools: [{ functionDeclarations: this.getToolDeclarations() }],
            temperature: 0.1,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        yield emit('error', { error: `Gemini generation error: ${msg}` });
        throw err;
      }

      const candidate = response.candidates?.[0];
      const modelParts = candidate?.content?.parts || [];

      // Check for function calls
      const functionCalls = modelParts.filter((p: { functionCall?: unknown }) =>
        Boolean(p.functionCall),
      );

      // Emit intermediate reasoning text as events
      const reasoningParts = (modelParts as Part[])
        .map((p) => p.text)
        .filter((t): t is string => Boolean(t && t.trim()));

      if (functionCalls.length > 0 && reasoningParts.length > 0) {
        for (const text of reasoningParts) {
          yield emit('reasoning', {
            hypothesis: text,
            turn: turn + 1,
          });
        }
      }

      if (functionCalls.length > 0) {
        // Enforce finalize_investigation discipline: must be single tool call in turn
        const hasFinalize = functionCalls.some(
          (p) =>
            (p as { functionCall: { name: string } }).functionCall.name ===
            'finalize_investigation',
        );

        if (hasFinalize && functionCalls.length > 1) {
          // Reject with instructive error
          contents.push({
            role: 'model',
            parts: modelParts as Array<Record<string, unknown>>,
          });
          contents.push({
            role: 'user',
            parts: functionCalls.map((p) => ({
              functionResponse: {
                name: (p as { functionCall: { name: string } }).functionCall.name,
                response: {
                  content:
                    'Error: finalize_investigation must be called alone in its turn. Do not combine with other tool calls.',
                },
              },
            })),
          });
          continue;
        }

        if (hasFinalize && functionCalls.length === 1) {
          // Finalization invocation
          toolCallsCount++;
          yield emit('tool_call', {
            name: 'finalize_investigation',
            args: {},
          });

          if (!evidenceSnapshot) {
            const errorMsg =
              'Evidence is incomplete: You must call collect_diagnosis_evidence before calling finalize_investigation.';
            yield emit('tool_result', {
              name: 'finalize_investigation',
              result: errorMsg,
              isError: true,
            });

            contents.push({
              role: 'model',
              parts: modelParts as Array<Record<string, unknown>>,
            });
            contents.push({
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name: 'finalize_investigation',
                    response: { content: errorMsg },
                  },
                },
              ],
            });
            continue;
          }

          if (evidenceSnapshot.incident !== null && !latestSlateFrame) {
            const errorMsg =
              'Evidence is incomplete: An anomaly cohort was detected in telemetry, but no on-air slate frame was visually confirmed. You must call classify_frame to confirm slate bleed before finalization.';
            yield emit('tool_result', {
              name: 'finalize_investigation',
              result: errorMsg,
              isError: true,
            });

            contents.push({
              role: 'model',
              parts: modelParts as Array<Record<string, unknown>>,
            });
            contents.push({
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name: 'finalize_investigation',
                    response: { content: errorMsg },
                  },
                },
              ],
            });
            continue;
          }

          // Successful finalization: Render deterministic template and terminate loop
          evidenceSnapshot.frame = latestSlateFrame;
          finalDiagnosis = renderDiagnosis(evidenceSnapshot);
          const report = this.groundingService.buildReport(evidenceSnapshot);
          const remediation = buildRemediationDecision(evidenceSnapshot, report);
          finalRemediation = remediation;

          yield emit('tool_result', {
            name: 'finalize_investigation',
            result: 'Investigation successfully finalized.',
            isError: false,
          });

          yield emit('diagnosis', {
            diagnosis: finalDiagnosis,
            grounding: report,
            remediation,
          });

          break;
        }

        contents.push({
          role: 'model',
          parts: modelParts as Array<Record<string, unknown>>,
        });

        const responseParts: Array<Record<string, unknown>> = [];

        for (const part of functionCalls) {
          const call = (part as { functionCall: { name: string; args: Record<string, unknown> } })
            .functionCall;
          toolCallsCount++;

          const isVision = call.name === 'classify_frame';

          yield emit(isVision ? 'vision_call' : 'tool_call', {
            name: call.name,
            args: call.args || {},
          });

          const startTime = Date.now();
          let outcome: ToolOutcome;
          try {
            outcome = await this.executeTool(call.name, call.args || {}, context);
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            const errorText = `Tool error: ${errorMsg}`;
            outcome = { modelText: errorText, resultText: errorText, isError: true };
          }
          const queryDurationMs = Date.now() - startTime;

          if (outcome.frame) {
            if (outcome.frame.classification === 'slate') {
              latestSlateFrame = outcome.frame;
              if (evidenceSnapshot) {
                evidenceSnapshot.frame = latestSlateFrame;
              }
            }

            const resolvedArgs = outcome.resolvedArgs ?? call.args;
            yield emit('frame_classified', {
              name: call.name,
              args: resolvedArgs,
              durationMs: queryDurationMs,
              latencyMs: queryDurationMs,
              ...outcome.frame,
            });
          } else if (call.name === 'collect_diagnosis_evidence') {
            yield emit('tool_result', {
              name: call.name,
              sql: outcome.renderedSql,
              result: outcome.resultText,
              isError: outcome.isError,
              durationMs: queryDurationMs,
              rowsReturned: outcome.rowsReturned,
              rowsScanned: outcome.rowsScanned,
            });

            if (!outcome.isError && outcome.evidenceRows) {
              const rows = outcome.evidenceRows;
              evidenceSnapshot = {
                context,
                rows,
                incident: selectIncidentCohort(rows),
                frame: latestSlateFrame,
              };

              // Emit KPI metrics exclusively from a valid canonical evidence response.
              const derived = this.metricsService.deriveMetrics(rows, {
                rowsReturned: rows.length,
                ...(typeof outcome.rowsScanned === 'number'
                  ? { rowsScanned: outcome.rowsScanned }
                  : {}),
                queryDurationMs,
              });
              if (derived.isGroundedFromMcp) {
                yield emit('metrics', { ...(derived as unknown as Record<string, unknown>) });
              }
            }
          } else {
            yield emit('tool_result', {
              name: call.name,
              sql:
                call.name === 'run_query' && typeof call.args?.query === 'string'
                  ? call.args.query
                  : undefined,
              result: outcome.resultText,
              isError: outcome.isError,
              durationMs: queryDurationMs,
              rowsReturned: outcome.rowsReturned,
              rowsScanned: outcome.rowsScanned,
            });
          }

          responseParts.push({
            functionResponse: {
              name: call.name,
              response: {
                content: outcome.modelText,
              },
            },
          });
        }

        contents.push({
          role: 'user',
          parts: responseParts,
        });
      } else {
        // Plain text turn without tool calls
        if (turn < MAX_INVESTIGATION_TURNS - 1) {
          contents.push({
            role: 'model',
            parts: modelParts as Array<Record<string, unknown>>,
          });
          contents.push({
            role: 'user',
            parts: [
              {
                text:
                  'Please conclude the investigation by calling the finalize_investigation tool ' +
                  '(after collecting evidence with collect_diagnosis_evidence and visually verifying with classify_frame if an anomaly was detected).',
              },
            ],
          });
          continue;
        }
      }
    }

    if (!finalDiagnosis || !finalDiagnosis.trim() || !finalRemediation) {
      const errorMsg = `Investigation turn budget exhausted (${MAX_INVESTIGATION_TURNS} turns) without reaching a grounded conclusion.`;
      yield emit('error', { error: errorMsg });
      throw new ServiceUnavailableError(errorMsg);
    }

    return {
      diagnosis: finalDiagnosis,
      steps: events,
      toolCallsCount,
      remediation: finalRemediation,
    };
  }
}
