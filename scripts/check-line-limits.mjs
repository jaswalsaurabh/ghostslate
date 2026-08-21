import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const excludedDirectories = new Set([
  '.git',
  '.venv',
  '.vite',
  'coverage',
  'dist',
  'graphify-out',
  'node_modules',
]);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) files.push(...(await collectSourceFiles(path)));
    } else if (sourceExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

function countLines(source) {
  if (source.length === 0) return 0;
  return source.endsWith('\n') ? source.split('\n').length - 1 : source.split('\n').length;
}

const files = await collectSourceFiles(repositoryRoot);
const violations = [];

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
  console.log(`Line limits passed for ${files.length} source files.`);
}
