import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const npmCli = process.env.npm_execpath;
const run = (name) => {
  if (npmCli)
    execFileSync(process.execPath, [npmCli, 'run', name], { stdio: 'inherit' });
  else if (process.platform === 'win32')
    execFileSync('cmd.exe', ['/d', '/c', 'npm', 'run', name], {
      stdio: 'inherit',
      windowsHide: true,
    });
  else execFileSync('npm', ['run', name], { stdio: 'inherit' });
};
run('quality');
run('audit:dependencies');
const localActionlint = join(
  process.cwd(),
  '.scratch',
  'bin',
  process.platform === 'win32' ? 'actionlint.exe' : 'actionlint',
);
execFileSync(
  existsSync(localActionlint) ? localActionlint : 'actionlint',
  ['-shellcheck='],
  { stdio: 'inherit' },
);
execFileSync('git', ['diff', '--check'], { stdio: 'inherit' });
execFileSync('git', ['diff', '--cached', '--check'], { stdio: 'inherit' });
console.log(
  'Local preflight passed. SAM container builds and GitHub/environment protections still require their own evidence.',
);
