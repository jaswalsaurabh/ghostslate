import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InvestigationService,
  type InvestigationEvent,
} from '../src/services/investigation.service.js';
import type { McpClientService } from '../src/services/mcp.service.js';
import type { VisionService, FrameClassification } from '../src/services/vision.service.js';
import { InvestigateSpikeSchema } from '../src/controllers/investigation.controller.js';

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

  it('validates per-file media durations with exclusive upper bounds (§8)', async () => {
    const service = createServiceWithMockedAI();
    const execute = (name: string, args: Record<string, unknown>) =>
      (
        service as unknown as {
          executeTool: (
            name: string,
            args: Record<string, unknown>,
            context: typeof defaultContext,
          ) => Promise<{ resultText: string; isError: boolean }>;
        }
      ).executeTool(name, args, defaultContext);

    // 1. content.mp4 has duration 10s -> timestamp 12 must fail
    const contentOver = await execute('classify_frame', {
      video_file: 'content.mp4',
      timestamp_seconds: 12,
    });
    expect(contentOver.isError).toBe(true);
    expect(contentOver.resultText).toContain('strictly less than 10');

    // 2. slate.mp4 has duration 15s -> timestamp 14.5 must pass
    const slateValid = await execute('classify_frame', {
      video_file: 'slate.mp4',
      timestamp_seconds: 14.5,
    });
    expect(slateValid.isError).toBe(false);

    // 3. slate.mp4 has duration 15s -> timestamp 15 must fail (exclusive upper bound)
    const slateAtBound = await execute('classify_frame', {
      video_file: 'slate.mp4',
      timestamp_seconds: 15,
    });
    expect(slateAtBound.isError).toBe(true);
    expect(slateAtBound.resultText).toContain('strictly less than 15');

    // 4. negative timestamp must fail
    const negativeTs = await execute('classify_frame', {
      video_file: 'slate.mp4',
      timestamp_seconds: -1,
    });
    expect(negativeTs.isError).toBe(true);
    expect(negativeTs.resultText).toContain('Invalid timestamp_seconds');

    // 5. unknown video_file must fail
    const unknownFile = await execute('classify_frame', {
      video_file: 'unknown.mp4',
      timestamp_seconds: 5,
    });
    expect(unknownFile.isError).toBe(true);
    expect(unknownFile.resultText).toContain('Unknown video_file "unknown.mp4"');
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

    // Answer un-leaked (cohort name and numbers MUST NOT appear)
    expect(systemPrompt).not.toContain('ssp-beta × connected_tv × hevc');
    expect(systemPrompt).not.toContain('97.73%');
    expect(systemPrompt).not.toContain('80 cues');
    expect(systemPrompt).not.toContain('34%');
  });

  describe('InvestigateSpikeSchema validation', () => {
    it('normalizes valid channel and ISO UTC timestamps', () => {
      const parsed = InvestigateSpikeSchema.parse({
        prompt: 'Check anomaly',
        channel: '  CH-01  ',
        from: '2026-08-14T19:00:00.000Z',
        to: '2026-08-14T23:00:00.000Z',
      });
      expect(parsed.channel).toBe('ch-01');
      expect(parsed.from).toBe('2026-08-14T19:00:00.000Z');
      expect(parsed.to).toBe('2026-08-14T23:00:00.000Z');
    });

    it('rejects channel with SQL injection or special characters', () => {
      expect(() =>
        InvestigateSpikeSchema.parse({
          prompt: 'Check anomaly',
          channel: "ch-01'; DROP TABLE ssai_stitch_attempts; --",
        }),
      ).toThrow();
    });

    it('rejects timestamps without UTC Z suffix or invalid date syntax', () => {
      expect(() =>
        InvestigateSpikeSchema.parse({
          prompt: 'Check anomaly',
          from: '2026-08-14 19:00:00',
        }),
      ).toThrow();
    });

    it('rejects from >= to', () => {
      expect(() =>
        InvestigateSpikeSchema.parse({
          prompt: 'Check anomaly',
          from: '2026-08-14T23:00:00.000Z',
          to: '2026-08-14T19:00:00.000Z',
        }),
      ).toThrow();
    });
  });
});
