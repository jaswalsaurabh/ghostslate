import express, { type Express } from 'express';
import cors from 'cors';
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
import { InvestigationController } from './controllers/investigation.controller.js';
import { createInvestigationRouter } from './routes/investigation.route.js';
import { VisionService } from './services/vision.service.js';
import { VisionController } from './controllers/vision.controller.js';
import { createVisionRouter } from './routes/vision.route.js';
import { MetricsService } from './services/metrics.service.js';
import { NotFoundError } from './errors/domain-error.js';
import { createErrorHandler } from './middleware/error-handler.js';

export interface AppContext {
  logger: Logger;
}

export function createApp({ logger }: AppContext): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === '/api/health',
      },
    }),
  );

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
  const investigationController = new InvestigationController(investigationRunsService);

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
