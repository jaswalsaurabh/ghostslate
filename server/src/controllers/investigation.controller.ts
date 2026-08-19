import type { Request, Response, NextFunction } from 'express';
import { InvestigationService } from '../services/investigation.service.js';

export class InvestigationController {
  constructor(private readonly investigationService: InvestigationService) {}

  investigateSpike = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let headersFlushed = false;
    try {
      const prompt =
        (req.body?.prompt as string) ||
        'Investigate why channel ch-01 experienced ad insertion playback issues and identify the offending SSP with metrics.';

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      headersFlushed = true;

      const generator = this.investigationService.investigateSpike(prompt);

      for await (const event of generator) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      res.write(
        `data: ${JSON.stringify({ type: 'done', timestamp: new Date().toISOString() })}\n\n`,
      );
      res.end();
    } catch (err: unknown) {
      if (headersFlushed || res.headersSent) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorEvent = {
          type: 'error',
          timestamp: new Date().toISOString(),
          data: { error: errorMsg },
        };
        res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
        res.end();
        return;
      }
      next(err);
    }
  };
}
