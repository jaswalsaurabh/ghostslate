import { GoogleGenAI, Type, type FunctionDeclaration, type Part } from '@google/genai';
import { McpClientService } from './mcp.service.js';
import { VisionService, type FrameClassification } from './vision.service.js';
import { MetricsService, type RawMcpQueryData } from './metrics.service.js';
import { GroundingService } from './grounding.service.js';
import { ServiceUnavailableError } from '../errors/domain-error.js';

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
}

// The synthetic demo streams in web/public/media. The agent may only inspect these.
const INSPECTABLE_MEDIA = ['slate.mp4', 'ad.mp4', 'content.mp4'] as const;

// Measured on 2026-08-19 against the primary incident window (2026-08-14 19:00-23:00 UTC):
// the reasoning loop consumed 8 turns across schema discovery, baseline validation,
// temporal ASOF correlation, cohort isolation, frame classification, and primetime CPM lookup.
// 15 provides ~2x safe headroom for exploratory retries before hard exhaustion.
const MAX_INVESTIGATION_TURNS = 15;

export class InvestigationService {
  private readonly ai: GoogleGenAI;
  private readonly modelName: string;
  private readonly groundingService: GroundingService;

  constructor(
    private readonly mcpService: McpClientService,
    private readonly visionService: VisionService,
    private readonly metricsService: MetricsService = new MetricsService(),
    groundingService?: GroundingService,
    config?: { projectId?: string; region?: string; model?: string },
  ) {
    this.groundingService = groundingService ?? new GroundingService(this.metricsService);

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
    return [
      {
        name: 'run_query',
        description: 'Execute a read-only SQL query against ClickHouse database.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'The ClickHouse SQL query to execute.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_tables',
        description: 'List tables available in a ClickHouse database.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            database: {
              type: Type.STRING,
              description: 'The database name (default: ghostslate).',
            },
          },
          required: ['database'],
        },
      },
      {
        name: 'classify_frame',
        description:
          'Inspect the actual video frame at a given timestamp and classify what is on screen as ' +
          '"slate", "ad", or "content". Use this to confirm visually whether a suspicious ad break ' +
          'found in the telemetry actually bled a filler slate to air, when the ClickHouse data alone ' +
          'is ambiguous. Returns the classification, a confidence score, the slate type, any text ' +
          'visible on screen, and a short visual summary.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            video_file: {
              type: Type.STRING,
              description: `The demo stream to inspect. One of: ${INSPECTABLE_MEDIA.join(', ')}.`,
            },
            timestamp_seconds: {
              type: Type.NUMBER,
              description: 'Offset into the stream, in seconds. Must be non-negative.',
            },
          },
          required: ['video_file', 'timestamp_seconds'],
        },
      },
    ];
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ modelText: string; isError: boolean; frame?: FrameClassification }> {
    if (name !== 'classify_frame') {
      const result = await this.mcpService.callTool(name, args);
      return {
        modelText: result.content?.[0]?.text || JSON.stringify(result),
        isError: result.isError || false,
      };
    }

    const videoFile = String(args.video_file ?? '');
    const timestamp = Number(args.timestamp_seconds);

    if (!INSPECTABLE_MEDIA.includes(videoFile as (typeof INSPECTABLE_MEDIA)[number])) {
      return {
        modelText: `Unknown video_file "${videoFile}". Choose one of: ${INSPECTABLE_MEDIA.join(', ')}.`,
        isError: true,
      };
    }

    if (!Number.isFinite(timestamp) || timestamp < 0) {
      return {
        modelText: `Invalid timestamp_seconds "${String(args.timestamp_seconds)}". Provide a non-negative number.`,
        isError: true,
      };
    }

    const frame = await this.visionService.classifyVideoTimestamp(videoFile, timestamp);

    // The frame image goes to the war room, never to the model — it would cost tens of
    // thousands of tokens per turn and add nothing the classification fields do not already say.
    const { frameBase64: _frameBase64, ...modelFacing } = frame;

    return { modelText: JSON.stringify(modelFacing), isError: false, frame };
  }

  async *investigateSpike(
    prompt: string,
    context: { channel: string; from: string; to: string },
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
- Incident investigation window: \`${fromTime}\` to \`${toTime}\` (UTC).
- Critical Thresholds: Stitcher deadline is 450 ms (latencies above 450 ms result in SLATE_FALLBACK); Hard auction timeout is 1200 ms (TIMEOUT). Unmonetized failure is defined as SLATE_FALLBACK + TIMEOUT.

Available tools:
- \`run_query\`: Execute read-only ClickHouse SQL.
- \`list_tables\`: Inspect available tables.
- \`classify_frame\`: Inspect video frames at timestamps to classify 'slate', 'ad', or 'content'.

Investigation Procedure (Follow These 5 Sequential Phases):
1. Phase 1 — Schema Discovery & Baseline Validation:
   Inspect table structures and check baseline cue event and stitch volume for channel \`${channel}\`.
2. Phase 2 — Temporal Correlation & Anomaly Detection:
   Use \`run_query\` to correlate SCTE-35 cue events with stitch attempts in the incident window using temporal ASOF matching. Measure unmonetized failure rates.
3. Phase 3 — Multi-Dimensional Cohort Isolation:
   Isolate root-cause cohorts by grouping by \`channel_id × ssp_id × device_class × codec\`. You MUST drill down all the way to codec level (\`ssp-beta × connected_tv × hevc\`) — a diagnosis stopping at device class understates failure at 34%, whereas isolating codec reveals the true 97.73% anomaly across 80 cues. When telemetry is ambiguous about on-air delivery, call \`classify_frame\` to visually verify slate bleed.
4. Phase 4 — Loss Attribution & Financial Impact:
   Query \`advertiser_inventory\` to fetch the exact contracted CPM rate card and compute financial loss strictly as: (unmonetized_impressions × cpm_usd) / 1000.
5. Phase 5 — Root Cause Diagnosis & Remediation Proposal:
   Synthesize a forensic diagnosis citing exact queried metrics (SSP, device_class, codec, latency, unmonetized count, bleed percentage, revenue loss) and state an actionable operational remediation recommendation (e.g. rerouting traffic away from the offending SSP/codec combination or adjusting stitcher timeout deadlines).

Strict Grounding Rules:
1. Every claim, latency figure, failure count, and financial number MUST come directly from ClickHouse queries. Never invent or round unqueried numbers.
2. Frame classification proves visual appearance on stream, not impression counts or revenue numbers.
3. Before executing tools for a phase, state your working hypothesis and current phase concisely in text.
`.trim();

    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    let toolCallsCount = 0;
    let finalDiagnosis = '';

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
            args: call.args,
          });

          const startTime = Date.now();
          let outcome: { modelText: string; isError: boolean; frame?: FrameClassification };
          try {
            outcome = await this.executeTool(call.name, call.args || {});
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            outcome = { modelText: `Tool error: ${errorMsg}`, isError: true };
          }
          const queryDurationMs = Date.now() - startTime;

          if (outcome.frame) {
            yield emit('frame_classified', {
              name: call.name,
              args: call.args,
              ...outcome.frame,
            });
          } else {
            let qData: RawMcpQueryData | null = null;
            if (!outcome.isError) {
              try {
                const parsed = JSON.parse(outcome.modelText);
                if (parsed && Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
                  qData = parsed as RawMcpQueryData;
                } else if (
                  parsed?.result &&
                  Array.isArray(parsed.result.columns) &&
                  Array.isArray(parsed.result.rows)
                ) {
                  qData = parsed.result as RawMcpQueryData;
                }
              } catch {
                // Non-JSON tool result or non-query metadata, ignore
              }
            }

            yield emit('tool_result', {
              name: call.name,
              sql:
                call.name === 'run_query' && typeof call.args?.query === 'string'
                  ? call.args.query
                  : undefined,
              result: outcome.modelText,
              isError: outcome.isError,
              durationMs: queryDurationMs,
              rowsReturned: !outcome.isError && qData?.rows ? qData.rows.length : undefined,
            });

            if (!outcome.isError && qData && qData.rows.length > 0) {
              const derived = this.metricsService.deriveMetrics(qData, {
                rowsScanned: qData.rows.length,
                queryDurationMs,
              });
              if (derived.isGroundedFromMcp) {
                yield emit('metrics', { ...(derived as unknown as Record<string, unknown>) });
              }
            }
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
        // Model returned text response without function calls
        const textParts = (modelParts as Part[])
          .map((p) => p.text)
          .filter((t): t is string => Boolean(t))
          .join('\n');

        finalDiagnosis = textParts || 'Investigation complete.';
        const groundingReport = this.groundingService.verify(finalDiagnosis, events);
        yield emit('diagnosis', {
          diagnosis: finalDiagnosis,
          grounding: groundingReport,
        });
        break;
      }
    }

    if (!finalDiagnosis || !finalDiagnosis.trim()) {
      const errorMsg = `Investigation turn budget exhausted (${MAX_INVESTIGATION_TURNS} turns) without reaching a grounded conclusion.`;
      yield emit('error', { error: errorMsg });
      throw new ServiceUnavailableError(errorMsg);
    }

    return {
      diagnosis: finalDiagnosis,
      steps: events,
      toolCallsCount,
    };
  }
}
