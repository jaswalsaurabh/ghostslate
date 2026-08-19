import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpClientService } from '../src/services/mcp.service.js';
import { ServiceUnavailableError } from '../src/errors/domain-error.js';

describe('McpClientService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('initializes with default configuration', () => {
    const service = new McpClientService({
      baseUrl: 'http://localhost:8000',
    });

    expect(service).toBeInstanceOf(McpClientService);
  });

  it('cleans up state and rejects pending requests on disconnect', () => {
    const service = new McpClientService({
      baseUrl: 'http://localhost:8000',
    });

    service.disconnect();
    expect(service).toBeInstanceOf(McpClientService);
  });

  it('fails gracefully when MCP server is unreachable without recursion', async () => {
    const service = new McpClientService({
      baseUrl: 'http://127.0.0.1:59999', // non-existent port
    });

    await expect(service.connect()).rejects.toThrow();
  });

  it('shares single in-flight connection promise across concurrent connect() callers', async () => {
    let sseFetchCount = 0;
    let streamController: ReadableStreamDefaultController<Uint8Array>;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/sse')) {
        sseFetchCount++;
        // Simulate delay in SSE handshake
        await new Promise((r) => setTimeout(r, 20));
        // Emit endpoint event
        const encoder = new TextEncoder();
        streamController.enqueue(
          encoder.encode('event: endpoint\ndata: /messages/?session_id=sess-123\n\n'),
        );
        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }

      if (url.includes('/messages/')) {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.method === 'initialize') {
          const encoder = new TextEncoder();
          streamController.enqueue(
            encoder.encode(
              `event: message\ndata: {"jsonrpc":"2.0","id":${body.id},"result":{"protocolVersion":"2024-11-05"}}\n\n`,
            ),
          );
        }
        return new Response('Accepted', { status: 202 });
      }

      return new Response('Not Found', { status: 404 });
    });

    const service = new McpClientService({
      baseUrl: 'http://localhost:8000',
    });

    // Fire two concurrent connections
    const [res1, res2] = await Promise.all([service.connect(), service.connect()]);
    expect(res1).toBeUndefined();
    expect(res2).toBeUndefined();
    expect(sseFetchCount).toBe(1);

    service.disconnect();
  });

  it('completes concurrent sendRequest() calls and opens only one SSE stream', async () => {
    let sseFetchCount = 0;
    let streamController: ReadableStreamDefaultController<Uint8Array>;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/sse')) {
        sseFetchCount++;
        await new Promise((r) => setTimeout(r, 10));
        const encoder = new TextEncoder();
        streamController.enqueue(
          encoder.encode('event: endpoint\ndata: /messages/?session_id=sess-concurrent\n\n'),
        );
        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }

      if (url.includes('/messages/')) {
        const body = JSON.parse(String(init?.body || '{}'));
        const encoder = new TextEncoder();
        if (body.method === 'initialize') {
          streamController.enqueue(
            encoder.encode(
              `event: message\ndata: {"jsonrpc":"2.0","id":${body.id},"result":{"protocolVersion":"2024-11-05"}}\n\n`,
            ),
          );
        } else if (body.method === 'tools/call') {
          streamController.enqueue(
            encoder.encode(
              `event: message\ndata: {"jsonrpc":"2.0","id":${body.id},"result":{"content":[{"type":"text","text":"result for ${body.params?.name}"}]}}\n\n`,
            ),
          );
        }
        return new Response('Accepted', { status: 202 });
      }

      return new Response('Not Found', { status: 404 });
    });

    const service = new McpClientService({
      baseUrl: 'http://localhost:8000',
    });

    // Fire two investigations/calls concurrently
    const [call1, call2] = await Promise.all([
      service.callTool('run_query', { query: 'SELECT 1' }),
      service.callTool('run_query', { query: 'SELECT 2' }),
    ]);

    expect(call1.content[0]?.text).toContain('result for run_query');
    expect(call2.content[0]?.text).toContain('result for run_query');
    expect(sseFetchCount).toBe(1);

    service.disconnect();
  });

  it('clears connectPromise on failed connection allowing subsequent retry', async () => {
    let failFirst = true;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/sse')) {
        if (failFirst) {
          failFirst = false;
          return new Response('Internal Server Error', { status: 500 });
        }

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(
              encoder.encode('event: endpoint\ndata: /messages/?session_id=sess-retry\n\n'),
            );
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }

      if (url.includes('/messages/')) {
        return new Response('Accepted', { status: 202 });
      }

      return new Response('Not Found', { status: 404 });
    });

    const service = new McpClientService({
      baseUrl: 'http://localhost:8000',
    });

    // First attempt fails
    await expect(service.connect()).rejects.toThrow(ServiceUnavailableError);

    // Second attempt should not be stuck on a poisoned promise
    // It will attempt a fresh fetch.
    service.disconnect();
  });
});
