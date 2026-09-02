import { createHmac, randomBytes } from 'node:crypto';
import type { InvestigationEvent, InvestigationResult } from './investigation.service.js';
import { ServiceUnavailableError } from '../errors/domain-error.js';

const MAX_RETAINED_RUNS = 100;
const RUN_RETENTION_MS = 60 * 60 * 1_000;
const PUBLIC_INVESTIGATION_ERROR = 'Investigation failed due to an upstream service error';
const MAX_ACTIVE_RUNS = 4;
const MAX_RUN_EVENTS = 300;
const MAX_EVENT_BYTES = 64 * 1_024;
const MAX_RUN_BYTES = 4 * 1_024 * 1_024;
const MAX_SUBSCRIBERS_PER_RUN = 8;
const RUN_TIMEOUT_MS = 4 * 60 * 1_000;
const RUN_KEY_SECRET = process.env.RUN_KEY_SECRET || randomBytes(32).toString('hex');
if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.RUN_KEY_SECRET || process.env.RUN_KEY_SECRET.length < 32)
) {
  throw new Error('RUN_KEY_SECRET must be a 32-character-or-longer production secret');
}

export type RunStatus = 'running' | 'complete' | 'failed';

export interface InvestigationRun {
  runKey: string;
  scopeKey: string;
  status: RunStatus;
  startedAt: string;
  events: InvestigationEvent[];
  result?: InvestigationResult;
  error?: string;
}

export interface InvestigationInput {
  scenarioId: string;
  prompt: string;
  channel: string;
  from: string;
  to: string;
}

export type InvestigationRunner = (
  input: InvestigationInput,
) => AsyncGenerator<InvestigationEvent, InvestigationResult, void>;

export class InvestigationRunsService {
  private readonly runs = new Map<string, InvestigationRun>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private activeRuns = 0;

  constructor(private readonly runner: InvestigationRunner) {}

  computeRunKey(input: InvestigationInput, scopeKey = 'default'): string {
    const scenarioId = input.scenarioId.trim().toLowerCase();
    const channel = input.channel.trim().toLowerCase();
    const from = input.from.trim();
    const to = input.to.trim();
    const prompt = input.prompt.trim().replace(/\s+/g, ' ').toLowerCase();

    const normalized = `${scenarioId}|${channel}|${from}|${to}|${prompt}`;
    return createHmac('sha256', RUN_KEY_SECRET).update(`${scopeKey}|${normalized}`).digest('hex');
  }

  startOrAttach(
    input: InvestigationInput,
    scopeKey = 'default',
  ): { runKey: string; created: boolean } {
    this.pruneInactiveRuns();
    const runKey = this.computeRunKey(input, scopeKey);
    const existing = this.runs.get(runKey);

    if (existing && (existing.status === 'running' || existing.status === 'complete')) {
      return { runKey, created: false };
    }

    if (this.runs.size >= MAX_RETAINED_RUNS || this.activeRuns >= MAX_ACTIVE_RUNS) {
      throw new ServiceUnavailableError('Investigation capacity is temporarily exhausted');
    }

    const run: InvestigationRun = {
      runKey,
      scopeKey,
      status: 'running',
      startedAt: new Date().toISOString(),
      events: [],
    };
    this.runs.set(runKey, run);
    this.activeRuns += 1;

    void this.driveRun(runKey, input);

    return { runKey, created: true };
  }

  private async driveRun(runKey: string, input: InvestigationInput): Promise<void> {
    const generator = this.runner(input);
    try {
      while (true) {
        const { value, done } = await this.nextWithTimeout(generator);
        if (done) {
          this.completeRun(runKey, value);
          break;
        }
        this.recordEvent(runKey, value);
      }
    } catch {
      this.failRun(runKey);
    } finally {
      this.activeRuns = Math.max(0, this.activeRuns - 1);
      void generator.return(undefined as unknown as InvestigationResult);
    }
  }

  private async nextWithTimeout(
    generator: AsyncGenerator<InvestigationEvent, InvestigationResult, void>,
  ): Promise<IteratorResult<InvestigationEvent, InvestigationResult>> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        generator.next(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new ServiceUnavailableError('Investigation timed out')),
            RUN_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private recordEvent(runKey: string, event: InvestigationEvent): void {
    const run = this.runs.get(runKey);
    if (!run) return;
    if (run.events.length >= MAX_RUN_EVENTS || this.eventBytes(run) >= MAX_RUN_BYTES) return;
    const safeEvent =
      event.type === 'error'
        ? { ...event, data: { ...event.data, error: PUBLIC_INVESTIGATION_ERROR } }
        : event.type === 'frame_classified'
          ? {
              ...event,
              data: Object.fromEntries(
                Object.entries(event.data).filter(([key]) => key !== 'frameBase64'),
              ),
            }
          : event;
    const serialized = JSON.stringify(safeEvent);
    run.events.push(
      Buffer.byteLength(serialized, 'utf8') <= MAX_EVENT_BYTES
        ? safeEvent
        : {
            type: 'error',
            timestamp: new Date().toISOString(),
            data: { error: 'Investigation event exceeded the safe size limit' },
          },
    );
    this.notifyListeners(runKey);
  }

  private eventBytes(run: InvestigationRun): number {
    return run.events.reduce(
      (total, event) => total + Buffer.byteLength(JSON.stringify(event), 'utf8'),
      0,
    );
  }

  private completeRun(runKey: string, result?: InvestigationResult): void {
    const run = this.runs.get(runKey);
    if (!run) return;
    run.status = 'complete';
    if (result) {
      run.result = result;
    }
    this.notifyListeners(runKey);
  }

  private failRun(runKey: string): void {
    const run = this.runs.get(runKey);
    if (!run) return;

    // Guard against duplicate error events if the runner already yielded one
    const lastEvent = run.events[run.events.length - 1];
    const isDuplicate =
      lastEvent?.type === 'error' &&
      String(lastEvent.data?.error ?? '') === PUBLIC_INVESTIGATION_ERROR;

    if (!isDuplicate) {
      run.events.push({
        type: 'error',
        timestamp: new Date().toISOString(),
        data: { error: PUBLIC_INVESTIGATION_ERROR },
      });
    }

    run.status = 'failed';
    run.error = PUBLIC_INVESTIGATION_ERROR;
    this.notifyListeners(runKey);
  }

  async *subscribe(
    runKey: string,
    scopeKey = 'default',
  ): AsyncGenerator<InvestigationEvent, void, void> {
    const run = this.runs.get(runKey);
    if (!run || run.scopeKey !== scopeKey) {
      return;
    }

    let nextIndex = 0;
    let notify: (() => void) | null = null;

    const onUpdate = () => {
      if (notify) {
        const resolve = notify;
        notify = null;
        resolve();
      }
    };

    let set = this.listeners.get(runKey);
    if (!set) {
      set = new Set();
      this.listeners.set(runKey, set);
    }
    if (set.size >= MAX_SUBSCRIBERS_PER_RUN) {
      yield {
        type: 'error',
        timestamp: new Date().toISOString(),
        data: { error: 'Investigation stream subscriber capacity is exhausted' },
      };
      return;
    }
    set.add(onUpdate);

    try {
      while (true) {
        while (nextIndex < run.events.length) {
          const ev = run.events[nextIndex++];
          if (ev) {
            yield ev;
          }
        }

        if (run.status !== 'running') {
          break;
        }

        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
    } finally {
      const currentSet = this.listeners.get(runKey);
      if (currentSet) {
        currentSet.delete(onUpdate);
        if (currentSet.size === 0) {
          this.listeners.delete(runKey);
        }
      }
    }
  }

  get(runKey: string, scopeKey = 'default'): InvestigationRun | undefined {
    const run = this.runs.get(runKey);
    return run?.scopeKey === scopeKey ? run : undefined;
  }

  hasListener(runKey: string): boolean {
    const set = this.listeners.get(runKey);
    return Boolean(set && set.size > 0);
  }

  private pruneInactiveRuns(): void {
    const expiry = Date.now() - RUN_RETENTION_MS;
    for (const [runKey, run] of this.runs) {
      if (run.status !== 'running' && Date.parse(run.startedAt) <= expiry) {
        this.runs.delete(runKey);
        this.listeners.delete(runKey);
      }
    }

    if (this.runs.size < MAX_RETAINED_RUNS) return;

    for (const [runKey, run] of this.runs) {
      if (run.status !== 'running') {
        this.runs.delete(runKey);
        this.listeners.delete(runKey);
        if (this.runs.size < MAX_RETAINED_RUNS) return;
      }
    }
  }

  private notifyListeners(runKey: string): void {
    const set = this.listeners.get(runKey);
    if (set) {
      for (const listener of set) {
        listener();
      }
    }
  }
}
