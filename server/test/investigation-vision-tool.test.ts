import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InvestigationService,
  type InvestigationEvent,
} from '../src/services/investigation.service.js';
import type { McpClientService } from '../src/services/mcp.service.js';
import type { VisionService, FrameClassification } from '../src/services/vision.service.js';

interface ContentTurn {
  role: string;
  parts: Array<{
    text?: string;
    functionResponse?: {
      name: string;
      response: {
        content: string;
      };
    };
  }>;
}

describe('InvestigationService — Vision Tool & Media Boundary Contracts', () => {
  let mockMcpService: McpClientService;
  let mockVisionService: VisionService;
  let mockGenerateContent: ReturnType<typeof vi.fn>;

  const defaultContext = {
    channel: 'ch-01',
    from: '2026-08-14T19:00:00.000Z',
    to: '2026-08-14T23:00:00.000Z',
  };

  const mockFrameResult: FrameClassification = {
    classification: 'slate',
    confidence: 0.95,
    slate_type: 'looping_card',
    text_detected: 'We will be right back',
    visual_summary: 'Commercial break slate screen visible on stream',
    contentHash: 'hash-abc-123',
    cached: false,
    timestampSeconds: 12,
    frameBase64: 'data:image/jpeg;base64,BASE64_IMAGE_PAYLOAD_TEST',
  };

  const emptyCanonicalEvidence = JSON.stringify({
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
    rows: [],
  });

  beforeEach(() => {
    vi.restoreAllMocks();

    mockMcpService = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: emptyCanonicalEvidence }],
        isError: false,
      }),
      listTools: vi.fn(),
    } as unknown as McpClientService;

    mockVisionService = {
      classifyVideoTimestamp: vi.fn().mockResolvedValue(mockFrameResult),
    } as unknown as VisionService;

    mockGenerateContent = vi.fn();
  });

  function createServiceWithMockedAI() {
    const service = new InvestigationService(mockMcpService, mockVisionService);
    (service as unknown as { ai: { models: { generateContent: typeof mockGenerateContent } } }).ai =
      {
        models: {
          generateContent: mockGenerateContent,
        },
      };
    return service;
  }

  it('offers all 5 tools to Gemini: run_query, list_tables, classify_frame, collect_diagnosis_evidence, finalize_investigation', () => {
    const service = new InvestigationService(mockMcpService, mockVisionService);
    const declarations = (
      service as unknown as {
        getToolDeclarations: () => Array<{ name: string }>;
      }
    ).getToolDeclarations();

    expect(declarations).toHaveLength(5);
    const names = declarations.map((d) => d.name);
    expect(names).toEqual([
      'run_query',
      'list_tables',
      'classify_frame',
      'collect_diagnosis_evidence',
      'finalize_investigation',
    ]);
  });

  it('resolves agent Vision media and timestamp only from the active context', async () => {
    const service = createServiceWithMockedAI();
    const execute = (name: string, args: Record<string, unknown>, ctx = defaultContext) =>
      (
        service as unknown as {
          executeTool: (
            name: string,
            args: Record<string, unknown>,
            context: typeof defaultContext,
          ) => Promise<{
            resultText: string;
            isError: boolean;
            resolvedArgs?: Record<string, unknown>;
          }>;
        }
      ).executeTool(name, args, ctx);

    const slateValid = await execute('classify_frame', {
      video_file: 'attacker-controlled.mp4',
      timestamp_seconds: -1,
    });
    expect(slateValid.isError).toBe(false);
    expect(mockVisionService.classifyVideoTimestamp).toHaveBeenCalledWith(
      'test_stream_slate.mp4',
      12.5,
    );
    expect(slateValid.resolvedArgs).toEqual({
      scenario_id: 'primary',
      video_file: 'test_stream_slate.mp4',
      timestamp_seconds: 12.5,
    });

    vi.clearAllMocks();
    const negativeControlContext = {
      channel: 'ch-01',
      from: '2026-08-09T19:00:00.000Z',
      to: '2026-08-09T23:00:00.000Z',
    };
    const negativeMediaAttempt = await execute('classify_frame', {}, negativeControlContext);
    expect(negativeMediaAttempt.isError).toBe(true);
    expect(negativeMediaAttempt.resultText).toContain('Visual confirmation is disabled');
    expect(mockVisionService.classifyVideoTimestamp).not.toHaveBeenCalled();

    const blackScreenContext = {
      channel: 'ch-01',
      from: '2026-08-16T10:00:00.000Z',
      to: '2026-08-16T12:00:00.000Z',
    };
    const blackScreen = await execute('classify_frame', {}, blackScreenContext);
    expect(blackScreen.isError).toBe(false);
    expect(mockVisionService.classifyVideoTimestamp).toHaveBeenCalledWith(
      'test_stream_black_screen.mp4',
      12.5,
    );

    const unmapped = await execute(
      'classify_frame',
      {},
      {
        channel: 'ch-01',
        from: '2026-08-16T10:00:00.001Z',
        to: '2026-08-16T12:00:00.000Z',
      },
    );
    expect(unmapped.isError).toBe(true);
    expect(unmapped.resultText).toContain('No synthetic stream media is mapped');
  });

  it('enforces positive incident finalization requires visual confirmation, while negative control succeeds without vision', async () => {
    const positiveCanonicalRow = [
      'ch-01',
      'ssp-beta',
      'connected_tv',
      'hevc',
      'primetime',
      80,
      60862,
      59482,
      97.73,
      1812,
      32.5,
    ];
    const peerCohortRow = [
      'ch-01',
      'ssp-alpha',
      'connected_tv',
      'hevc',
      'primetime',
      80,
      79454,
      1697,
      2.14,
      304,
      32.5,
    ];
    const positiveCanonicalEvidence = JSON.stringify({
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
      rows: [positiveCanonicalRow, peerCohortRow],
    });

    // 1. Positive run: Finalizing after collect_diagnosis_evidence WITHOUT classify_frame must be rejected
    mockMcpService.callTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: positiveCanonicalEvidence }],
      isError: false,
    });

    mockGenerateContent
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
              parts: [{ functionCall: { name: 'finalize_investigation', args: {} } }],
            },
          },
        ],
      })
      .mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: 'Turn budget limit reached' }],
            },
          },
        ],
      });

    const positiveService = createServiceWithMockedAI();
    const positiveGen = positiveService.investigateSpike('Run positive spike', defaultContext);

    const positiveEvents: InvestigationEvent[] = [];
    try {
      for await (const ev of positiveGen) {
        positiveEvents.push(ev);
      }
    } catch {
      // Expected to fail finalization check or exhaust budget
    }

    const rejectionEvent = positiveEvents.find(
      (e) =>
        e.type === 'tool_result' &&
        e.data.name === 'finalize_investigation' &&
        e.data.isError === true,
    );
    expect(rejectionEvent).toBeDefined();
    expect(rejectionEvent?.data.result).toContain(
      'An anomaly cohort was detected in telemetry, but no on-air slate frame was visually confirmed',
    );

    // 2. Negative run: Finalizing after collect_diagnosis_evidence WITHOUT classify_frame succeeds immediately
    vi.clearAllMocks();
    mockMcpService.callTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: emptyCanonicalEvidence }],
      isError: false,
    });

    mockGenerateContent
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
              parts: [{ functionCall: { name: 'finalize_investigation', args: {} } }],
            },
          },
        ],
      });

    const negativeContext = {
      channel: 'ch-01',
      from: '2026-08-09T19:00:00.000Z',
      to: '2026-08-09T23:00:00.000Z',
    };
    const negativeService = createServiceWithMockedAI();
    const negativeGen = negativeService.investigateSpike('Run negative control', negativeContext);

    const negativeEvents: InvestigationEvent[] = [];
    for await (const ev of negativeGen) {
      negativeEvents.push(ev);
    }

    const negativeDiagEvent = negativeEvents.find((e) => e.type === 'diagnosis');
    expect(negativeDiagEvent).toBeDefined();
    expect(negativeDiagEvent?.data.diagnosis).toContain(
      'No isolated root cause, on-air slate bleed, or financial loss is asserted.',
    );
    expect(negativeDiagEvent?.data.diagnosis).not.toContain('$');
  });

  it('never sends the base64 frame image to the model, but emits it in the SSE stream', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'classify_frame',
                    args: { video_file: 'slate.mp4', timestamp_seconds: 12 },
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
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'collect_diagnosis_evidence',
                    args: {},
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
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'finalize_investigation',
                    args: {},
                  },
                },
              ],
            },
          },
        ],
      });

    const service = createServiceWithMockedAI();
    const generator = service.investigateSpike('Inspect frame', defaultContext);

    const events: InvestigationEvent[] = [];
    for await (const ev of generator) {
      events.push(ev);
    }

    // Turn 2 receives functionResponse with NO base64
    const secondCallArgs = mockGenerateContent.mock.calls[1][0];
    const userTurn = secondCallArgs.contents.find(
      (c: ContentTurn) => c.role === 'user' && Boolean(c.parts?.[0]?.functionResponse),
    ) as ContentTurn | undefined;
    expect(userTurn).toBeDefined();

    const functionResponseContent = userTurn?.parts[0]?.functionResponse?.response.content;
    expect(functionResponseContent).not.toContain('BASE64_IMAGE_PAYLOAD_TEST');
    expect(functionResponseContent).toContain('"classification":"slate"');

    // SSE event contains frameBase64
    const frameEvent = events.find((e) => e.type === 'frame_classified');
    expect(frameEvent?.data.frameBase64).toBe('data:image/jpeg;base64,BASE64_IMAGE_PAYLOAD_TEST');
  });

  it('un-leaks the system instruction: prompt contains procedure and thresholds, NOT answers', async () => {
    mockGenerateContent
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
              parts: [{ functionCall: { name: 'finalize_investigation', args: {} } }],
            },
          },
        ],
      });

    const service = createServiceWithMockedAI();
    const generator = service.investigateSpike('Run investigation', defaultContext);

    for await (const _ of generator) {
      // drain
    }

    const firstCallArgs = mockGenerateContent.mock.calls[0][0];
    const systemPrompt = firstCallArgs.config?.systemInstruction?.parts?.[0]?.text;

    expect(systemPrompt).toBeDefined();
    // Procedure and thresholds present
    expect(systemPrompt).toContain('Phase 1 — Schema Discovery');
    expect(systemPrompt).toContain('Phase 2 — Temporal Correlation');
    expect(systemPrompt).toContain('Phase 3 — Multi-Dimensional Cohort Isolation');
    expect(systemPrompt).toContain('Phase 4 — Evidence Collection');
    expect(systemPrompt).toContain('Phase 5 — Finalization');
    expect(systemPrompt).toContain('450 ms');
    expect(systemPrompt).toContain('1200 ms');
    expect(systemPrompt).toContain('HAVING cues >= 20');
    expect(systemPrompt).toContain('half-open UTC interval');
    expect(systemPrompt).toContain('Never use BETWEEN or include the end timestamp');

    // Answer un-leaked (cohort name and numbers MUST NOT appear)
    expect(systemPrompt).not.toContain('ssp-beta × connected_tv × hevc');
    expect(systemPrompt).not.toContain('97.73%');
    expect(systemPrompt).not.toContain('80 cues');
    expect(systemPrompt).not.toContain('34%');
  });
});
