import { execFileSync } from 'node:child_process';

export function requireSuccessfulJobs(results, expected) {
  const jobs = Object.entries(results);
  if (
    jobs.length !== expected.length ||
    expected.some((name) => results[name]?.result !== 'success')
  ) {
    throw new Error(
      'Required checks failed, were cancelled, skipped, or missing.',
    );
  }
}

export function validateVersions(packages, expected) {
  const version = packages[0]?.version;
  if (
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version ?? '') ||
    packages.some((p) => p.version !== version)
  ) {
    throw new Error(
      'All package and lock versions must agree on a stable version.',
    );
  }
  if (expected && expected !== `v${version}`)
    throw new Error('Tag and package versions differ.');
  return version;
}

export function resolveRelease(
  tag,
  git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim(),
) {
  if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(tag ?? ''))
    throw new Error('Expected vX.Y.Z release tag.');
  const ref = `refs/tags/${tag}`;
  if (git('cat-file', '-t', ref) !== 'tag')
    throw new Error('An annotated tag is required.');
  const sha = git('rev-parse', `${ref}^{commit}`);
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid source SHA.');
  git('merge-base', '--is-ancestor', sha, 'origin/main');
  const packages = ['', 'web/', 'backend/'].flatMap((prefix) => {
    const pkg = JSON.parse(git('show', `${sha}:${prefix}package.json`));
    const lock = JSON.parse(git('show', `${sha}:${prefix}package-lock.json`));
    return [pkg, lock, lock.packages['']];
  });
  validateVersions(packages, tag);
  return sha;
}
