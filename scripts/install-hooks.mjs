import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const result = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
  encoding: 'utf8',
});
if (![0, 1].includes(result.status))
  throw new Error('Could not inspect existing hook configuration.');
const configured = result.stdout ?? '';
if (configured.trim() && configured.trim() !== '.githooks')
  throw new Error(
    'An existing hooksPath is configured; integrate manually without overwriting it.',
  );
const existing = execFileSync(
  'git',
  ['rev-parse', '--git-path', 'hooks/pre-push'],
  { encoding: 'utf8' },
).trim();
const hooksDirectory = dirname(existing);
if (
  !configured.trim() &&
  existsSync(hooksDirectory) &&
  readdirSync(hooksDirectory).some((name) => !name.endsWith('.sample'))
)
  throw new Error(
    'Existing hooks need manual integration before changing hooksPath.',
  );
const hook = resolve('.githooks/pre-push');
if (!existsSync(hook)) throw new Error('Missing project hook.');
chmodSync(hook, 0o755);
execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks']);
console.log(
  'Repository-local pre-push hook installed. Existing hooks were not overwritten.',
);
