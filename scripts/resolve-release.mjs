import { appendFileSync } from 'node:fs';
import { resolveRelease } from './release-policy.mjs';

const sha = resolveRelease(process.env.RELEASE_TAG);
if (process.env.EXPECTED_SHA && sha !== process.env.EXPECTED_SHA)
  throw new Error('Release tag moved.');
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `source_sha=${sha}\n`);
console.log(`Validated release source: ${sha}`);
