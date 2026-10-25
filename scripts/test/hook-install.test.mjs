import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';

test('hook installation preserves other active hooks and existing hook paths', () => {
  const temporaryRoot = resolve(tmpdir());
  const fixture = mkdtempSync(join(temporaryRoot, 'portfolio-hooks-test-'));
  try {
    const git = (...args) =>
      execFileSync('git', args, { cwd: fixture, encoding: 'utf8' }).trim();
    git('init', '-q');
    mkdirSync(join(fixture, '.githooks'));
    writeFileSync(join(fixture, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n');
    const oldHook = join(fixture, '.git/hooks/pre-commit');
    mkdirSync(dirname(oldHook), { recursive: true });
    writeFileSync(oldHook, '#!/bin/sh\n# Existing owner hook\n');
    const install = () =>
      spawnSync(process.execPath, [resolve('scripts/install-hooks.mjs')], {
        cwd: fixture,
        encoding: 'utf8',
      });
    assert.notEqual(install().status, 0);
    assert.equal(
      readFileSync(oldHook, 'utf8'),
      '#!/bin/sh\n# Existing owner hook\n',
    );
    assert.notEqual(
      spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], {
        cwd: fixture,
      }).status,
      0,
    );
    git('config', '--local', 'core.hooksPath', 'owner-hooks');
    assert.notEqual(install().status, 0);
    assert.equal(
      git('config', '--local', '--get', 'core.hooksPath'),
      'owner-hooks',
    );
    assert.ok(existsSync(oldHook));
  } finally {
    const target = resolve(fixture);
    if (
      dirname(target) === temporaryRoot &&
      basename(target).startsWith('portfolio-hooks-test-')
    )
      rmSync(target, { recursive: true, force: true });
    else process.exitCode = 1;
  }
});
