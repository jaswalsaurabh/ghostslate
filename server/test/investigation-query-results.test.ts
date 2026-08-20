import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InvestigationService,
  type InvestigationEvent,
} from '../src/services/investigation.service.js';
import type { McpClientService } from '../src/services/mcp.service.js';
import type { VisionService, FrameClassification } from '../src/services/vision.service.js';
import { renderLossAttributionQuery } from '../src/services/evidence.helper.js';

interface ContentTurn {
  role: string;
  parts: Array<{
    functionResponse?: {
      name?: string;
      response: { content: string };
    };
  }>;
}

describe('InvestigationService — Canonical Evidence, Query Routing & Finalization', () => {
  let mockMcpService: McpClientService;
  let mockVisionService: VisionService;
  let mockGenerateContent: ReturnType<typeof vi.fn>;

  const defaultContext = {
    channel: 'ch-01',
    from: '2026-08-14T19:00:00.000Z',
    to: '2026-08-14T23:00:00.000Z',
  };

  const primaryIncidentMcpResult = JSON.stringify({
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
      [
        'ch-01',
        'ssp-beta',
        'connected_tv',
        'hevc',
        'primetime',
        80,
        60862,
        59482,
        97.73,
        1812.0,
        32.5,
      ],
      [
        'ch-01',
        'ssp-alpha',
        'connected_tv',
        'hevc',
        'primetime',
        80,
        75000,
        1800,
        2.4,
        305.0,
        32.5,
      ],
    ],
    statistics: { rows_read: 205862 },
  });

  const mockSlateFrame: FrameClassification = {
    classification: 'slate',
    confidence: 0.98,
    slate_type: 'looping_card',
    text_detected: 'We will be right back',
    visual_summary: 'Commercial break slate screen',
    contentHash: 'hash-slate-123',
    cached: false,
    timestampSeconds: 12,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockMcpService = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      callTool: vi.fn(),
      listTools: vi.fn(),
    } as unknown as McpClientService;

    mockVisionService = {
      classifyVideoTimestamp: vi.fn().mockResolvedValue(mockSlateFrame),
    } as unknown as VisionService;

    mockGenerateContent = vi.fn();
  });

  function createServiceWithMockedAI() {
    const service = new InvestigationService(mockMcpService, mockVisionService);
    (service as unknown as { ai: { models: { generateContent: typeof mockGenerateContent } } }).ai =
      { models: { generateContent: mockGenerateContent } };
    return service;
  }

  describe('renderLossAttributionQuery helper', () => {
    it('binds investigation context safely and produces explicit ClickHouse UTC literals', () => {
      const rendered = renderLossAttributionQuery(defaultContext);

      expect(rendered).toContain("s.channel_id = 'ch-01'");
      expect(rendered).toContain("toDateTime64('2026-08-14 19:00:00.000', 3, 'UTC')");
      expect(rendered).toContain("toDateTime64('2026-08-14 23:00:00.000', 3, 'UTC')");
      expect(rendered).not.toContain('{channel:String}');
      expect(rendered).not.toContain('{from:DateTime64(3)}');
      expect(rendered).not.toContain('{to:DateTime64(3)}');
      expect(rendered).not.toMatch(/\{[a-zA-Z0-9_]+:[a-zA-Z0-9_()]+\}/);
    });
  });

  describe('collect_diagnosis_evidence tool execution', () => {
    it('executes canonical query via MCP and emits metrics event exclusively on collect_diagnosis_evidence', async () => {
      mockMcpService.callTool = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: primaryIncidentMcpResult }],
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
                parts: [{ functionCall: { name: 'finalize_investigation', args: {} } }],
              },
            },
          ],
        });

      const events: InvestigationEvent[] = [];
      for await (const ev of createServiceWithMockedAI().investigateSpike(
        'Investigate channel spike',
        defaultContext,
      )) {
        events.push(ev);
      }

      // Check MCP tool call
      expect(mockMcpService.callTool).toHaveBeenCalledWith('run_query', {
        query: expect.stringContaining("s.channel_id = 'ch-01'"),
      });

      // Metrics event emitted from collect_diagnosis_evidence
      const metricsEvent = events.find((e) => e.type === 'metrics');
      expect(metricsEvent).toBeDefined();
      expect(metricsEvent?.data.isGroundedFromMcp).toBe(true);
      expect(metricsEvent?.data.offendingSsp).toBe('SSP-BETA');
      expect(metricsEvent?.data.slateBleedRate).toBe('97.7%');
      expect(metricsEvent?.data.revenueLoss).toBe('$1,933.17');

      const evidenceResult = events.find(
        (event) => event.type === 'tool_result' && event.data.name === 'collect_diagnosis_evidence',
      );
      expect(evidenceResult?.data.rowsReturned).toBe(2);
      expect(evidenceResult?.data.rowsScanned).toBe(205862);

      // Exactly 1 diagnosis event emitted
      const diagnosisEvents = events.filter((e) => e.type === 'diagnosis');
      expect(diagnosisEvents).toHaveLength(1);
      expect(diagnosisEvents[0]?.data.diagnosis).toContain('ssp-beta');
      expect(diagnosisEvents[0]?.data.diagnosis).toContain('$1,933.17');
    });

    it('does NOT emit metrics event on exploratory run_query calls', async () => {
      mockMcpService.callTool = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: primaryIncidentMcpResult }],
        isError: false,
      });

      mockGenerateContent
        .mockResolvedValueOnce({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'run_query',
                      args: { query: 'SELECT * FROM ssai_stitch_attempts' },
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
                parts: [{ functionCall: { name: 'finalize_investigation', args: {} } }],
              },
            },
          ],
        });

      const events: InvestigationEvent[] = [];
      for await (const ev of createServiceWithMockedAI().investigateSpike(
        'Investigate channel spike',
        defaultContext,
      )) {
        events.push(ev);
      }

      // Exactly 1 metrics event was emitted (from collect_diagnosis_evidence, NOT from exploratory run_query)
      const metricsEvents = events.filter((e) => e.type === 'metrics');
      expect(metricsEvents).toHaveLength(1);
    });
  });

  describe('finalize_investigation recoverable guards', () => {
    it('returns recoverable error if finalize_investigation is called before collect_diagnosis_evidence', async () => {
      mockMcpService.callTool = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: primaryIncidentMcpResult }],
        isError: false,
      });

      mockGenerateContent
        .mockResolvedValueOnce({
          candidates: [
            {
              content: {
                parts: [{ functionCall: { name: 'finalize_investigation', args: {} } }],
              },
            },
          ],
        })
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
                parts: [{ functionCall: { name: 'finalize_investigation', args: {} } }],
              },
            },
          ],
        });

      const events: InvestigationEvent[] = [];
      for await (const ev of createServiceWithMockedAI().investigateSpike(
        'Investigate channel spike',
        defaultContext,
      )) {
        events.push(ev);
      }

      // Turn 2 receives recoverable error
      const secondCallArgs = mockGenerateContent.mock.calls[1][0];
      const userTurn = secondCallArgs.contents.find(
        (c: ContentTurn) => c.role === 'user' && Boolean(c.parts?.[0]?.functionResponse),
      ) as ContentTurn;
      expect(userTurn.parts[0]?.functionResponse?.response.content).toContain(
        'You must call collect_diagnosis_evidence before calling finalize_investigation',
      );

      // Final diagnosis succeeded after recovery
      const diagnosisEvent = events.find((e) => e.type === 'diagnosis');
      expect(diagnosisEvent).toBeDefined();
    });

    it('returns recoverable error if positive incident detected but no on-air slate frame was classified', async () => {
      mockMcpService.callTool = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: primaryIncidentMcpResult }],
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
                parts: [{ functionCall: { name: 'finalize_investigation', args: {} } }],
              },
            },
          ],
        });

      const events: InvestigationEvent[] = [];
      for await (const ev of createServiceWithMockedAI().investigateSpike(
        'Investigate channel spike',
        defaultContext,
      )) {
        events.push(ev);
      }

      // Turn 2's response was the error instructing visual confirmation
      const thirdCallArgs = mockGenerateContent.mock.calls[2][0];
      const userTurns = thirdCallArgs.contents.filter(
        (c: ContentTurn) => c.role === 'user' && Boolean(c.parts?.[0]?.functionResponse),
      ) as ContentTurn[];
      expect(userTurns[1]?.parts[0]?.functionResponse?.response.content).toContain(
        'no on-air slate frame was visually confirmed. You must call classify_frame',
      );

      // Final diagnosis succeeded after frame classification
      const diagnosisEvent = events.find((e) => e.type === 'diagnosis');
      expect(diagnosisEvent).toBeDefined();
    });

    it('rejects multiple tool calls combined in the same turn as finalize_investigation', async () => {
      mockMcpService.callTool = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: primaryIncidentMcpResult }],
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
                  { functionCall: { name: 'run_query', args: { query: 'SELECT 1' } } },
                  { functionCall: { name: 'finalize_investigation', args: {} } },
                ],
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

      const events: InvestigationEvent[] = [];
      for await (const ev of createServiceWithMockedAI().investigateSpike(
        'Investigate channel spike',
        defaultContext,
      )) {
        events.push(ev);
      }

      // Turn 3's response was the discipline error
      const fourthCallArgs = mockGenerateContent.mock.calls[3][0];
      const userTurns = fourthCallArgs.contents.filter(
        (c: ContentTurn) => c.role === 'user' && Boolean(c.parts?.[0]?.functionResponse),
      ) as ContentTurn[];
      expect(userTurns[2]?.parts[0]?.functionResponse?.response.content).toContain(
        'finalize_investigation must be called alone in its turn',
      );

      // Final diagnosis succeeded after recovery
      const diagnosisEvent = events.find((e) => e.type === 'diagnosis');
      expect(diagnosisEvent).toBeDefined();
    });
  });
});
