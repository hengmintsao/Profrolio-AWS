import { execFileSync } from 'node:child_process';
import { prohibitedRepositoryPath } from './repository-policy.mjs';

const paths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const failures = [...new Set(paths)].filter(prohibitedRepositoryPath);
if (failures.length)
  throw new Error(
    `Local or sensitive files must not enter the repository:\n${failures.join('\n')}`,
  );
console.log(
  `Repository inclusion check passed (${new Set(paths).size} files).`,
);
