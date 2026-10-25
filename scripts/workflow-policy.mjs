export function validateDeliveryWorkflows(workflows) {
  const legacy = workflows['deploy.yml'];
  const cms = workflows['deploy-cms.yml'];
  for (const workflow of [legacy, cms]) {
    if (
      !workflow ||
      Object.keys(workflow.on).some((event) => event !== 'workflow_dispatch') ||
      !workflow.on.workflow_dispatch?.inputs?.release_tag ||
      workflow.concurrency?.group !== 'portfolio-production' ||
      workflow.concurrency?.['cancel-in-progress'] !== false
    )
      throw new Error(
        'Delivery needs manual version selection and shared production concurrency.',
      );
  }
  for (const name of ['plan', 'apply']) {
    const job = cms.jobs[name];
    if (
      !job ||
      job.environment !== 'production' ||
      !job.if?.includes("github.ref == 'refs/heads/main'") ||
      job.permissions?.['id-token'] !== 'write'
    )
      throw new Error(
        'CMS planning and execution require main, production and scoped OIDC.',
      );
    const source = '${{ needs.resolve.outputs.source_sha }}';
    if (
      !job.steps.some(
        (step) =>
          step.uses?.startsWith('actions/checkout@') &&
          step.with?.ref === source,
      )
    )
      throw new Error('Delivery must check out the resolved release source.');
    for (const artifact of ['deployment-inputs', 'cms-backend', 'cms-web']) {
      const expected = `${artifact}-${source}-${'${{ github.run_attempt }}'}`;
      if (
        !job.steps.some(
          (step) =>
            step.uses?.startsWith('actions/download-artifact@') &&
            step.with?.name === expected &&
            !step.with?.['run-id'],
        )
      )
        throw new Error(
          'Delivery needs exact-source, same-run validated inputs.',
        );
    }
  }
  if (
    !cms.jobs.plan.needs.includes('checks') ||
    !cms.jobs.apply.needs.includes('plan') ||
    cms.jobs.checks.uses !== './.github/workflows/ci.yml'
  )
    throw new Error('CMS execution must follow full CI and a separate plan.');
  if (
    !legacy.jobs.deploy.steps.some((step) =>
      step.run?.includes('guard-legacy-release.mjs'),
    )
  )
    throw new Error(
      'Legacy publication must check the existing frontend mode.',
    );
  const choices = cms.on.workflow_dispatch.inputs.operation?.options;
  if (
    !choices ||
    ['backend', 'cutover', 'restore-legacy'].some(
      (name) => !choices.includes(name),
    )
  )
    throw new Error(
      'CMS delivery must explicitly select backend, cutover or recovery.',
    );
}
