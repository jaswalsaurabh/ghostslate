import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { InvestigationRunsService } from '../services/investigation-runs.service.js';
import { RemediationService } from '../services/remediation.service.js';
import { NotFoundError, ValidationError } from '../errors/domain-error.js';

const isoUtcString = z
  .string()
  .trim()
  .refine(
    (val) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(val) && !isNaN(Date.parse(val)),
    { message: 'Must be a valid ISO-8601 UTC string ending with Z' },
  )
  .transform((val) => new Date(val).toISOString());

// Primary incident window recorded in ghostslate_eval.injected_incidents
// and asserted in sql/checks/004-incident-assertions.sql (channel ch-01, 2026-08-14 19:00-23:00 UTC).
// Single owner of default investigation window across the application.
export const InvestigateSpikeSchema = z
  .object({
    prompt: z.string().min(1, 'Prompt is required'),
    channel: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9_-]+$/,
        'Channel must contain only alphanumeric characters, underscores, or hyphens',
      )
      .default('ch-01'),
    from: isoUtcString.default('2026-08-14T19:00:00.000Z'),
    to: isoUtcString.default('2026-08-14T23:00:00.000Z'),
  })
  .refine((data) => new Date(data.from).getTime() < new Date(data.to).getTime(), {
    message: 'Start time (from) must be strictly before end time (to)',
    path: ['from'],
  });

export class InvestigationController {
  constructor(
    private readonly runsService: InvestigationRunsService,
    private readonly remediationService: RemediationService,
  ) {}

  investigateSpike = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = InvestigateSpikeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }

      const { runKey, created } = this.runsService.startOrAttach(parsed.data);
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
      const runKey = String(req.params.runKey ?? '').trim();
      if (!runKey) {
        throw new ValidationError('Run key parameter is required');
      }

      const run = this.runsService.get(runKey);
      if (!run) {
        throw new NotFoundError(`Investigation run not found: ${runKey}`);
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      headersFlushed = true;

      const iterator = this.runsService.subscribe(runKey);

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

      while (!isClosed) {
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
          const errorMsg = err instanceof Error ? err.message : String(err);
          const errorEvent = {
            type: 'error',
            timestamp: new Date().toISOString(),
            data: { error: errorMsg },
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
      const runKey = String(req.params.runKey ?? '').trim();
      if (!runKey) {
        throw new ValidationError('Run key parameter is required');
      }

      const run = this.runsService.get(runKey);
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
      const runKey = String(req.params.runKey ?? '').trim();
      if (!runKey) {
        throw new ValidationError('Run key parameter is required');
      }

      const run = this.runsService.get(runKey);
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
