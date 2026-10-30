import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { posix } from 'node:path';
import { resolveRelease } from './release-policy.mjs';

export const artifactFiles = ['deployment-inputs', 'cms-backend', 'cms-web'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const jsonFile = (path) => JSON.parse(readFileSync(path, 'utf8'));
const command = (binary, args) =>
  execFileSync(binary, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

export function configuration(env) {
  const value = {
    operation: env.DELIVERY_OPERATION,
    source: env.SOURCE_SHA,
    tag: env.RELEASE_TAG,
    account: env.AWS_ACCOUNT_ID,
    region: env.AWS_REGION,
    cmsStack: env.CMS_STACK_NAME,
    websiteStack: env.SAM_STACK_NAME,
    artifactBucket: env.SAM_ARTIFACT_BUCKET,
    domainPrefix: env.COGNITO_DOMAIN_PREFIX,
    acceptance: env.LIVE_ACCEPTANCE_URL || '',
    recoveryChangeSet: env.RECOVER_CHANGE_SET_ARN || '',
    run: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
  };
  if (!['backend', 'cutover', 'restore-legacy'].includes(value.operation))
    throw Error('Invalid delivery operation.');
  if (!/^[a-f0-9]{40}$/.test(value.source || ''))
    throw Error('Invalid source SHA.');
  if (!/^\d{12}$/.test(value.account || '') || value.region !== 'us-east-1')
    throw Error('An explicit AWS account and us-east-1 are required.');
  value.runtimeBoundaryArn = `arn:aws:iam::${value.account}:policy/PortfolioCmsRuntimeBoundary`;
  for (const stack of [value.cmsStack, value.websiteStack])
    if (!/^[A-Za-z][A-Za-z0-9-]{0,127}$/.test(stack || ''))
      throw Error('Explicit valid stack names are required.');
  if (value.cmsStack === value.websiteStack)
    throw Error('Stack names must differ.');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value.artifactBucket || ''))
    throw Error('An existing artifact bucket is required.');
  if (!/^\d+$/.test(value.run || '') || !/^\d+$/.test(value.attempt || ''))
    throw Error('Run identity is required.');
  if (
    value.operation === 'backend' &&
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value.domainPrefix || '')
  )
    throw Error('An explicit Cognito domain prefix is required.');
  if (
    value.recoveryChangeSet &&
    (value.operation !== 'backend' ||
      !new RegExp(
        `^arn:aws:cloudformation:${value.region}:${value.account}:changeSet/cms-backend-[0-9]+-[0-9]+/[A-Za-z0-9-]+$`,
      ).test(value.recoveryChangeSet))
  )
    throw Error(
      'Recovery requires an exact account-scoped backend change-set ARN.',
    );
  if (value.operation === 'cutover') {
    if (
      !/^https:\/\/github\.com\/hengmintsao\/Profrolio-AWS\/(?:issues|actions\/runs)\/\d+$/.test(
        value.acceptance,
      )
    )
      throw Error(
        "Use this repository's issue or Actions run URL without query strings or fragments for acceptance evidence.",
      );
  }
  return value;
}

export function verifyArtifacts(run = command) {
  const hashes = {};
  for (const name of artifactFiles) {
    const archive = `${name}.tgz`;
    const expected = readFileSync(`${name}.sha256`, 'utf8').trim();
    const match = /^([a-f0-9]{64})\s+\*?([^\s]+)$/.exec(expected);
    if (!match || match[2] !== archive)
      throw Error('Invalid artifact checksum record.');
    hashes[name] = sha256(readFileSync(archive));
    if (hashes[name] !== match[1]) throw Error('Artifact checksum mismatch.');
    const entries = run('tar', ['-tzf', archive]).split('\n').filter(Boolean);
    if (
      !entries.length ||
      entries.some((entry) => {
        const path = entry.replace(/^\.\//, '').replace(/\/$/, '');
        if (
          path.startsWith('/') ||
          path.includes('\\') ||
          path.split('/').includes('..')
        )
          return true;
        return name !== 'deployment-inputs'
          ? false
          : !['.aws-sam/build', 'frontend'].some(
              (base) => path === base || path.startsWith(`${base}/`),
            );
      })
    )
      throw Error('Unexpected artifact paths.');
    // SAM dependencies can contain relative node_modules/.bin symlinks.
    for (const line of run('tar', ['-tvzf', archive])
      .split('\n')
      .filter(Boolean)) {
      if (['-', 'd'].includes(line[0])) continue;
      const link = /\s(\S+) -> (\S+)$/.exec(line);
      if (
        line[0] !== 'l' ||
        !link ||
        posix.isAbsolute(link[2]) ||
        link[2].includes('\\')
      )
        throw Error('Unsupported artifact link or special entry.');
      const target = posix.normalize(
        posix.join(posix.dirname(link[1]), link[2]),
      );
      if (
        target === '..' ||
        target.startsWith('../') ||
        posix.isAbsolute(target)
      )
        throw Error('Artifact symlink escapes its root.');
    }
    const destination =
      name === 'cms-backend'
        ? '.aws-sam-cms/build'
        : name === 'cms-web'
          ? 'web/dist'
          : '.';
    mkdirSync(destination, { recursive: true });
    run('tar', ['-xzf', archive, '-C', destination]);
  }
  return hashes;
}

export function rejectUnsafeChanges(changeSet) {
  if (
    changeSet.Status !== 'CREATE_COMPLETE' ||
    changeSet.ExecutionStatus !== 'AVAILABLE'
  )
    throw Error('Change set is not available for execution.');
  for (const change of changeSet.Changes || []) {
    const resource = change.ResourceChange;
    if (
      !resource ||
      !['Add', 'Modify'].includes(resource.Action) ||
      (resource.Action === 'Modify' && resource.Replacement !== 'False')
    )
      throw Error(
        'Removals, replacements, and unknown changes require a separate reviewed migration.',
      );
  }
}

export function stackFingerprint(stack) {
  if (!stack) return null;
  return sha256(
    JSON.stringify({
      id: stack.StackId,
      status: stack.StackStatus,
      created: stack.CreationTime,
      updated: stack.LastUpdatedTime,
      parameters: stack.Parameters,
      outputs: stack.Outputs,
    }),
  );
}

function output(stack, name) {
  const value = stack?.Outputs?.find(
    (entry) => entry.OutputKey === name,
  )?.OutputValue;
  if (!value) throw Error(`Missing stack output: ${name}`);
  return value;
}
function parameter(stack, name) {
  return stack?.Parameters?.find((entry) => entry.ParameterKey === name)
    ?.ParameterValue;
}
function https(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error('Invalid public HTTPS URL.');
  return url;
}
export function publicConfiguration(cms, website, config) {
  const api = output(cms, 'ApiBaseUrl');
  const auth = output(cms, 'AuthDomain');
  const media = output(cms, 'MediaBucketName');
  if (
    !/^https:\/\/[a-z0-9]+\.execute-api\.us-east-1\.amazonaws\.com$/.test(
      api,
    ) ||
    !/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.auth\.us-east-1\.amazoncognito\.com$/.test(
      auth,
    ) ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(media)
  )
    throw Error('Unexpected CMS output origins.');
  const primary = `https://${parameter(website, 'PrimaryDomainName')}`;
  if (
    https(output(cms, 'RedirectUri')).href !== `${primary}/admin/callback` ||
    parameter(cms, 'PrimaryOrigin') !== primary
  )
    throw Error('CMS and website origins differ.');
  if (output(cms, 'ReleaseSourceSha') !== config.source)
    throw Error('Deploy and accept this exact backend source before cutover.');
  const contact = https(output(website, 'ApiEndpoint')).href;
  return {
    apiBase: api,
    authDomain: auth,
    clientId: output(cms, 'CognitoClientId'),
    redirectUri: output(cms, 'RedirectUri'),
    contactUrl: contact,
    localDevelopment: false,
    mediaOrigin: `https://${media}.s3.us-east-1.amazonaws.com`,
  };
}

export async function deliver(
  phase,
  env = process.env,
  run = command,
  resolve = resolveRelease,
  request = fetch,
) {
  if (phase === 'verify') return verifyArtifacts(run);
  const config = configuration(env);
  const hashes = verifyArtifacts(run);
  if (resolve(config.tag) !== config.source)
    throw Error('Release source moved.');
  const aws = (args) => {
    const text = run('aws', [
      ...args,
      '--region',
      config.region,
      '--output',
      'json',
      '--no-cli-pager',
    ]);
    return text.trim() ? JSON.parse(text) : {};
  };
  if (aws(['sts', 'get-caller-identity']).Account !== config.account)
    throw Error('AWS account mismatch.');
  if (config.operation === 'backend') {
    const policy = aws([
      'iam',
      'get-policy',
      '--policy-arn',
      config.runtimeBoundaryArn,
    ]).Policy;
    if (
      policy?.Arn !== config.runtimeBoundaryArn ||
      policy.IsAttachable !== true
    )
      throw Error(
        'The expected attachable CMS runtime permissions boundary is required.',
      );
  }
  const describe = (name, optional = false) => {
    try {
      return aws(['cloudformation', 'describe-stacks', '--stack-name', name])
        .Stacks[0];
    } catch (error) {
      const detail = String(error.stderr || '');
      if (
        optional &&
        /ValidationError/.test(detail) &&
        /does not exist/.test(detail)
      )
        return null;
      throw error;
    }
  };
  const website = describe(config.websiteStack);
  if (
    ![
      'CREATE_COMPLETE',
      'UPDATE_COMPLETE',
      'UPDATE_ROLLBACK_COMPLETE',
    ].includes(website.StackStatus)
  )
    throw Error('Website stack must be stable.');
  const cms = describe(config.cmsStack, true);
  const target =
    config.operation === 'backend' ? config.cmsStack : config.websiteStack;
  const frontendBucket = output(website, 'FrontendBucketName');
  const pendingCreate =
    config.operation === 'backend' && cms?.StackStatus === 'REVIEW_IN_PROGRESS';
  const mediaBucket =
    cms && !pendingCreate ? output(cms, 'MediaBucketName') : null;
  if (
    [frontendBucket, mediaBucket].includes(config.artifactBucket) ||
    (mediaBucket && frontendBucket === mediaBucket)
  )
    throw Error('Artifact, frontend, and media buckets must be distinct.');
  const assertBucket = (bucket) => {
    aws([
      's3api',
      'head-bucket',
      '--bucket',
      bucket,
      '--expected-bucket-owner',
      config.account,
    ]);
    const location = aws([
      's3api',
      'get-bucket-location',
      '--bucket',
      bucket,
      '--expected-bucket-owner',
      config.account,
    ]);
    if (
      location.LocationConstraint !== null &&
      location.LocationConstraint !== 'us-east-1'
    )
      throw Error('Bucket region mismatch.');
  };
  assertBucket(config.artifactBucket);
  let runtime = null;
  if (config.operation === 'cutover')
    runtime = publicConfiguration(cms, website, config);
  const captureFrontend = () => {
    assertBucket(frontendBucket);
    if (
      aws([
        's3api',
        'get-bucket-versioning',
        '--bucket',
        frontendBucket,
        '--expected-bucket-owner',
        config.account,
      ]).Status !== 'Enabled'
    )
      throw Error(
        'Enable and verify frontend versioning before planning a cutover or restore.',
      );
    const keys =
      parameter(website, 'FrontendMode') === 'cms'
        ? ['index.html', 'config.js']
        : ['index.html', 'js/config.js'];
    return keys.map((key) => {
      const head = aws([
        's3api',
        'head-object',
        '--bucket',
        frontendBucket,
        '--key',
        key,
        '--expected-bucket-owner',
        config.account,
      ]);
      if (!head.VersionId || head.VersionId === 'null')
        throw Error('A recoverable frontend version is required.');
      return { key, version: head.VersionId, etag: head.ETag };
    });
  };
  if (phase === 'plan') {
    if (config.recoveryChangeSet) {
      if (!pendingCreate || cms.Outputs?.length)
        throw Error('Recovery requires an untouched initial CMS placeholder.');
      const failed = aws([
        'cloudformation',
        'describe-change-set',
        '--stack-name',
        target,
        '--change-set-name',
        config.recoveryChangeSet,
      ]);
      if (
        failed.ChangeSetId !== config.recoveryChangeSet ||
        failed.ChangeSetName !== config.recoveryChangeSet.split('/')[1] ||
        failed.NextToken ||
        failed.StackId !== cms.StackId ||
        failed.StackName !== config.cmsStack ||
        failed.Status !== 'FAILED' ||
        failed.ExecutionStatus !== 'UNAVAILABLE' ||
        !Array.isArray(failed.Changes) ||
        failed.Changes.length !== 0 ||
        !/^backend [a-f0-9]{40} run [0-9]+\/[0-9]+$/.test(
          failed.Description || '',
        )
      )
        throw Error(
          'Recovery requires the exact failed, unexecuted backend change set.',
        );
      // AWS CLI automatically retrieves every page; never accept a partial history.
      const history = aws([
        'cloudformation',
        'describe-stack-events',
        '--stack-name',
        target,
      ]);
      if (
        history.NextToken ||
        !Array.isArray(history.StackEvents) ||
        !history.StackEvents.length ||
        history.StackEvents.some(
          (event) =>
            event.StackId !== cms.StackId ||
            event.PhysicalResourceId !== cms.StackId ||
            event.LogicalResourceId !== config.cmsStack ||
            event.ResourceType !== 'AWS::CloudFormation::Stack' ||
            event.ResourceStatus !== 'REVIEW_IN_PROGRESS',
        )
      )
        throw Error(
          'Recovery requires a complete untouched placeholder event history.',
        );
    }
    if (
      cms &&
      !(pendingCreate && config.recoveryChangeSet) &&
      ![
        'CREATE_COMPLETE',
        'UPDATE_COMPLETE',
        'UPDATE_ROLLBACK_COMPLETE',
      ].includes(cms.StackStatus)
    )
      throw Error('CMS stack must be stable.');
    const previous =
      config.operation === 'backend' ? (pendingCreate ? null : cms) : website;
    const backup = config.operation === 'backend' ? null : captureFrontend();
    const overrides =
      config.operation === 'backend'
        ? {
            ReleaseSourceSha: config.source,
            RuntimePermissionsBoundaryArn: config.runtimeBoundaryArn,
            PrimaryOrigin: `https://${parameter(website, 'PrimaryDomainName')}`,
            CognitoDomainPrefix: config.domainPrefix,
          }
        : {
            FrontendMode: config.operation === 'cutover' ? 'cms' : 'legacy',
            CmsApiOrigin: runtime?.apiBase || '',
            CmsAuthOrigin: runtime?.authDomain || '',
            CmsMediaOrigin: runtime?.mediaOrigin || '',
          };
    const template =
      config.operation === 'backend'
        ? '.aws-sam-cms/build/template.yaml'
        : '.aws-sam/build/template.yaml';
    run('sam', [
      'package',
      '--template-file',
      template,
      '--s3-bucket',
      config.artifactBucket,
      '--s3-prefix',
      `cms-delivery/${config.source}/${config.run}/${config.attempt}`,
      '--region',
      config.region,
      '--output-template-file',
      'packaged-delivery.yaml',
    ]);
    const summary = aws([
      'cloudformation',
      'get-template-summary',
      '--template-body',
      'file://packaged-delivery.yaml',
    ]);
    const parameters = summary.Parameters.map(({ ParameterKey: key }) => {
      if (Object.hasOwn(overrides, key))
        return { ParameterKey: key, ParameterValue: overrides[key] };
      if (previous?.Parameters?.some((entry) => entry.ParameterKey === key))
        return { ParameterKey: key, UsePreviousValue: true };
      throw Error(`Explicit initial parameter required: ${key}`);
    });
    writeFileSync('delivery-parameters.json', JSON.stringify(parameters));
    const name = `cms-${config.operation}-${config.run}-${config.attempt}`;
    if (
      config.recoveryChangeSet &&
      stackFingerprint(describe(target)) !== stackFingerprint(cms)
    )
      throw Error(
        'CMS placeholder changed during recovery; inspect before replanning.',
      );
    const created = aws([
      'cloudformation',
      'create-change-set',
      '--stack-name',
      target,
      '--change-set-name',
      name,
      '--change-set-type',
      previous ? 'UPDATE' : 'CREATE',
      '--template-body',
      'file://packaged-delivery.yaml',
      '--parameters',
      'file://delivery-parameters.json',
      '--capabilities',
      'CAPABILITY_IAM',
      'CAPABILITY_AUTO_EXPAND',
      '--description',
      `${config.operation} ${config.source} run ${config.run}/${config.attempt}`,
    ]);
    aws([
      'cloudformation',
      'wait',
      'change-set-create-complete',
      '--stack-name',
      target,
      '--change-set-name',
      created.Id,
    ]);
    const changes = aws([
      'cloudformation',
      'describe-change-set',
      '--stack-name',
      target,
      '--change-set-name',
      created.Id,
    ]);
    rejectUnsafeChanges(changes);
    const manifest = {
      recordType: 'cms-delivery-plan',
      config,
      hashes,
      target,
      changeSet: created.Id,
      changeHash: sha256(JSON.stringify(changes.Changes)),
      templateHash: sha256(readFileSync('packaged-delivery.yaml')),
      stackFingerprint: stackFingerprint(describe(target)),
      websiteFingerprint: stackFingerprint(describe(config.websiteStack)),
      cmsFingerprint: stackFingerprint(describe(config.cmsStack)),
      runtime,
      backup,
      frontendBucket,
      distribution: output(website, 'DistributionId'),
      changeSetType: previous ? 'UPDATE' : 'CREATE',
    };
    writeFileSync('delivery-plan.json', JSON.stringify(manifest, null, 2));
    writeFileSync(
      'delivery-plan.sha256',
      `${sha256(readFileSync('delivery-plan.json'))}\n`,
    );
    if (env.GITHUB_OUTPUT)
      writeFileSync(
        env.GITHUB_OUTPUT,
        `plan_sha256=${sha256(readFileSync('delivery-plan.json'))}\n`,
        { flag: 'a' },
      );
    if (env.GITHUB_STEP_SUMMARY)
      writeFileSync(
        env.GITHUB_STEP_SUMMARY,
        `## CMS delivery plan\n\nOperation: ${config.operation}\nSource: ${config.source}\nTarget: ${target}\nChange set: ${created.Id}\nAcceptance reference: ${config.acceptance || 'not applicable'}\n\nReview the retained plan artifact and CloudFormation changes before approving apply.\n`,
      );
    return manifest;
  }
  if (phase !== 'apply') throw Error('Invalid delivery phase.');
  if (
    !/^[a-f0-9]{64}$/.test(env.PLAN_SHA256 || '') ||
    sha256(readFileSync('delivery-plan.json')) !== env.PLAN_SHA256 ||
    env.PLAN_SHA256 !== readFileSync('delivery-plan.sha256', 'utf8').trim()
  )
    throw Error('Plan checksum mismatch.');
  const manifest = jsonFile('delivery-plan.json');
  if (
    JSON.stringify(manifest.config) !== JSON.stringify(config) ||
    JSON.stringify(manifest.hashes) !== JSON.stringify(hashes) ||
    manifest.target !== target ||
    manifest.frontendBucket !== frontendBucket ||
    manifest.stackFingerprint !== stackFingerprint(describe(target)) ||
    manifest.websiteFingerprint !== stackFingerprint(website) ||
    manifest.cmsFingerprint !== stackFingerprint(cms)
  )
    throw Error('Plan identity or live stack changed; create a new plan.');
  const changes = aws([
    'cloudformation',
    'describe-change-set',
    '--stack-name',
    target,
    '--change-set-name',
    manifest.changeSet,
  ]);
  rejectUnsafeChanges(changes);
  if (
    changes.StackName !== target ||
    !changes.ChangeSetId.startsWith(
      `arn:aws:cloudformation:${config.region}:${config.account}:changeSet/`,
    ) ||
    changes.ChangeSetId !== manifest.changeSet ||
    sha256(JSON.stringify(changes.Changes)) !== manifest.changeHash
  )
    throw Error('Live change set differs from the reviewed plan.');
  if (
    config.operation !== 'backend' &&
    JSON.stringify(captureFrontend()) !== JSON.stringify(manifest.backup)
  )
    throw Error('Frontend changed since plan; replan.');
  const result = {
    recordType: 'cms-deployment-attempt',
    config,
    changeSet: manifest.changeSet,
    hashes,
    backup: manifest.backup,
    status: 'started',
  };
  writeFileSync('delivery-result.json', JSON.stringify(result, null, 2));
  aws([
    'cloudformation',
    'execute-change-set',
    '--stack-name',
    target,
    '--change-set-name',
    manifest.changeSet,
  ]);
  aws([
    'cloudformation',
    'wait',
    manifest.changeSetType === 'CREATE'
      ? 'stack-create-complete'
      : 'stack-update-complete',
    '--stack-name',
    target,
  ]);
  if (config.operation !== 'backend') {
    if (config.operation === 'cutover') {
      const publicConfig = Object.fromEntries(
        Object.entries(runtime).filter(([key]) => key !== 'mediaOrigin'),
      );
      writeFileSync(
        'web/dist/config.js',
        `window.PORTFOLIO_CONFIG = ${JSON.stringify(publicConfig)};\n`,
      );
    } else {
      writeFileSync(
        'frontend/js/config.js',
        `window.APP_CONFIG = ${JSON.stringify({ API_URL: https(output(website, 'ApiEndpoint')).href })};\n`,
      );
    }
    const directory = config.operation === 'cutover' ? 'web/dist' : 'frontend';
    run('aws', [
      's3',
      'sync',
      `${directory}/`,
      `s3://${frontendBucket}/`,
      '--exclude',
      'index.html',
      '--exclude',
      'config.js',
      '--exclude',
      'js/config.js',
      '--cache-control',
      'no-store',
      '--region',
      config.region,
      '--no-progress',
    ]);
    const configKey =
      config.operation === 'cutover' ? 'config.js' : 'js/config.js';
    for (const key of [configKey, 'index.html'])
      run('aws', [
        's3',
        'cp',
        `${directory}/${key}`,
        `s3://${frontendBucket}/${key}`,
        '--cache-control',
        'no-store',
        '--region',
        config.region,
        '--no-progress',
      ]);
    aws([
      'cloudfront',
      'wait',
      'distribution-deployed',
      '--id',
      manifest.distribution,
    ]);
    const invalidation = aws([
      'cloudfront',
      'create-invalidation',
      '--distribution-id',
      manifest.distribution,
      '--paths',
      '/*',
    ]);
    aws([
      'cloudfront',
      'wait',
      'invalidation-completed',
      '--distribution-id',
      manifest.distribution,
      '--id',
      invalidation.Invalidation.Id,
    ]);
  }
  const smoke = async (url) => {
    const response = await request(url, {
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      cache: 'no-store',
    });
    return { status: response.status, text: await response.text() };
  };
  if (config.operation === 'backend') {
    const url = `${output(describe(config.cmsStack), 'ApiBaseUrl')}/public/projects`;
    const response = await smoke(url);
    if (
      response.status !== 200 ||
      !Array.isArray(JSON.parse(response.text).items)
    )
      throw Error(
        'Backend public project response is not the expected contract.',
      );
    result.publicSmoke = {
      url,
      status: response.status,
      contract: 'items-array',
    };
    const origin = parameter(describe(config.cmsStack), 'PrimaryOrigin');
    result.preflightSmoke = [];
    for (const path of ['/public/projects', '/admin/projects']) {
      const preflightUrl = new URL(path, url).href;
      const preflight = await request(preflightUrl, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
        cache: 'no-store',
      });
      const allows = (name, value) =>
        (preflight.headers.get(name) || '')
          .split(',')
          .map((entry) => entry.trim().toLowerCase())
          .includes(value);
      if (
        preflight.status < 200 ||
        preflight.status >= 300 ||
        preflight.headers.get('access-control-allow-origin') !== origin ||
        !['get', 'post', 'put', 'options'].every((method) =>
          allows('access-control-allow-methods', method),
        ) ||
        !allows('access-control-allow-headers', 'authorization') ||
        !allows('access-control-allow-headers', 'content-type')
      )
        throw Error(`Backend browser preflight failed for ${path}.`);
      result.preflightSmoke.push({
        url: preflightUrl,
        status: preflight.status,
        origin,
        method: 'GET',
        headers: ['authorization', 'content-type'],
      });
    }
  } else {
    const origin = `https://${parameter(website, 'PrimaryDomainName')}`;
    const directory = config.operation === 'cutover' ? 'web/dist' : 'frontend';
    const key = config.operation === 'cutover' ? 'config.js' : 'js/config.js';
    const index = readFileSync(`${directory}/index.html`, 'utf8');
    const runtimeBytes = readFileSync(`${directory}/${key}`, 'utf8');
    const paths =
      config.operation === 'cutover'
        ? ['/', '/admin/callback', '/projects']
        : ['/'];
    for (const path of paths) {
      const response = await smoke(`${origin}${path}`);
      if (response.status !== 200 || response.text !== index)
        throw Error(
          'Published index or SPA route differs from the validated artifact.',
        );
    }
    const runtimeResponse = await smoke(`${origin}/${key}`);
    if (runtimeResponse.status !== 200 || runtimeResponse.text !== runtimeBytes)
      throw Error(
        'Published runtime configuration differs from the selected backend outputs.',
      );
    const missing = await smoke(
      `${origin}/assets/delivery-missing-${config.source}.js`,
    );
    if (![403, 404].includes(missing.status))
      throw Error('Missing assets must not return the SPA index.');
    result.publicSmoke = {
      origin,
      indexSha256: sha256(index),
      runtimeSha256: sha256(runtimeBytes),
      paths,
      missingAssetStatus: missing.status,
    };
  }
  result.status = 'pipeline-complete-live-acceptance-required';
  result.outputs = describe(target).Outputs;
  if (config.operation === 'backend') {
    const deployed = describe(config.cmsStack);
    if (
      [config.artifactBucket, frontendBucket].includes(
        output(deployed, 'MediaBucketName'),
      )
    )
      throw Error(
        'Deployed media bucket collides with another delivery bucket.',
      );
    result.publicConfiguration = publicConfiguration(deployed, website, config);
  }
  writeFileSync('delivery-result.json', JSON.stringify(result, null, 2));
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await deliver(process.argv[2]);
}
