import express, { type Express } from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { HealthService } from './services/health.service.js';
import { HealthController } from './controllers/health.controller.js';
import { createHealthRouter } from './routes/health.route.js';
import { McpClientService } from './services/mcp.service.js';
import { InvestigationService } from './services/investigation.service.js';
import { InvestigationController } from './controllers/investigation.controller.js';
import { createInvestigationRouter } from './routes/investigation.route.js';
import { VisionService } from './services/vision.service.js';
import { VisionController } from './controllers/vision.controller.js';
import { createVisionRouter } from './routes/vision.route.js';
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

  const healthService = new HealthService();
  const healthController = new HealthController(healthService);

  const mcpService = new McpClientService();
  const investigationService = new InvestigationService(mcpService);
  const investigationController = new InvestigationController(investigationService);

  const visionService = new VisionService();
  const visionController = new VisionController(visionService);

  app.use('/api', createHealthRouter(healthController));
  app.use('/api', createInvestigationRouter(investigationController));
  app.use('/api', createVisionRouter(visionController));

  app.use(createErrorHandler(logger));

  return app;
}
