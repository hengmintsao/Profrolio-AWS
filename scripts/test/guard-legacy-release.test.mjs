import test from 'node:test';
import assert from 'node:assert/strict';
import {
  guardLegacyRelease,
  requireLegacyStack,
} from '../guard-legacy-release.mjs';

const describe = (parameters = []) => ({
  Stacks: [{ StackName: 'website', Parameters: parameters }],
});
const mode = (value) => [
  { ParameterKey: 'FrontendMode', ParameterValue: value },
];

test('legacy guard accepts only observed legacy or pre-mode existing stacks', () => {
  requireLegacyStack(describe(mode('legacy')), 'website');
  requireLegacyStack(
    describe([
      { ParameterKey: 'PrimaryDomainName', ParameterValue: 'henry-tsao.com' },
    ]),
    'website',
  );
  for (const value of ['cms', '', 'unknown'])
    assert.throws(() => requireLegacyStack(describe(mode(value)), 'website'));
});

test('legacy guard fails closed on missing, malformed, different, or ambiguous stacks', () => {
  for (const value of [
    null,
    {},
    { Stacks: [] },
    { Stacks: [{ StackName: 'other', Parameters: [] }] },
    { Stacks: [{ StackName: 'website' }] },
    describe([...mode('legacy'), ...mode('cms')]),
  ])
    assert.throws(() => requireLegacyStack(value, 'website'));
});

test('legacy guard propagates AWS and parse failures rather than inferring legacy', () => {
  const env = { STACK_NAME: 'website', AWS_REGION: 'us-east-1' };
  assert.throws(
    () =>
      guardLegacyRelease(env, () => {
        throw new Error('AccessDenied');
      }),
    /AccessDenied/,
  );
  assert.throws(() => guardLegacyRelease(env, () => 'invalid JSON'));
  assert.throws(() => guardLegacyRelease({}, () => JSON.stringify(describe())));
  guardLegacyRelease(env, (...args) => {
    assert.deepEqual(args, [
      'cloudformation',
      'describe-stacks',
      '--stack-name',
      'website',
      '--region',
      'us-east-1',
      '--output',
      'json',
    ]);
    return JSON.stringify(describe());
  });
});
