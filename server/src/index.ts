import { pino } from 'pino';
import { createApp } from './app.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const port = Number(process.env.PORT) || 8080;
const app = createApp({ logger });

const server = app.listen(port, () => {
  logger.info({ port }, 'GhostSlate server started');
});
// Bound request parsing and idle connection time; streamed investigation
// responses remain governed by their own run deadline.
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 65_000;

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Gracefully shutting down server');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
