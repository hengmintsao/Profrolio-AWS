import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { validateVersions } from './release-policy.mjs';

const packages = ['', 'web/', 'backend/'].flatMap((prefix) => {
  const pkg = JSON.parse(readFileSync(`${prefix}package.json`, 'utf8'));
  const lock = JSON.parse(readFileSync(`${prefix}package-lock.json`, 'utf8'));
  return [pkg, lock, lock.packages['']];
});
validateVersions(packages);
const workflows = Object.fromEntries(
  readdirSync('.github/workflows')
    .filter((name) => name.endsWith('.yml'))
    .map((name) => [
      name,
      parse(readFileSync(`.github/workflows/${name}`, 'utf8'), {
        uniqueKeys: true,
      }),
    ]),
);
for (const workflow of Object.values(workflows)) {
  for (const job of Object.values(workflow.jobs)) {
    if (job['runs-on'] && !job['timeout-minutes'])
      throw new Error('Every runner job needs a timeout.');
    for (const step of job.steps ?? []) {
      if (step.uses && !/@[a-f0-9]{40}$/.test(step.uses))
        throw new Error(`Unpinned action: ${step.uses}`);
    }
  }
}
const ci = workflows['ci.yml'];
const deploy = workflows['deploy.yml'];
if (deploy.on.push || !deploy.on.workflow_dispatch?.inputs?.release_tag)
  throw new Error('Production releases must use manual version selection.');
if (!ci.jobs['release-readiness'].needs.includes('application-checks'))
  throw new Error('Application checks must gate release readiness.');
if (!deploy.jobs.deploy.needs.includes('checks'))
  throw new Error('Deployment must wait for complete CI.');
console.log('Release versions and workflow controls passed.');
