import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const localBinary = join(
  process.cwd(),
  '.scratch',
  'bin',
  process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks',
);
const binary = existsSync(localBinary) ? localBinary : 'gitleaks';
const temporaryRoot = resolve(tmpdir());
const temporary = mkdtempSync(join(temporaryRoot, 'portfolio-secret-scan-'));
try {
  const config = join(temporary, 'rules.toml');
  writeFileSync(config, '[extend]\nuseDefault = true\n');
  const flags = [
    '--config',
    config,
    '--gitleaks-ignore-path',
    temporary,
    '--redact',
    '--ignore-gitleaks-allow',
    '--no-banner',
    '--timeout',
    '120',
  ];
  execFileSync(binary, ['git', '.', '--log-opts=--all', ...flags], {
    stdio: 'inherit',
  });
  const snapshot = join(temporary, 'candidate');
  mkdirSync(snapshot);
  const paths = new Set(
    execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean),
  );
  for (const path of paths) {
    const source = resolve(path);
    if (!existsSync(source)) continue;
    if (lstatSync(source).isSymbolicLink())
      throw new Error(`Review symlink before scanning: ${path}`);
    const target = resolve(snapshot, path);
    if (
      !target.startsWith(snapshot + (process.platform === 'win32' ? '\\' : '/'))
    )
      throw new Error('Unsafe scan path.');
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
  execFileSync(binary, ['dir', snapshot, ...flags], { stdio: 'inherit' });
  const indexSnapshot = join(temporary, 'index');
  mkdirSync(indexSnapshot);
  const entries = execFileSync('git', ['ls-files', '--stage', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  for (const entry of entries) {
    const match = /^(\d+) ([a-f0-9]+) ([0-3])\t(.+)$/s.exec(entry);
    if (!match || match[3] !== '0' || match[1] === '120000')
      throw new Error(
        'Resolve index conflicts and review symlinks before scanning.',
      );
    const target = resolve(indexSnapshot, match[4]);
    if (
      !target.startsWith(
        indexSnapshot + (process.platform === 'win32' ? '\\' : '/'),
      )
    )
      throw new Error('Unsafe index scan path.');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      execFileSync('git', ['cat-file', 'blob', match[2]], {
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
  }
  execFileSync(binary, ['dir', indexSnapshot, ...flags], { stdio: 'inherit' });
  console.log(
    `Secret scan passed: available Git history, ${paths.size} candidate paths, and ${entries.length} index entries.`,
  );
} finally {
  const target = resolve(temporary);
  if (
    dirname(target) !== temporaryRoot ||
    !basename(target).startsWith('portfolio-secret-scan-')
  ) {
    console.error('Unsafe temporary cleanup path; cleanup refused.');
    process.exitCode = 1;
  } else {
    rmSync(target, { recursive: true, force: true });
  }
}
