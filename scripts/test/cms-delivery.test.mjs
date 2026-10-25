import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import {
  artifactFiles,
  configuration,
  deliver,
  publicConfiguration,
  rejectUnsafeChanges,
  stackFingerprint,
  verifyArtifacts,
} from '../cms-delivery.mjs';

const source = 'a'.repeat(40);
const env = {
  DELIVERY_OPERATION: 'backend',
  SOURCE_SHA: source,
  RELEASE_TAG: 'v1.0.0',
  AWS_ACCOUNT_ID: '123456789012',
  AWS_REGION: 'us-east-1',
  CMS_STACK_NAME: 'cms-stack',
  SAM_STACK_NAME: 'website-stack',
  SAM_ARTIFACT_BUCKET: 'release-artifacts',
  COGNITO_DOMAIN_PREFIX: 'portfolio-owner',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
};
const outputs = (values) =>
  Object.entries(values).map(([OutputKey, OutputValue]) => ({
    OutputKey,
    OutputValue,
  }));
const parameters = (values) =>
  Object.entries(values).map(([ParameterKey, ParameterValue]) => ({
    ParameterKey,
    ParameterValue,
  }));
const website = {
  StackId: 'website-id',
  StackStatus: 'UPDATE_COMPLETE',
  Parameters: parameters({
    PrimaryDomainName: 'portfolio.example',
    FrontendMode: 'legacy',
    NotificationEmail: 'fixture@example.invalid',
  }),
  Outputs: outputs({
    FrontendBucketName: 'website-assets',
    DistributionId: 'DIST',
    ApiEndpoint: 'https://contact.example/contact',
  }),
};
const cms = {
  StackId: 'cms-id',
  StackStatus: 'UPDATE_COMPLETE',
  Parameters: parameters({
    PrimaryOrigin: 'https://portfolio.example',
    CognitoDomainPrefix: 'portfolio-owner',
    ReleaseSourceSha: source,
  }),
  Outputs: outputs({
    ApiBaseUrl: 'https://abc.execute-api.us-east-1.amazonaws.com',
    AuthDomain: 'https://owner.auth.us-east-1.amazoncognito.com',
    MediaBucketName: 'cms-media-assets',
    CognitoClientId: 'public-client',
    RedirectUri: 'https://portfolio.example/admin/callback',
    ReleaseSourceSha: source,
  }),
};
const change = {
  ChangeSetId:
    'arn:aws:cloudformation:us-east-1:123456789012:changeSet/review/id',
  StackName: 'cms-stack',
  Status: 'CREATE_COMPLETE',
  ExecutionStatus: 'AVAILABLE',
  Changes: [{ ResourceChange: { Action: 'Modify', Replacement: 'False' } }],
};

test('CMS configuration rejects wrong account, region, collisions and unaccepted cutover', () => {
  assert.equal(configuration(env).operation, 'backend');
  for (const patch of [
    { AWS_ACCOUNT_ID: '' },
    { AWS_REGION: 'eu-west-1' },
    { CMS_STACK_NAME: 'website-stack' },
    {
      DELIVERY_OPERATION: 'cutover',
      LIVE_ACCEPTANCE_URL: 'http://evidence.example',
    },
    { DELIVERY_OPERATION: 'cutover' },
  ])
    assert.throws(() => configuration({ ...env, ...patch }));
});

test('change sets reject deletion, uncertain replacement, unknown and unavailable execution', () => {
  rejectUnsafeChanges(change);
  for (const resource of [
    { Action: 'Remove' },
    { Action: 'Modify', Replacement: 'True' },
    { Action: 'Modify', Replacement: 'Conditional' },
    { Action: 'Modify' },
    { Action: 'Import' },
  ])
    assert.throws(() =>
      rejectUnsafeChanges({
        ...change,
        Changes: [{ ResourceChange: resource }],
      }),
    );
  assert.throws(() =>
    rejectUnsafeChanges({ ...change, ExecutionStatus: 'EXECUTE_COMPLETE' }),
  );
});

test('public runtime configuration comes from matching backend outputs and exact website origin', () => {
  assert.equal(
    publicConfiguration(cms, website, configuration(env)).localDevelopment,
    false,
  );
  assert.throws(() =>
    publicConfiguration(cms, website, {
      ...configuration(env),
      source: 'b'.repeat(40),
    }),
  );
  assert.throws(() =>
    publicConfiguration(
      {
        ...cms,
        Outputs: outputs({
          ...Object.fromEntries(
            cms.Outputs.map((x) => [x.OutputKey, x.OutputValue]),
          ),
          AuthDomain: 'https://attacker.example',
        }),
      },
      website,
      configuration(env),
    ),
  );
  assert.notEqual(
    stackFingerprint(cms),
    stackFingerprint({ ...cms, LastUpdatedTime: 'changed' }),
  );
});

function fixture() {
  const previous = process.cwd();
  const root = resolve(tmpdir());
  const directory = mkdtempSync(join(root, 'portfolio-delivery-test-'));
  process.chdir(directory);
  mkdirSync('frontend/js', { recursive: true });
  mkdirSync('web/dist', { recursive: true });
  writeFileSync('frontend/index.html', '<html>legacy fixture</html>');
  writeFileSync('web/dist/index.html', '<html>CMS fixture</html>');
  for (const name of artifactFiles) {
    const bytes = Buffer.from(`isolated ${name}`);
    writeFileSync(`${name}.tgz`, bytes);
    writeFileSync(
      `${name}.sha256`,
      `${createHash('sha256').update(bytes).digest('hex')}  ${name}.tgz\n`,
    );
  }
  return () => {
    process.chdir(previous);
    if (
      dirname(directory) !== root ||
      !basename(directory).startsWith('portfolio-delivery-test-')
    )
      throw Error('Unsafe fixture cleanup.');
    rmSync(directory, { recursive: true, force: true });
  };
}
function fakeRunner(initial = false, mode = null) {
  const calls = [];
  let liveCms = initial ? null : structuredClone(cms);
  const liveWebsite = structuredClone(website);
  if (mode === 'restore-legacy')
    liveWebsite.Parameters.find(
      (entry) => entry.ParameterKey === 'FrontendMode',
    ).ParameterValue = 'cms';
  let liveChange = {
    ...structuredClone(change),
    StackName: mode ? env.SAM_STACK_NAME : env.CMS_STACK_NAME,
  };
  let backupRevision = 'original';
  let boundaryPolicy = {
    Arn: `arn:aws:iam::${env.AWS_ACCOUNT_ID}:policy/PortfolioCmsRuntimeBoundary`,
    IsAttachable: true,
  };
  const run = (binary, args) => {
    calls.push([binary, ...args]);
    if (binary === 'tar')
      return args[0] === '-tzf'
        ? args[1].startsWith('deployment')
          ? 'frontend/index.html\n.aws-sam/build/template.yaml\n'
          : './\n./template.yaml\n'
        : args[0] === '-tvzf'
          ? '-rw-r--r-- fixture\n'
          : '';
    if (binary === 'sam') {
      writeFileSync('packaged-delivery.yaml', 'isolated packaged template');
      return '';
    }
    const [service, operation] = args;
    if (service === 'sts')
      return JSON.stringify({ Account: env.AWS_ACCOUNT_ID });
    if (service === 'iam' && operation === 'get-policy') {
      if (!boundaryPolicy)
        throw Error('NoSuchEntity: boundary policy is absent.');
      return JSON.stringify({ Policy: boundaryPolicy });
    }
    if (service === 's3api') {
      if (operation === 'get-bucket-location')
        return JSON.stringify({ LocationConstraint: null });
      if (operation === 'get-bucket-versioning')
        return JSON.stringify({ Status: 'Enabled' });
      if (operation === 'head-object')
        return JSON.stringify({
          VersionId: `${args[5]}-${backupRevision}`,
          ETag: 'fixture-etag',
        });
      return '{}';
    }
    if (service === 'cloudfront' && operation === 'create-invalidation')
      return JSON.stringify({ Invalidation: { Id: 'fixture-invalidation' } });
    if (operation === 'describe-stacks') {
      if (args[3] === env.CMS_STACK_NAME && !liveCms) {
        const error = Error('Missing disposable stack');
        error.stderr = 'ValidationError: Stack does not exist';
        throw error;
      }
      return JSON.stringify({
        Stacks: [args[3] === env.CMS_STACK_NAME ? liveCms : liveWebsite],
      });
    }
    if (operation === 'get-template-summary')
      return JSON.stringify({
        Parameters: (mode
          ? [
              'FrontendMode',
              'CmsApiOrigin',
              'CmsAuthOrigin',
              'CmsMediaOrigin',
              'PrimaryDomainName',
              'NotificationEmail',
            ]
          : [
              'PrimaryOrigin',
              'CognitoDomainPrefix',
              'ReleaseSourceSha',
              'RuntimePermissionsBoundaryArn',
            ]
        ).map((ParameterKey) => ({ ParameterKey })),
      });
    if (operation === 'create-change-set') {
      if (initial)
        liveCms = { StackId: 'cms-id', StackStatus: 'REVIEW_IN_PROGRESS' };
      return JSON.stringify({ Id: change.ChangeSetId });
    }
    if (operation === 'execute-change-set' && initial)
      liveCms = structuredClone(cms);
    if (operation === 'describe-change-set') return JSON.stringify(liveChange);
    return '{}';
  };
  return {
    run,
    calls,
    changeStack: () => {
      liveCms = { ...liveCms, LastUpdatedTime: 'external-change' };
    },
    replaceChange: () => {
      liveChange = {
        ...liveChange,
        Changes: [
          { ResourceChange: { Action: 'Modify', Replacement: 'Conditional' } },
        ],
      };
    },
    changeBackup: () => {
      backupRevision = 'external-change';
    },
    setCms: (stack) => {
      liveCms = stack;
    },
    setBoundary: (policy) => {
      boundaryPolicy = policy;
    },
  };
}

test('backend plan and apply bind same-run validated inputs without executing real AWS', async () => {
  const cleanup = fixture();
  try {
    const fake = fakeRunner();
    const plan = await deliver('plan', env, fake.run, () => source);
    assert.deepEqual(
      JSON.parse(readFileSync('delivery-parameters.json', 'utf8')).find(
        (entry) => entry.ParameterKey === 'RuntimePermissionsBoundaryArn',
      ),
      {
        ParameterKey: 'RuntimePermissionsBoundaryArn',
        ParameterValue: `arn:aws:iam::${env.AWS_ACCOUNT_ID}:policy/PortfolioCmsRuntimeBoundary`,
      },
    );
    assert.equal(
      plan.config.runtimeBoundaryArn,
      `arn:aws:iam::${env.AWS_ACCOUNT_ID}:policy/PortfolioCmsRuntimeBoundary`,
    );
    const PLAN_SHA256 = readFileSync('delivery-plan.sha256', 'utf8').trim();
    const result = await deliver(
      'apply',
      { ...env, PLAN_SHA256 },
      fake.run,
      () => source,
      async () => ({ status: 200, text: async () => '{"items":[]}' }),
    );
    assert.equal(plan.target, env.CMS_STACK_NAME);
    assert.equal(result.status, 'pipeline-complete-live-acceptance-required');
    assert.ok(fake.calls.some((args) => args[2] === 'execute-change-set'));
    assert.equal(
      fake.calls.some((args) => args[1] === 's3'),
      false,
      'Backend operation must not publish the website.',
    );
  } finally {
    cleanup();
  }
});

test('initial backend CREATE accepts its reviewed placeholder without assuming outputs exist', async () => {
  const cleanup = fixture();
  try {
    const fake = fakeRunner(true);
    const plan = await deliver('plan', env, fake.run, () => source);
    assert.equal(plan.changeSetType, 'CREATE');
    assert.equal(
      JSON.parse(readFileSync('delivery-parameters.json', 'utf8')).find(
        (entry) => entry.ParameterKey === 'RuntimePermissionsBoundaryArn',
      ).ParameterValue,
      `arn:aws:iam::${env.AWS_ACCOUNT_ID}:policy/PortfolioCmsRuntimeBoundary`,
    );
    const result = await deliver(
      'apply',
      {
        ...env,
        PLAN_SHA256: readFileSync('delivery-plan.sha256', 'utf8').trim(),
      },
      fake.run,
      () => source,
      async () => ({ status: 200, text: async () => '{"items":[]}' }),
    );
    assert.equal(result.publicConfiguration.localDevelopment, false);
    assert.ok(
      fake.calls.some(
        (args) => args[2] === 'wait' && args[3] === 'stack-create-complete',
      ),
    );
  } finally {
    cleanup();
  }
});

test('apply refuses stale stacks, moved source and a modified manifest before execution', async () => {
  const cleanup = fixture();
  try {
    const fake = fakeRunner();
    await deliver('plan', env, fake.run, () => source);
    const applyEnv = {
      ...env,
      PLAN_SHA256: readFileSync('delivery-plan.sha256', 'utf8').trim(),
    };
    await assert.rejects(
      deliver('apply', applyEnv, fake.run, () => 'b'.repeat(40)),
      /moved/,
    );
    fake.changeStack();
    await assert.rejects(
      deliver('apply', applyEnv, fake.run, () => source),
      /changed/,
    );
    writeFileSync('delivery-plan.json', '{}');
    await assert.rejects(
      deliver('apply', applyEnv, fake.run, () => source),
      /checksum/,
    );
    assert.equal(
      fake.calls.some((args) => args[2] === 'execute-change-set'),
      false,
    );
  } finally {
    cleanup();
  }
});

test('artifact checksum and escaping members fail before AWS authentication', () => {
  const cleanup = fixture();
  try {
    assert.throws(() => verifyArtifacts(() => '../escape\n'), /paths/);
    writeFileSync('deployment-inputs.tgz', 'tampered');
    assert.throws(() => verifyArtifacts(() => ''), /checksum/);
  } finally {
    cleanup();
  }
});

test('backend boundary lookup fails closed before plan or apply writes when absent, mismatched or not attachable', async () => {
  const expectedArn = `arn:aws:iam::${env.AWS_ACCOUNT_ID}:policy/PortfolioCmsRuntimeBoundary`;
  for (const phase of ['plan', 'apply']) {
    for (const policy of [
      null,
      {
        Arn: expectedArn.replace(env.AWS_ACCOUNT_ID, '999999999999'),
        IsAttachable: true,
      },
      { Arn: expectedArn, IsAttachable: false },
      { Arn: expectedArn },
    ]) {
      const cleanup = fixture();
      try {
        const fake = fakeRunner();
        const operationEnv = { ...env };
        if (phase === 'apply') {
          await deliver('plan', operationEnv, fake.run, () => source);
          operationEnv.PLAN_SHA256 = readFileSync(
            'delivery-plan.sha256',
            'utf8',
          ).trim();
        }
        fake.calls.length = 0;
        fake.setBoundary(policy);
        await assert.rejects(
          deliver(phase, operationEnv, fake.run, () => source),
          /boundary/,
        );
        assert.ok(
          fake.calls.some(
            (args) =>
              args[1] === 'iam' &&
              args[2] === 'get-policy' &&
              args[4] === expectedArn,
          ),
        );
        assert.equal(
          fake.calls.some(
            (args) =>
              args[0] === 'sam' ||
              ['create-change-set', 'execute-change-set'].includes(args[2]) ||
              args[1] === 's3',
          ),
          false,
          'A failed boundary prerequisite must not package, mutate CloudFormation or publish files.',
        );
      } finally {
        cleanup();
      }
    }
  }
});

test('backend verifies the caller account before reading the account-derived boundary', async () => {
  const cleanup = fixture();
  try {
    const fake = fakeRunner();
    const run = (binary, args) => {
      if (binary === 'aws' && args[0] === 'sts')
        return JSON.stringify({ Account: '999999999999' });
      return fake.run(binary, args);
    };
    await assert.rejects(
      deliver('plan', env, run, () => source),
      /account mismatch/,
    );
    assert.equal(
      fake.calls.some(
        (args) =>
          args[1] === 'iam' ||
          args[0] === 'sam' ||
          args[1] === 'cloudformation',
      ),
      false,
    );
  } finally {
    cleanup();
  }
});

for (const mode of ['cutover', 'restore-legacy']) {
  test(`${mode} preserves parameters and backups, publishes config then index after assets without deletes`, async () => {
    const cleanup = fixture();
    try {
      const fake = fakeRunner(false, mode);
      const operationEnv = {
        ...env,
        DELIVERY_OPERATION: mode,
        LIVE_ACCEPTANCE_URL:
          mode === 'cutover'
            ? 'https://github.com/hengmintsao/Profrolio-AWS/issues/123'
            : '',
      };
      const plan = await deliver('plan', operationEnv, fake.run, () => source);
      assert.equal(plan.target, env.SAM_STACK_NAME);
      assert.deepEqual(
        plan.backup.map((item) => item.key),
        mode === 'cutover'
          ? ['index.html', 'js/config.js']
          : ['index.html', 'config.js'],
      );
      const plannedParameters = JSON.parse(
        readFileSync('delivery-parameters.json', 'utf8'),
      );
      assert.deepEqual(
        plannedParameters.find(
          (item) => item.ParameterKey === 'NotificationEmail',
        ),
        { ParameterKey: 'NotificationEmail', UsePreviousValue: true },
      );
      assert.equal(
        plannedParameters.find((item) => item.ParameterKey === 'FrontendMode')
          .ParameterValue,
        mode === 'cutover' ? 'cms' : 'legacy',
      );
      const requests = [];
      const directory = mode === 'cutover' ? 'web/dist' : 'frontend';
      const key = mode === 'cutover' ? 'config.js' : 'js/config.js';
      await deliver(
        'apply',
        {
          ...operationEnv,
          PLAN_SHA256: readFileSync('delivery-plan.sha256', 'utf8').trim(),
        },
        fake.run,
        () => source,
        async (url) => {
          requests.push(url);
          if (url.includes('/assets/delivery-missing-'))
            return { status: 404, text: async () => 'missing' };
          return {
            status: 200,
            text: async () =>
              readFileSync(
                url.endsWith(`/${key}`)
                  ? `${directory}/${key}`
                  : `${directory}/index.html`,
                'utf8',
              ),
          };
        },
      );
      const uploads = fake.calls.filter(
        (args) => args[0] === 'aws' && args[1] === 's3',
      );
      assert.deepEqual(
        uploads.map((args) => args[2]),
        ['sync', 'cp', 'cp'],
      );
      assert.equal(uploads[0][3], `${directory}/`);
      assert.equal(uploads[1][3], `${directory}/${key}`);
      assert.equal(uploads[2][3], `${directory}/index.html`);
      assert.equal(
        uploads.some((args) => args.includes('--delete')),
        false,
      );
      assert.ok(
        uploads.every(
          (args) =>
            args.includes('no-store') &&
            args.some((arg) => arg.startsWith('s3://website-assets/')),
        ),
      );
      assert.equal(
        fake.calls.some((args) => args[1] === 'iam'),
        false,
        'Frontend-only operations do not require a runtime-boundary lookup.',
      );
      assert.ok(
        fake.calls.some(
          (args) =>
            args[1] === 'cloudfront' && args[3] === 'distribution-deployed',
        ),
      );
      assert.ok(
        fake.calls.some(
          (args) =>
            args[1] === 'cloudfront' && args[3] === 'invalidation-completed',
        ),
      );
      assert.ok(requests.includes('https://portfolio.example/'));
      assert.ok(requests.includes(`https://portfolio.example/${key}`));
      assert.ok(
        requests.some((url) => url.includes('/assets/delivery-missing-')),
      );
      if (mode === 'cutover')
        assert.ok(
          requests.includes('https://portfolio.example/admin/callback') &&
            requests.includes('https://portfolio.example/projects'),
        );
      const runtime = readFileSync(`${directory}/${key}`, 'utf8');
      assert.match(
        runtime,
        mode === 'cutover' ? /window.PORTFOLIO_CONFIG/ : /window.APP_CONFIG/,
      );
      assert.equal(runtime.includes('local-owner'), false);
      assert.match(runtime, /https:\/\/contact.example\/contact/);
    } finally {
      cleanup();
    }
  });
}

test('live replacements or a changed frontend backup reject apply before any execution or upload', async () => {
  for (const failure of ['replacement', 'backup']) {
    const cleanup = fixture();
    try {
      const fake = fakeRunner(false, 'cutover');
      const operationEnv = {
        ...env,
        DELIVERY_OPERATION: 'cutover',
        LIVE_ACCEPTANCE_URL:
          'https://github.com/hengmintsao/Profrolio-AWS/actions/runs/123',
      };
      await deliver('plan', operationEnv, fake.run, () => source);
      if (failure === 'replacement') fake.replaceChange();
      else fake.changeBackup();
      await assert.rejects(
        deliver(
          'apply',
          {
            ...operationEnv,
            PLAN_SHA256: readFileSync('delivery-plan.sha256', 'utf8').trim(),
          },
          fake.run,
          () => source,
        ),
        failure === 'replacement' ? /replacements/ : /Frontend changed/,
      );
      assert.equal(
        fake.calls.some(
          (args) => args[2] === 'execute-change-set' || args[1] === 's3',
        ),
        false,
      );
    } finally {
      cleanup();
    }
  }
});

test('post-apply smoke rejects malformed backend data, stale HTML and missing-asset rewrites', async () => {
  for (const failure of ['backend-contract', 'stale-index', 'asset-rewrite']) {
    const cleanup = fixture();
    try {
      const mode = failure === 'backend-contract' ? null : 'cutover';
      const fake = fakeRunner(false, mode);
      const operationEnv = {
        ...env,
        DELIVERY_OPERATION: mode || 'backend',
        LIVE_ACCEPTANCE_URL: mode
          ? 'https://github.com/hengmintsao/Profrolio-AWS/issues/123'
          : '',
      };
      await deliver('plan', operationEnv, fake.run, () => source);
      const request = async (url) => ({
        status: 200,
        text: async () =>
          failure === 'backend-contract'
            ? '{}'
            : failure === 'stale-index'
              ? '<html>old deployment</html>'
              : readFileSync(
                  url.endsWith('/config.js')
                    ? 'web/dist/config.js'
                    : 'web/dist/index.html',
                  'utf8',
                ),
      });
      await assert.rejects(
        deliver(
          'apply',
          {
            ...operationEnv,
            PLAN_SHA256: readFileSync('delivery-plan.sha256', 'utf8').trim(),
          },
          fake.run,
          () => source,
          request,
        ),
        failure === 'backend-contract'
          ? /contract/
          : failure === 'stale-index'
            ? /index/
            : /Missing assets/,
      );
      assert.equal(
        JSON.parse(readFileSync('delivery-result.json', 'utf8')).status,
        'started',
        'A failed smoke must never claim a completed delivery.',
      );
    } finally {
      cleanup();
    }
  }
});

const recoveryArn = `arn:aws:cloudformation:us-east-1:${env.AWS_ACCOUNT_ID}:changeSet/cms-backend-100-1/old-id`;
function recoveryFixture(patch = {}, events = null) {
  const fake = fakeRunner(true);
  fake.setCms({ StackId: 'cms-id', StackStatus: 'REVIEW_IN_PROGRESS' });
  const failed = {
    ChangeSetId: recoveryArn,
    ChangeSetName: 'cms-backend-100-1',
    StackId: 'cms-id',
    StackName: env.CMS_STACK_NAME,
    Status: 'FAILED',
    ExecutionStatus: 'UNAVAILABLE',
    Changes: [],
    Description: `backend ${source} run 100/1`,
    ...patch,
  };
  const run = (binary, args) => {
    if (
      binary === 'aws' &&
      args[1] === 'describe-change-set' &&
      args.includes(recoveryArn)
    ) {
      fake.calls.push([binary, ...args]);
      return JSON.stringify(failed);
    }
    if (binary === 'aws' && args[1] === 'describe-stack-events') {
      fake.calls.push([binary, ...args]);
      return JSON.stringify({
        StackEvents: events ?? [
          {
            StackId: 'cms-id',
            PhysicalResourceId: 'cms-id',
            LogicalResourceId: env.CMS_STACK_NAME,
            ResourceType: 'AWS::CloudFormation::Stack',
            ResourceStatus: 'REVIEW_IN_PROGRESS',
          },
        ],
      });
    }
    return fake.run(binary, args);
  };
  return { ...fake, run };
}

test('explicit failed initial plan recovery creates a new CREATE plan without deleting or executing', async () => {
  const cleanup = fixture();
  try {
    const fake = recoveryFixture();
    const plan = await deliver(
      'plan',
      { ...env, RECOVER_CHANGE_SET_ARN: recoveryArn },
      fake.run,
      () => source,
    );
    assert.equal(plan.changeSetType, 'CREATE');
    const create = fake.calls.find((call) => call[2] === 'create-change-set');
    assert.equal(create[create.indexOf('--change-set-type') + 1], 'CREATE');
    assert.equal(
      fake.calls.some((call) =>
        ['delete-stack', 'delete-change-set', 'execute-change-set'].includes(
          call[2],
        ),
      ),
      false,
    );
    await deliver(
      'apply',
      {
        ...env,
        RECOVER_CHANGE_SET_ARN: recoveryArn,
        PLAN_SHA256: readFileSync('delivery-plan.sha256', 'utf8').trim(),
      },
      fake.run,
      () => source,
      async () => ({ status: 200, text: async () => '{"items":[]}' }),
    );
  } finally {
    cleanup();
  }
});

test('placeholder recovery rejects missing consent, executable plans, foreign stacks and resource activity before packaging', async () => {
  for (const [patch, events, consent] of [
    [{}, null, ''],
    [
      { Status: 'CREATE_COMPLETE', ExecutionStatus: 'AVAILABLE' },
      null,
      recoveryArn,
    ],
    [{ StackId: 'foreign' }, null, recoveryArn],
    [{ ChangeSetName: 'foreign' }, null, recoveryArn],
    [{ NextToken: 'more-pages' }, null, recoveryArn],
    [{ Changes: [{ ResourceChange: { Action: 'Add' } }] }, null, recoveryArn],
    [{ Description: 'manual unrelated plan' }, null, recoveryArn],
    [{}, [], recoveryArn],
    [
      {},
      [
        {
          StackId: 'cms-id',
          PhysicalResourceId: 'table',
          ResourceType: 'AWS::DynamoDB::Table',
          ResourceStatus: 'CREATE_COMPLETE',
        },
      ],
      recoveryArn,
    ],
  ]) {
    const cleanup = fixture();
    try {
      const fake = recoveryFixture(patch, events);
      await assert.rejects(
        deliver(
          'plan',
          { ...env, RECOVER_CHANGE_SET_ARN: consent },
          fake.run,
          () => source,
        ),
      );
      assert.equal(
        fake.calls.some(
          (call) =>
            call[0] === 'sam' ||
            ['create-change-set', 'execute-change-set'].includes(call[2]),
        ),
        false,
      );
    } finally {
      cleanup();
    }
  }
});

test('recovery input rejects foreign ARNs and non-backend operations before AWS calls', () => {
  for (const patch of [
    {
      RECOVER_CHANGE_SET_ARN: recoveryArn.replace(
        env.AWS_ACCOUNT_ID,
        '999999999999',
      ),
    },
    { RECOVER_CHANGE_SET_ARN: recoveryArn.replace('us-east-1', 'eu-west-1') },
    { RECOVER_CHANGE_SET_ARN: 'cms-backend-100-1' },
    {
      RECOVER_CHANGE_SET_ARN: recoveryArn,
      DELIVERY_OPERATION: 'restore-legacy',
    },
  ])
    assert.throws(() => configuration({ ...env, ...patch }), /Recovery/);
});

test('recovery input cannot bypass normal absent or stable stack handling', async () => {
  for (const initial of [true, false]) {
    const cleanup = fixture();
    try {
      const fake = fakeRunner(initial);
      await assert.rejects(
        deliver(
          'plan',
          { ...env, RECOVER_CHANGE_SET_ARN: recoveryArn },
          fake.run,
          () => source,
        ),
        /placeholder/,
      );
      assert.equal(
        fake.calls.some((call) => call[0] === 'sam'),
        false,
      );
    } finally {
      cleanup();
    }
  }
});

test('recovery rejects incomplete history, unreadable events and a placeholder changed during packaging', async () => {
  for (const failure of ['pagination', 'access-denied', 'changed-stack']) {
    const cleanup = fixture();
    try {
      const fake = recoveryFixture();
      const run = (binary, args) => {
        if (binary === 'aws' && args[1] === 'describe-stack-events') {
          if (failure === 'access-denied')
            throw Error('AccessDenied: fixture events');
          if (failure === 'pagination')
            return JSON.stringify({
              ...JSON.parse(fake.run(binary, args)),
              NextToken: 'unread-page',
            });
        }
        const result = fake.run(binary, args);
        if (binary === 'sam' && failure === 'changed-stack') fake.changeStack();
        return result;
      };
      await assert.rejects(
        deliver(
          'plan',
          { ...env, RECOVER_CHANGE_SET_ARN: recoveryArn },
          run,
          () => source,
        ),
        failure === 'pagination'
          ? /history/
          : failure === 'access-denied'
            ? /AccessDenied/
            : /changed during recovery/,
      );
      assert.equal(
        fake.calls.some((call) =>
          ['create-change-set', 'execute-change-set'].includes(call[2]),
        ),
        false,
      );
    } finally {
      cleanup();
    }
  }
});
