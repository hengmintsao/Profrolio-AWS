import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolveRelease } from './release-policy.mjs';
import { validatePushUpdates } from './push-policy.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
function requireCleanTree() {
  if (git('status', '--porcelain=v1', '--untracked-files=all'))
    throw new Error(
      'Commit the reviewed scope before pushing; the working tree and index must match HEAD.',
    );
}
requireCleanTree();
const head = git('rev-parse', 'HEAD');
const input = readFileSync(0, 'utf8');
const resolveTag = (tag, objectSha) => {
  if (git('rev-parse', `refs/tags/${tag}`) !== objectSha)
    throw new Error('Outgoing tag changed before validation.');
  return resolveRelease(tag);
};
validatePushUpdates(input, head, resolveTag);
execFileSync(process.execPath, ['scripts/preflight.mjs'], { stdio: 'inherit' });
requireCleanTree();
if (git('rev-parse', 'HEAD') !== head)
  throw new Error('HEAD changed during preflight; rerun before pushing.');
validatePushUpdates(input, head, resolveTag);
console.log(
  'Automated pre-push checks passed. Human review and explicit upload authorization remain separate requirements.',
);
