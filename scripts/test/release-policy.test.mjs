import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveRelease,
  validateVersions,
  requireSuccessfulJobs,
} from '../release-policy.mjs';

test('release gate fails closed on failed, cancelled, skipped, and missing jobs', () => {
  requireSuccessfulJobs({ application: { result: 'success' } }, [
    'application',
  ]);
  for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
    assert.throws(() =>
      requireSuccessfulJobs({ application: { result } }, ['application']),
    );
  }
  assert.throws(() => requireSuccessfulJobs({}, ['application']));
});

test('annotated main release resolves only when all package and lock versions match', () => {
  const sha = 'a'.repeat(40);
  const git = (...args) => {
    if (args[0] === 'cat-file') return 'tag';
    if (args[0] === 'rev-parse') return sha;
    if (args[0] === 'merge-base') return '';
    return JSON.stringify({
      version: '1.0.0',
      packages: { '': { version: '1.0.0' } },
    });
  };
  assert.equal(resolveRelease('v1.0.0', git), sha);
  assert.throws(() => resolveRelease('v2.0.0', git), /differ/);
});

test('release versions reject stale package locks and mismatched tags', () => {
  assert.equal(
    validateVersions([{ version: '1.0.0' }, { version: '1.0.0' }], 'v1.0.0'),
    '1.0.0',
  );
  assert.throws(() =>
    validateVersions([{ version: '1.0.0' }, { version: '1.0.1' }]),
  );
  assert.throws(() => validateVersions([{ version: '1.0.0' }], 'v2.0.0'));
});

test('release resolution rejects unsafe tags before invoking git', () => {
  for (const tag of ['main', '--help', 'v01.0.0', 'v1.0.0\nsource_sha=bad']) {
    assert.throws(() =>
      resolveRelease(tag, () => assert.fail('Git must not run')),
    );
  }
});

test('release resolution rejects lightweight tags and non-main ancestry', () => {
  assert.throws(() => resolveRelease('v1.0.0', () => 'commit'), /annotated/);
  assert.throws(
    () =>
      resolveRelease('v1.0.0', (...args) => {
        if (args[0] === 'cat-file') return 'tag';
        if (args[0] === 'rev-parse') return 'a'.repeat(40);
        throw new Error('Not reachable from main');
      }),
    /reachable/,
  );
});
