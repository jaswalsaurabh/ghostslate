import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HealthService } from './services/health.service.js';
import { HealthController } from './controllers/health.controller.js';
import { createHealthRouter } from './routes/health.route.js';
import { McpClientService } from './services/mcp.service.js';
import { InvestigationService } from './services/investigation.service.js';
import { InvestigationRunsService } from './services/investigation-runs.service.js';
import { RemediationService } from './services/remediation.service.js';
import { InvestigationController } from './controllers/investigation.controller.js';
import { createInvestigationRouter } from './routes/investigation.route.js';
import { VisionService } from './services/vision.service.js';
import { VisionController } from './controllers/vision.controller.js';
import { createVisionRouter } from './routes/vision.route.js';
import { MetricsService } from './services/metrics.service.js';
import { NotFoundError } from './errors/domain-error.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { securityHeaders } from './middleware/security-headers.js';
import { createOriginProtection } from './middleware/origin-protection.js';
import { createRateLimit } from './middleware/rate-limit.js';

export interface AppContext {
  logger: Logger;
}

function trustedProxyHops(): number | false {
  if (process.env.NODE_ENV !== 'production') return false;
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  if (!Number.isInteger(hops) || hops < 0 || hops > 5) {
    throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5');
  }
  return hops;
}

export function createApp({ logger }: AppContext): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', trustedProxyHops());
  app.use(securityHeaders);
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === '/api/health',
      },
    }),
  );
  app.use(
    '/api',
    createRateLimit({ name: 'api', maxRequests: 120, windowMs: 60_000 }),
    createOriginProtection(),
  );
  app.use(
    '/api/investigate/spike',
    createRateLimit({ name: 'investigation', maxRequests: 10, windowMs: 15 * 60_000 }),
  );
  app.use(
    '/api/vision/classify',
    createRateLimit({ name: 'vision', maxRequests: 30, windowMs: 15 * 60_000 }),
  );
  app.use(
    '/api/investigate/runs/:runKey/stream',
    createRateLimit({ name: 'stream', maxRequests: 30, windowMs: 60_000 }),
  );
  app.use(
    '/api/investigate/runs/:runKey/remediation/approve',
    createRateLimit({ name: 'remediation', maxRequests: 10, windowMs: 15 * 60_000 }),
  );
  app.use('/api', express.json({ limit: '16kb', strict: true }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const mcpService = new McpClientService();
  const healthService = new HealthService(mcpService);
  const healthController = new HealthController(healthService);

  const visionService = new VisionService();
  const metricsService = new MetricsService();
  const investigationService = new InvestigationService(mcpService, visionService, metricsService);
  const investigationRunsService = new InvestigationRunsService((input) =>
    investigationService.investigateSpike(input.prompt, {
      channel: input.channel,
      from: input.from,
      to: input.to,
    }),
  );
  const remediationService = new RemediationService(logger);
  const investigationController = new InvestigationController(
    investigationRunsService,
    remediationService,
  );

  const visionController = new VisionController(visionService);

  app.use('/api', createHealthRouter(healthController));
  app.use('/api', createInvestigationRouter(investigationController));
  app.use('/api', createVisionRouter(visionController));

  app.use('/api', (_req, _res, next) => {
    next(new NotFoundError('API endpoint not found'));
  });

  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.resolve(here, '../../web/dist');

  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('/*splat', (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(createErrorHandler(logger));

  return app;
}
