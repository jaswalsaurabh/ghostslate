import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { extname, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.mjs',
  '.py',
  '.sh',
  '.sql',
  '.ts',
  '.tsx',
]);
async function gitSourceFiles(stagedOnly: boolean): Promise<string[]> {
  const args = stagedOnly
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
    : ['ls-files', '-z'];
  const { stdout } = await execFileAsync('git', args, { cwd: repositoryRoot });

  return stdout
    .split('\0')
    .filter((path) => path.length > 0 && sourceExtensions.has(extname(path)))
    .map((path) => resolve(repositoryRoot, path));
}

function countLines(source: string): number {
  if (source.length === 0) return 0;
  return source.endsWith('\n') ? source.split('\n').length - 1 : source.split('\n').length;
}

interface LineLimitViolation {
  lines: number;
  limit: number;
  path: string;
}

const stagedOnly = process.argv.includes('--staged');
const files = await gitSourceFiles(stagedOnly);
const violations: LineLimitViolation[] = [];

for (const file of files) {
  const path = relative(repositoryRoot, file).split(sep).join('/');
  const limit = path.startsWith('web/src/') ? 280 : 500;
  const lines = countLines(await readFile(file, 'utf8'));
  if (lines > limit) violations.push({ lines, limit, path });
}

if (violations.length > 0) {
  console.error('Source line limits exceeded:');
  for (const violation of violations.sort((left, right) => right.lines - left.lines)) {
    console.error(`  ${violation.path}: ${violation.lines} lines (limit ${violation.limit})`);
  }
  process.exitCode = 1;
} else {
  const scope = stagedOnly ? 'staged' : 'tracked';
  console.log(`Line limits passed for ${files.length} ${scope} source files.`);
}
