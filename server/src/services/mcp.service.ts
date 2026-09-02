import { ServiceUnavailableError } from '../errors/domain-error.js';

const MAX_SSE_EVENT_BYTES = 1 * 1_024 * 1_024;

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpQueryResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
}

export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
  structuredContent?: {
    result?: string | McpQueryResult;
  };
}

export interface McpClientConfig {
  baseUrl: string;
  authToken?: string;
  timeoutMs?: number;
}

export class McpClientService {
  private readonly baseUrl: string;
  private readonly authToken: string | undefined;
  private readonly timeoutMs: number;
  private sessionId: string | null = null;
  private postUrl: string | null = null;
  private nextRequestId = 1;
  private pendingRequests = new Map<
    number | string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private abortController: AbortController | null = null;
  private connected = false;
  private connecting = false;
  private connectPromise: Promise<void> | null = null;

  constructor(config?: Partial<McpClientConfig>) {
    this.baseUrl = (
      config?.baseUrl ||
      process.env.MCP_SERVER_URL ||
      'http://localhost:8000'
    ).replace(/\/$/, '');
    this.authToken = config?.authToken ?? process.env.CLICKHOUSE_MCP_AUTH_TOKEN;
    this.timeoutMs = config?.timeoutMs || 30000;

    if (process.env.NODE_ENV === 'production') {
      const parsed = new URL(this.baseUrl);
      if (parsed.protocol !== 'https:') {
        throw new Error('MCP_SERVER_URL must use HTTPS in production');
      }
      if (!this.authToken || this.authToken.trim().length < 32) {
        throw new Error('CLICKHOUSE_MCP_AUTH_TOKEN must be a strong secret in production');
      }
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    };
    if (this.authToken && this.authToken.trim().length > 0) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  async connect(): Promise<void> {
    if (this.connected && this.postUrl) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connecting = true;
    this.connectPromise = (async () => {
      try {
        this.abortController = new AbortController();
        const sseUrl = `${this.baseUrl}/sse`;

        let response: Response;
        try {
          response = await fetch(sseUrl, {
            method: 'GET',
            headers: this.getHeaders(),
            signal: this.abortController.signal,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new ServiceUnavailableError(`Failed to reach MCP server at ${sseUrl}: ${msg}`);
        }

        if (!response.ok) {
          throw new ServiceUnavailableError(
            `MCP server returned status ${response.status} from ${sseUrl}`,
          );
        }

        if (!response.body) {
          throw new ServiceUnavailableError('MCP server did not return a response body stream');
        }

        // Start background stream consumer
        const streamPromise = this.consumeSseStream(response.body);
        // Wait for the endpoint event to establish session
        await this.waitForSession();
        // Do not await streamPromise as it runs indefinitely during connection
        streamPromise.catch((err: unknown) => {
          const error = err instanceof Error ? err : new Error(String(err));
          this.handleStreamClose(error);
        });

        // Initialize MCP handshake
        await this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'ghostslate-agent',
            version: '0.1.0',
          },
        });

        await this.sendNotification('notifications/initialized', {});
        this.connected = true;
      } finally {
        this.connecting = false;
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  private handleStreamClose(error?: Error): void {
    this.connecting = false;
    this.connected = false;
    this.connectPromise = null;
    this.postUrl = null;
    this.sessionId = null;
    const err = error || new Error('MCP SSE stream disconnected');
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pendingRequests.clear();
  }

  private async waitForSession(maxWaitMs = 5000): Promise<void> {
    const startTime = Date.now();
    while (!this.postUrl) {
      if (Date.now() - startTime > maxWaitMs) {
        throw new ServiceUnavailableError('Timed out waiting for MCP SSE session handshake');
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  private async consumeSseStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          this.handleStreamClose(new Error('MCP SSE stream ended'));
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        if (Buffer.byteLength(buffer, 'utf8') > MAX_SSE_EVENT_BYTES) {
          throw new ServiceUnavailableError('MCP event exceeds the safe response limit');
        }
        const normalized = buffer.replace(/\r\n/g, '\n');
        const events = normalized.split('\n\n');
        buffer = events.pop() || '';

        for (const eventText of events) {
          if (!eventText.trim()) continue;
          this.handleSseEvent(eventText);
        }
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleStreamClose(error);
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  private handleSseEvent(rawEvent: string): void {
    const lines = rawEvent.split('\n');
    let eventType = 'message';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data += (data ? '\n' : '') + line.slice(5).trim();
      }
    }

    if (eventType === 'endpoint') {
      const endpointPath = data.trim();
      const url = new URL(endpointPath, `${this.baseUrl}/`);
      if (url.origin !== new URL(this.baseUrl).origin) {
        throw new ServiceUnavailableError('MCP server returned a cross-origin session endpoint');
      }
      this.postUrl = url.toString();
      this.sessionId = url.searchParams.get('session_id');
      return;
    }

    if (eventType === 'message' && data) {
      try {
        const message = JSON.parse(data);
        if (message.id !== undefined && this.pendingRequests.has(message.id)) {
          const pending = this.pendingRequests.get(message.id)!;
          clearTimeout(pending.timer);
          this.pendingRequests.delete(message.id);

          if (message.error) {
            pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
          } else {
            pending.resolve(message.result);
          }
        }
      } catch {
        // Ignore unparseable message chunks
      }
    }
  }

  async sendRequest<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!this.connected || !this.postUrl) {
      if (!this.connecting) {
        await this.connect();
      } else if (this.connectPromise && method !== 'initialize') {
        await this.connectPromise;
      }
    }

    if (!this.postUrl) {
      throw new ServiceUnavailableError('MCP client is not connected (no endpoint URL)');
    }
    const postUrl = this.postUrl;

    const id = this.nextRequestId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      const requestAbort = new AbortController();
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        requestAbort.abort();
        reject(
          new ServiceUnavailableError(
            `MCP request '${method}' timed out after ${this.timeoutMs}ms`,
          ),
        );
      }, this.timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        timer,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.authToken && this.authToken.trim().length > 0) {
        headers.Authorization = `Bearer ${this.authToken}`;
      }

      fetch(postUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: requestAbort.signal,
      })
        .then((response) => {
          if (!response.ok)
            throw new ServiceUnavailableError(`MCP endpoint returned HTTP ${response.status}`);
        })
        .catch((err) => {
          const pending = this.pendingRequests.get(id);
          if (pending) {
            this.pendingRequests.delete(id);
            pending.reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
    });
  }

  async sendNotification(method: string, params: Record<string, unknown>): Promise<void> {
    if (!this.postUrl) return;
    const postUrl = this.postUrl;

    const payload = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.authToken && this.authToken.trim().length > 0) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    const response = await fetch(postUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new ServiceUnavailableError(`MCP endpoint returned HTTP ${response.status}`);
    }
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const res = await this.sendRequest<{ tools: McpToolDefinition[] }>('tools/list', {});
    return res.tools || [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    return this.sendRequest<McpToolResult>('tools/call', {
      name,
      arguments: args,
    });
  }

  disconnect(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.handleStreamClose(new Error('MCP client disconnected'));
  }
}
