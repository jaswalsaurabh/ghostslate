import express, { type Express } from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { HealthService } from './services/health.service.js';
import { HealthController } from './controllers/health.controller.js';
import { createHealthRouter } from './routes/health.route.js';
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

  app.use('/api', createHealthRouter(healthController));

  app.use(createErrorHandler(logger));

  return app;
}
