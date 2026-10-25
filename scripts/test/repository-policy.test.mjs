import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { prohibitedRepositoryPath } from '../repository-policy.mjs';

test('Git ignores secret variants and local settings while allowing clean templates', () => {
  for (const path of [
    '.env',
    'web/.env.production',
    'backend/.env.local',
    '.codex/agents/release_engineer.toml',
    '.agents/skills/example/SKILL.md',
    '.aws/credentials',
    'docs/reports/task/summary.md',
    'private.pem',
  ]) {
    assert.equal(
      spawnSync('git', ['check-ignore', '--no-index', '-q', path]).status,
      0,
      path,
    );
  }
  for (const path of [
    '.env.example',
    'backend/.env.template',
    'infrastructure/samconfig.toml.example',
    'docs/agents/team.md',
  ]) {
    assert.equal(
      spawnSync('git', ['check-ignore', '--no-index', '-q', path]).status,
      1,
      path,
    );
  }
});

test('repository policy rejects nested secrets and local assistant artifacts even when force-added', () => {
  for (const path of [
    '.env',
    'web/.env.production',
    'backend/.env.local',
    '.aws/credentials',
    '.codex/agents/release_engineer.toml',
    '.agents/skills/example/SKILL.md',
    'docs/reports/task/summary.md',
    'private/key.pem',
    'certificate.pfx',
    'infrastructure/samconfig.toml',
    'debug.log',
    '.aws-sam/build/template.yaml',
    '.aws-sam-cms/build/template.yaml',
    'coverage/lcov.info',
    'web/dist/index.html',
    'web/.vite/cache.json',
    '.local-cms/data.json',
  ])
    assert.equal(prohibitedRepositoryPath(path), true, path);
});

test('repository policy retains project tooling and reviewed template files', () => {
  for (const path of [
    '.github/workflows/ci.yml',
    'AGENTS.md',
    'docs/agents/team.md',
    'backend/.env.example',
    '.env.template',
    'infrastructure/samconfig.toml.example',
    'package-lock.json',
    'web/public/config.js',
  ])
    assert.equal(prohibitedRepositoryPath(path), false, path);
});
