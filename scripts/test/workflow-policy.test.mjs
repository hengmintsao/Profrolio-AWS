import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDeliveryWorkflows } from '../workflow-policy.mjs';

function fixture() {
  const dispatch = {
    workflow_dispatch: { inputs: { release_tag: { required: true } } },
  };
  const job = {
    environment: 'production',
    if: "github.ref == 'refs/heads/main'",
    permissions: { 'id-token': 'write' },
    steps: [
      {
        uses: 'actions/checkout@pinned',
        with: { ref: '${{ needs.resolve.outputs.source_sha }}' },
      },
      ...['deployment-inputs', 'cms-backend', 'cms-web'].map((name) => ({
        uses: 'actions/download-artifact@pinned',
        with: {
          name: `${name}-${'${{ needs.resolve.outputs.source_sha }}'}-${'${{ github.run_attempt }}'}`,
        },
      })),
    ],
  };
  return {
    'deploy.yml': {
      on: structuredClone(dispatch),
      concurrency: {
        group: 'portfolio-production',
        'cancel-in-progress': false,
      },
      jobs: {
        deploy: { steps: [{ run: 'node scripts/guard-legacy-release.mjs' }] },
      },
    },
    'deploy-cms.yml': {
      on: {
        workflow_dispatch: {
          inputs: {
            release_tag: { required: true },
            operation: { options: ['backend', 'cutover', 'restore-legacy'] },
          },
        },
      },
      concurrency: {
        group: 'portfolio-production',
        'cancel-in-progress': false,
      },
      jobs: {
        checks: { uses: './.github/workflows/ci.yml' },
        plan: { ...structuredClone(job), needs: ['resolve', 'checks'] },
        apply: { ...structuredClone(job), needs: ['resolve', 'plan'] },
      },
    },
  };
}

test('delivery policy accepts an explicitly gated backend and frontend release', () => {
  validateDeliveryWorkflows(fixture());
});

test('delivery policy rejects automatic or competing production writes and missing gates', () => {
  const mutations = [
    (w) => {
      w['deploy-cms.yml'].on.push = {};
    },
    (w) => {
      w['deploy-cms.yml'].concurrency.group = 'other';
    },
    (w) => {
      w['deploy.yml'].concurrency['cancel-in-progress'] = true;
    },
    (w) => {
      w['deploy-cms.yml'].jobs.plan.needs = ['resolve'];
    },
    (w) => {
      w['deploy-cms.yml'].jobs.apply.needs = ['resolve'];
    },
    (w) => {
      w['deploy-cms.yml'].jobs.apply.environment = 'preview';
    },
    (w) => {
      w['deploy-cms.yml'].jobs.plan.if = 'true';
    },
    (w) => {
      w['deploy.yml'].jobs.deploy.steps = [];
    },
    (w) => {
      w['deploy-cms.yml'].jobs.checks.uses = './partial.yml';
    },
    (w) => {
      w['deploy-cms.yml'].jobs.apply.steps[0].with.ref = 'main';
    },
    (w) => {
      w['deploy-cms.yml'].jobs.plan.steps[1].with.name = 'latest';
    },
    (w) => {
      w['deploy-cms.yml'].jobs.apply.steps[1].with['run-id'] = 42;
    },
  ];
  for (const mutate of mutations) {
    const workflows = fixture();
    mutate(workflows);
    assert.throws(() => validateDeliveryWorkflows(workflows));
  }
});
