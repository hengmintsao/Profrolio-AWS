import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function requireLegacyStack(description, stackName) {
  const stacks = description?.Stacks;
  if (!Array.isArray(stacks) || stacks.length !== 1)
    throw new Error(
      'A successfully described existing website stack is required.',
    );
  const stack = stacks[0];
  if (stack.StackName !== stackName || !Array.isArray(stack.Parameters))
    throw new Error('Unexpected website stack identity or parameters.');
  const modes = stack.Parameters.filter(
    (p) => p.ParameterKey === 'FrontendMode',
  );
  if (
    modes.length > 1 ||
    (modes.length === 1 && modes[0].ParameterValue !== 'legacy')
  )
    throw new Error(
      'Legacy deployment is blocked: website is in CMS or unknown mode.',
    );
  // Older successfully described stacks predate FrontendMode and remain legacy.
}

export function guardLegacyRelease(
  environment = process.env,
  aws = (...args) => execFileSync('aws', args, { encoding: 'utf8' }),
) {
  const stack = environment.STACK_NAME;
  const region = environment.AWS_REGION;
  if (!stack || !region)
    throw new Error('STACK_NAME and AWS_REGION are required.');
  const response = aws(
    'cloudformation',
    'describe-stacks',
    '--stack-name',
    stack,
    '--region',
    region,
    '--output',
    'json',
  );
  requireLegacyStack(JSON.parse(response), stack);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  guardLegacyRelease();
}
