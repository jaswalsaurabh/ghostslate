import { describe, it, expect } from 'vitest';
import {
  InvestigationRunsService,
  type InvestigationInput,
  type InvestigationRunner,
} from '../src/services/investigation-runs.service.js';
import type {
  InvestigationEvent,
  InvestigationResult,
} from '../src/services/investigation.service.js';
import type { GroundingReport } from '../src/services/grounding.service.js';

describe('InvestigationRunsService — Run Lifecycle, Generator Driving & Error Safety', () => {
  const baseInput: InvestigationInput = {
    prompt: 'Investigate ad stitch performance and latency metrics across SSPs for channel ch-01.',
    channel: 'ch-01',
    from: '2026-08-14T19:00:00.000Z',
    to: '2026-08-14T23:00:00.000Z',
  };

  it('1. Fix 1: Generator drive loop captures generator return value into run.result', async () => {
    const expectedResult: InvestigationResult = {
      diagnosis: 'Offending SSP isolated: ssp-beta on CTV HEVC at 97.73% slate bleed.',
      steps: [],
      toolCallsCount: 3,
      remediation: {
        status: 'unavailable',
        reason: 'NO_INCIDENT',
      },
    };

    const fakeGeneratorRunner: InvestigationRunner = async function* () {
      yield {
        type: 'status',
        timestamp: '2026-08-18T00:00:01.000Z',
        data: { message: 'Querying telemetry...' },
      };
      yield {
        type: 'diagnosis',
        timestamp: '2026-08-18T00:00:02.000Z',
        data: { diagnosis: expectedResult.diagnosis },
      };
      return expectedResult;
    };

    const service = new InvestigationRunsService(fakeGeneratorRunner);
    const { runKey, created } = service.startOrAttach(baseInput);
    expect(created).toBe(true);

    // Consume stream until completion
    const received: InvestigationEvent[] = [];
    for await (const ev of service.subscribe(runKey)) {
      received.push(ev);
    }

    expect(received).toHaveLength(2);

    const completedRun = service.get(runKey);
    expect(completedRun).toBeDefined();
    expect(completedRun?.status).toBe('complete');
    expect(completedRun?.result).toBeDefined();
    expect(completedRun?.result).toEqual(expectedResult);
    expect(completedRun?.result?.toolCallsCount).toBe(3);
  });

  it('2. Failed run emits one sanitized terminal error without leaking upstream details', async () => {
    const errorMessage = 'Gemini API quota exceeded (429 Resource Exhausted)';
    const publicError = 'Investigation failed due to an upstream service error';

    const failingRunner: InvestigationRunner = async function* () {
      yield {
        type: 'status',
        timestamp: '2026-08-18T00:00:01.000Z',
        data: { message: 'Connecting to ClickHouse...' },
      };
      yield {
        type: 'status',
        timestamp: '2026-08-18T00:00:02.000Z',
        data: { message: 'Initiating reasoning turn 1...' },
      };
      throw new Error(errorMessage);
    };

    const service = new InvestigationRunsService(failingRunner);
    const { runKey, created } = service.startOrAttach(baseInput);
    expect(created).toBe(true);

    const events: InvestigationEvent[] = [];
    for await (const ev of service.subscribe(runKey)) {
      events.push(ev);
    }

    expect(events).toHaveLength(3);
    expect(events[0]?.type).toBe('status');
    expect(events[1]?.type).toBe('status');
    expect(events[2]?.type).toBe('error');
    expect(events[2]?.data.error).toBe(publicError);

    const failedRun = service.get(runKey);
    expect(failedRun?.status).toBe('failed');
    expect(failedRun?.error).toBe(publicError);
  });

  it('3. Fix 2: Guard against duplicate error events if runner already emitted an error before throwing', async () => {
    const errorMsg = 'MCP connection lost';
    const runnerWithPreEmittedError: InvestigationRunner = async function* () {
      yield {
        type: 'status',
        timestamp: '2026-08-18T00:00:01.000Z',
        data: { message: 'Starting...' },
      };
      yield {
        type: 'error',
        timestamp: '2026-08-18T00:00:02.000Z',
        data: { error: errorMsg },
      };
      throw new Error(errorMsg);
    };

    const service = new InvestigationRunsService(runnerWithPreEmittedError);
    const { runKey } = service.startOrAttach(baseInput);

    const events: InvestigationEvent[] = [];
    for await (const ev of service.subscribe(runKey)) {
      events.push(ev);
    }

    // Exactly 2 events (status + single error), not duplicated
    expect(events).toHaveLength(2);
    expect(events.filter((e) => e.type === 'error')).toHaveLength(1);
  });

  it('4. Fix 3: Mid-run iterator.return() deregisters listener cleanly and does not disrupt concurrent subscribers', async () => {
    let unblockStep2: () => void = () => {};
    const step2Promise = new Promise<void>((r) => {
      unblockStep2 = r;
    });

    const controlledRunner: InvestigationRunner = async function* () {
      yield {
        type: 'status',
        timestamp: '2026-08-18T00:00:01.000Z',
        data: { message: 'Step 1' },
      };
      await step2Promise;
      yield {
        type: 'status',
        timestamp: '2026-08-18T00:00:02.000Z',
        data: { message: 'Step 2' },
      };
      return {
        diagnosis: 'Done',
        steps: [],
        toolCallsCount: 0,
        remediation: { status: 'unavailable', reason: 'NO_INCIDENT' },
      };
    };

    const service = new InvestigationRunsService(controlledRunner);
    const { runKey } = service.startOrAttach(baseInput);

    const sub1 = service.subscribe(runKey);
    const sub2 = service.subscribe(runKey);

    // Both subscribers receive Step 1
    const sub1Ev1 = await sub1.next();
    const sub2Ev1 = await sub2.next();
    expect(sub1Ev1.value?.type).toBe('status');
    expect(sub2Ev1.value?.type).toBe('status');

    // Sub1 disconnects mid-run
    await sub1.return();

    // Verify sub2 still receives subsequent events after unblocking
    unblockStep2();
    const sub2Ev2 = await sub2.next();
    expect(sub2Ev2.value?.data.message).toBe('Step 2');

    await sub2.return();

    // Both disconnected: service must hold no listeners for this run
    expect(service.hasListener(runKey)).toBe(false);
  });

  it('5. Same input, one run: multiple startOrAttach calls return created: true then created: false and run agent once', async () => {
    let runnerExecutions = 0;
    const runner: InvestigationRunner = async function* () {
      runnerExecutions++;
      yield {
        type: 'status',
        timestamp: '2026-08-18T00:00:01.000Z',
        data: { message: 'Started' },
      };
      return {
        diagnosis: 'Done',
        steps: [],
        toolCallsCount: 1,
        remediation: { status: 'unavailable', reason: 'NO_INCIDENT' },
      };
    };

    const service = new InvestigationRunsService(runner);
    const first = service.startOrAttach(baseInput);
    expect(first.created).toBe(true);

    const second = service.startOrAttach(baseInput);
    expect(second.runKey).toBe(first.runKey);
    expect(second.created).toBe(false);

    // Await run completion
    for await (const _ of service.subscribe(first.runKey)) {
      // drain
    }

    expect(runnerExecutions).toBe(1);
  });

  it('6. Normalisation: whitespace, internal runs, and casing collapse to the same key; channel/window differ', () => {
    const dummyRunner: InvestigationRunner = async function* () {
      return {
        diagnosis: '',
        steps: [],
        toolCallsCount: 0,
        remediation: { status: 'unavailable', reason: 'NO_INCIDENT' },
      };
    };
    const service = new InvestigationRunsService(dummyRunner);

    const keyCanonical = service.computeRunKey({
      prompt: 'Vision classifier detected a SLATE BLEED on channel ch-01',
      channel: 'ch-01',
      from: '2026-08-18T00:00:00.000Z',
      to: '2026-08-18T02:00:00.000Z',
    });

    const keyMessyWhitespaceAndCase = service.computeRunKey({
      prompt: '   vision   classifier   detected   a   slate   bleed   on   channel   ch-01   ',
      channel: '  CH-01  ',
      from: ' 2026-08-18T00:00:00.000Z ',
      to: ' 2026-08-18T02:00:00.000Z ',
    });

    expect(keyMessyWhitespaceAndCase).toBe(keyCanonical);

    const keyDifferentChannel = service.computeRunKey({
      prompt: 'Vision classifier detected a SLATE BLEED on channel ch-01',
      channel: 'ch-02',
      from: '2026-08-18T00:00:00.000Z',
      to: '2026-08-18T02:00:00.000Z',
    });
    expect(keyDifferentChannel).not.toBe(keyCanonical);

    const keyDifferentWindow = service.computeRunKey({
      prompt: 'Vision classifier detected a SLATE BLEED on channel ch-01',
      channel: 'ch-01',
      from: '2026-08-17T00:00:00.000Z',
      to: '2026-08-17T02:00:00.000Z',
    });
    expect(keyDifferentWindow).not.toBe(keyCanonical);
  });

  it('7. Replay: subscribing to a completed run yields the full buffered event sequence in order and ends', async () => {
    const recordedEvents: InvestigationEvent[] = [
      {
        type: 'status',
        timestamp: '2026-08-18T00:00:01.000Z',
        data: { message: 'Connecting...' },
      },
      {
        type: 'tool_result',
        timestamp: '2026-08-18T00:00:02.000Z',
        data: { name: 'run_query', rowsReturned: 80, durationMs: 44 },
      },
      {
        type: 'diagnosis',
        timestamp: '2026-08-18T00:00:03.000Z',
        data: { diagnosis: 'Root cause confirmed' },
      },
    ];

    const runner: InvestigationRunner = async function* () {
      for (const ev of recordedEvents) {
        yield ev;
      }
      return {
        diagnosis: 'Root cause confirmed',
        steps: recordedEvents,
        toolCallsCount: 1,
        remediation: { status: 'unavailable', reason: 'NO_INCIDENT' },
      };
    };

    const service = new InvestigationRunsService(runner);
    const { runKey } = service.startOrAttach(baseInput);

    // Wait until run completes
    for await (const _ of service.subscribe(runKey)) {
      // drain initial run
    }

    // Replay on fresh subscriber
    const replayed: InvestigationEvent[] = [];
    for await (const ev of service.subscribe(runKey)) {
      replayed.push(ev);
    }

    expect(replayed).toEqual(recordedEvents);
    expect(replayed).toHaveLength(3);
  });

  it('8. Failed runs are retryable: fresh startOrAttach returns created: true after a run failure', async () => {
    let attempts = 0;
    const runner: InvestigationRunner = async function* () {
      attempts++;
      if (attempts === 1) {
        throw new Error('Transient 503 error');
      }
      yield {
        type: 'status',
        timestamp: '2026-08-18T00:00:01.000Z',
        data: { message: 'Recovered run' },
      };
      return {
        diagnosis: 'Success',
        steps: [],
        toolCallsCount: 0,
        remediation: { status: 'unavailable', reason: 'NO_INCIDENT' },
      };
    };

    const service = new InvestigationRunsService(runner);
    const first = service.startOrAttach(baseInput);
    expect(first.created).toBe(true);

    for await (const _ of service.subscribe(first.runKey)) {
      // drain failed run
    }

    const failedRun = service.get(first.runKey);
    expect(failedRun?.status).toBe('failed');

    // Fresh start with same input should be created: true and succeed
    const retry = service.startOrAttach(baseInput);
    expect(retry.runKey).toBe(first.runKey);
    expect(retry.created).toBe(true);

    const retryEvents: InvestigationEvent[] = [];
    for await (const ev of service.subscribe(retry.runKey)) {
      retryEvents.push(ev);
    }

    expect(retryEvents[0]?.data.message).toBe('Recovered run');
    expect(service.get(retry.runKey)?.status).toBe('complete');
  });

  it('9. Grounding survives replay: diagnosis event replayed from buffer preserves GroundingReport', async () => {
    const groundingReport: GroundingReport = {
      grounded: true,
      violations: [],
      checkedClaims: 5,
    };

    const runner: InvestigationRunner = async function* () {
      yield {
        type: 'diagnosis',
        timestamp: '2026-08-18T00:00:05.000Z',
        data: {
          diagnosis: 'SSP-BETA on CTV HEVC experienced 97.73% slate bleed ($1,933.17 loss).',
          grounding: groundingReport,
        },
      };
      return {
        diagnosis: 'SSP-BETA on CTV HEVC experienced 97.73% slate bleed ($1,933.17 loss).',
        steps: [],
        toolCallsCount: 1,
        remediation: { status: 'unavailable', reason: 'NO_INCIDENT' },
      };
    };

    const service = new InvestigationRunsService(runner);
    const { runKey } = service.startOrAttach(baseInput);

    // Drain initial run
    for await (const _ of service.subscribe(runKey)) {
      // drain
    }

    // Replay
    const replayed: InvestigationEvent[] = [];
    for await (const ev of service.subscribe(runKey)) {
      replayed.push(ev);
    }

    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.type).toBe('diagnosis');
    expect(replayed[0]?.data.grounding).toEqual(groundingReport);
  });
});
