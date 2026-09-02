import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { InvestigationRunsService } from '../services/investigation-runs.service.js';
import { RemediationService } from '../services/remediation.service.js';
import { NotFoundError, ValidationError } from '../errors/domain-error.js';
import type { ScenarioService } from '../services/scenario.service.js';
import { getOrSetAnonymousSession } from '../middleware/anonymous-session.js';

export const InvestigateSpikeSchema = z
  .object({
    scenarioId: z.string().trim().min(1, 'Scenario ID is required').max(64),
    prompt: z.string().trim().min(1, 'Prompt is required').max(2_000, 'Prompt is too long'),
  })
  .strict();

const RunKeySchema = z.string().regex(/^[a-f0-9]{64}$/, 'Run key must be a SHA-256 identifier');

function parseRunKey(value: unknown): string {
  const parsed = RunKeySchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid run key');
  }
  return parsed.data;
}

export class InvestigationController {
  constructor(
    private readonly runsService: InvestigationRunsService,
    private readonly remediationService: RemediationService,
    private readonly scenarioService: ScenarioService,
  ) {}

  investigateSpike = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = getOrSetAnonymousSession(req, res);
      const parsed = InvestigateSpikeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }

      const scenario = this.scenarioService.require(parsed.data.scenarioId);
      const { runKey, created } = this.runsService.startOrAttach(
        {
          scenarioId: scenario.id,
          prompt: parsed.data.prompt,
          channel: scenario.channel,
          from: scenario.from,
          to: scenario.to,
        },
        session,
      );
      res.status(200).json({ runKey, created });
    } catch (err: unknown) {
      next(err);
    }
  };

  streamRun = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let headersFlushed = false;
    let heartbeat: NodeJS.Timeout | null = null;
    let isClosed = false;

    try {
      const session = getOrSetAnonymousSession(req, res);
      const runKey = parseRunKey(req.params.runKey);

      const run = this.runsService.get(runKey, session);
      if (!run) {
        throw new NotFoundError(`Investigation run not found: ${runKey}`);
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      headersFlushed = true;

      const iterator = this.runsService.subscribe(runKey, session);

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        void iterator.return();
      };

      req.on('close', cleanup);

      // Keep Cloud Run and proxy connections alive during thinking intervals
      heartbeat = setInterval(() => {
        if (isClosed || res.writableEnded) {
          cleanup();
          return;
        }
        res.write(': keep-alive\n\n');
      }, 15000);

      while (true) {
        const { value: event, done } = await iterator.next();
        if (done || isClosed) {
          break;
        }
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      }

      if (!isClosed && !res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({ type: 'done', timestamp: new Date().toISOString() })}\n\n`,
        );
        res.end();
      }
      cleanup();
    } catch (err: unknown) {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (headersFlushed || res.headersSent) {
        if (!res.writableEnded) {
          const errorEvent = {
            type: 'error',
            timestamp: new Date().toISOString(),
            data: { error: 'Investigation stream failed' },
          };
          res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
          res.end();
        }
        return;
      }
      next(err);
    }
  };

  getRemediation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = getOrSetAnonymousSession(req, res);
      const runKey = parseRunKey(req.params.runKey);

      const run = this.runsService.get(runKey, session);
      if (!run) {
        throw new NotFoundError(`Investigation run not found: ${runKey}`);
      }

      const remediation = this.remediationService.getState(runKey, run);
      res.status(200).json({ remediation });
    } catch (err: unknown) {
      next(err);
    }
  };

  approveRemediation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = getOrSetAnonymousSession(req, res);
      const runKey = parseRunKey(req.params.runKey);

      const run = this.runsService.get(runKey, session);
      if (!run) {
        throw new NotFoundError(`Investigation run not found: ${runKey}`);
      }

      const result = this.remediationService.approve(runKey, run);
      res.status(200).json(result);
    } catch (err: unknown) {
      next(err);
    }
  };
}
