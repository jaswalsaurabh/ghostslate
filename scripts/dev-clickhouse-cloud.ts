import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const composeFile = 'infra/docker-compose.clickhouse-cloud.yml';
const localEnv = readFileSync('.env', 'utf8');
for (const line of localEnv.split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  const key = match?.[1];
  const value = match?.[2];
  if (key && value !== undefined && process.env[key] === undefined) {
    process.env[key] = value.replace(/^(['"])(.*)\1$/, '$2');
  }
}

const required = [
  'CLICKHOUSE_CLOUD_HOST',
  'CLICKHOUSE_CLOUD_USER',
  'CLICKHOUSE_CLOUD_PASSWORD',
  'CLICKHOUSE_MCP_AUTH_TOKEN',
] as const;

const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const port = process.env.CLICKHOUSE_CLOUD_MCP_PORT ?? '18000';
const runtimeEnv = {
  ...process.env,
  MCP_SERVER_URL: `http://127.0.0.1:${port}`,
  CLICKHOUSE_MCP_AUTH_TOKEN: process.env.CLICKHOUSE_MCP_AUTH_TOKEN,
};

function run(command: string, args: string[], env = process.env): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

const composeArgs = ['compose', '--env-file', '.env', '-f', composeFile, 'up', '-d'];
const composeStartCode = await run('docker', composeArgs);
if (composeStartCode !== 0) process.exit(composeStartCode);

let shuttingDown = false;
const stopMcp = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await run('docker', ['compose', '--env-file', '.env', '-f', composeFile, 'down']);
};

process.once('SIGINT', () => void stopMcp().finally(() => process.exit(130)));
process.once('SIGTERM', () => void stopMcp().finally(() => process.exit(143)));

const devCode = await run(
  'pnpm',
  ['--parallel', '--filter', './web', '--filter', './server', 'dev'],
  runtimeEnv,
);
await stopMcp();
process.exit(devCode);
