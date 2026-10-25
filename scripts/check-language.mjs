import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const extensions = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.json',
  '.css',
  '.html',
  '.md',
  '.toml',
  '.yml',
  '.yaml',
  '.txt',
]);
const paths = [
  ...new Set(
    execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: root, encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean),
  ),
];
const failures = [];
let checked = 0;
for (const path of paths) {
  if (path.startsWith('docs/reports/') || !extensions.has(extname(path)))
    continue;
  checked++;
  const lines = readFileSync(resolve(root, path), 'utf8').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (/\p{Script=Han}/u.test(line)) failures.push(`${path}:${index + 1}`);
  }
}
if (failures.length) {
  console.error(
    'Use English outside docs/reports/. Han characters found at:\n' +
      failures.join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(
    `PASS: ${checked} project text files contain no Han characters outside reports.`,
  );
}
