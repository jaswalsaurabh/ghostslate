import { createHash } from 'node:crypto';
import type { InvestigationEvent, InvestigationResult } from './investigation.service.js';
import { ServiceUnavailableError } from '../errors/domain-error.js';

const MAX_RETAINED_RUNS = 100;
const RUN_RETENTION_MS = 60 * 60 * 1_000;
const PUBLIC_INVESTIGATION_ERROR = 'Investigation failed due to an upstream service error';

export type RunStatus = 'running' | 'complete' | 'failed';

export interface InvestigationRun {
  runKey: string;
  status: RunStatus;
  startedAt: string;
  events: InvestigationEvent[];
  result?: InvestigationResult;
  error?: string;
}

export interface InvestigationInput {
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

  constructor(private readonly runner: InvestigationRunner) {}

  computeRunKey(input: InvestigationInput): string {
    const channel = input.channel.trim().toLowerCase();
    const from = input.from.trim();
    const to = input.to.trim();
    const prompt = input.prompt.trim().replace(/\s+/g, ' ').toLowerCase();

    const normalized = `${channel}|${from}|${to}|${prompt}`;
    return createHash('sha256').update(normalized).digest('hex');
  }

  startOrAttach(input: InvestigationInput): { runKey: string; created: boolean } {
    this.pruneInactiveRuns();
    const runKey = this.computeRunKey(input);
    const existing = this.runs.get(runKey);

    if (existing && (existing.status === 'running' || existing.status === 'complete')) {
      return { runKey, created: false };
    }

    if (this.runs.size >= MAX_RETAINED_RUNS) {
      throw new ServiceUnavailableError('Investigation capacity is temporarily exhausted');
    }

    const run: InvestigationRun = {
      runKey,
      status: 'running',
      startedAt: new Date().toISOString(),
      events: [],
    };
    this.runs.set(runKey, run);

    void this.driveRun(runKey, input);

    return { runKey, created: true };
  }

  private async driveRun(runKey: string, input: InvestigationInput): Promise<void> {
    const generator = this.runner(input);
    try {
      while (true) {
        const { value, done } = await generator.next();
        if (done) {
          this.completeRun(runKey, value);
          break;
        }
        this.recordEvent(runKey, value);
      }
    } catch {
      this.failRun(runKey);
    }
  }

  private recordEvent(runKey: string, event: InvestigationEvent): void {
    const run = this.runs.get(runKey);
    if (!run) return;
    run.events.push(
      event.type === 'error'
        ? { ...event, data: { ...event.data, error: PUBLIC_INVESTIGATION_ERROR } }
        : event,
    );
    this.notifyListeners(runKey);
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

  async *subscribe(runKey: string): AsyncGenerator<InvestigationEvent, void, void> {
    const run = this.runs.get(runKey);
    if (!run) {
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

  get(runKey: string): InvestigationRun | undefined {
    return this.runs.get(runKey);
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
