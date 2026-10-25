import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import test from 'node:test';

test('scanner rejects a secret staged in Git even when the working file is clean', () => {
  const temporaryRoot = resolve(tmpdir());
  const fixture = mkdtempSync(join(temporaryRoot, 'portfolio-index-test-'));
  try {
    const git = (...args) =>
      execFileSync('git', args, { cwd: fixture, stdio: 'pipe' });
    git('init', '-q');
    writeFileSync(join(fixture, 'app.js'), '// Clean fixture\n');
    git('add', 'app.js');
    git(
      '-c',
      `core.hooksPath=${join(fixture, 'unused-hooks')}`,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'Disposable clean fixture',
    );
    const synthetic = ['gh', 'p_'].join('') + randomBytes(18).toString('hex');
    writeFileSync(join(fixture, 'app.js'), `const token = "${synthetic}";\n`);
    git('add', 'app.js');
    writeFileSync(join(fixture, 'app.js'), '// Clean fixture\n');
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/scan-secrets.mjs')],
      {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          PATH:
            join(process.cwd(), '.scratch', 'bin') +
            delimiter +
            process.env.PATH,
        },
      },
    );
    assert.equal(
      result.status,
      1,
      'The staged synthetic token must block publication.',
    );
    const output = result.stdout + result.stderr;
    assert.equal(
      output.includes(synthetic),
      false,
      'Scanner output must redact token values.',
    );
    assert.ok(
      (output.match(/no leaks found/g) ?? []).length >= 2,
      'History and clean working tree must pass before the index fails.',
    );
  } finally {
    const target = resolve(fixture);
    if (
      dirname(target) === temporaryRoot &&
      basename(target).startsWith('portfolio-index-test-')
    )
      rmSync(target, { recursive: true, force: true });
    else process.exitCode = 1;
  }
});
