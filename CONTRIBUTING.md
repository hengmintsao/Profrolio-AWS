# Development and delivery workflow

This is the authoritative lifecycle for every change: application code,
infrastructure, dependencies, configuration, documentation, and hotfixes. Apply
release-quality scrutiny before every upload; publishing a branch is already a
public disclosure. A successful check is evidence, not authorization. No process
guarantees zero incidents; unresolved risks and missing evidence stay visible.

## 1. Establish scope

Read `AGENTS.md`, the relevant requirements/design/operations documents, and
`docs/agents/team.md` before delegation. Record the requested behavior, acceptance
criteria, exclusions, base commit, branch, affected contracts, and target system.
Distinguish the legacy deployed site from the proposed CMS. Check existing Git
changes and preserve unrelated work. Use a focused feature/fix branch; never
reset a shared tree or rewrite history to simplify a task.

Identify authentication, data, uploads, concurrency, secrets, AWS/IAM, cost,
accessibility, compatibility, and recovery effects. Record applicability rather
than invent tests for paths the application does not use.

Exit: each requirement has an owner and an acceptance scenario; external and
potentially destructive actions have separately identified authorization needs.

## 2. Assign senior roles

The primary coordinates interfaces, single-writer file ownership, integration,
and final evidence. Select specialists according to affected areas, and record
which roles were used or not applicable and why. Implementation self-review does
not replace independent verification. For application changes, assign independent
QA and reviewer work. For delivery/security/infrastructure changes, include a
release engineer and cloud specialist where AWS resource behavior is affected.
Documentation-only work can use a proportionate consistency review.

| Role             | Responsibility and required evidence                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| business_analyst | Acceptance criteria, factual experience claims, business rules, edge cases                                  |
| designer         | Journeys, loading/error/recovery states, responsive and keyboard experience                                 |
| frontend         | UI/API contracts, state, safe rendering, authentication use, focused tests                                  |
| backend          | Validation, owner authorization, public/draft boundaries, consistency, relevant injection risks             |
| cloud_devops     | Least privilege, resource replacements, retention, recovery, runtime compatibility, cost                    |
| qa               | Independent functional/regression and applicable security negative scenarios with reproducible results      |
| reviewer         | Independent correctness/specification/security review of the fixed final source; evidence-backed findings   |
| release_engineer | CI completeness, exact version/commit/artifact provenance, secrets controls, publication and recovery gates |

Local role definitions in `.codex/agents/` and installed skills are Git-ignored.
Fresh clones must receive explicit role responsibilities/boundaries or report the
role unavailable. Role files do not automatically launch agents. All specialists
stay within the assignment and shared authority limits. They cannot self-approve,
merge, force push, bypass checks, delete real content/resources, or deploy.

Exit: responsibilities, allowed paths, fixture limits, interfaces, reporting
requirements, and external-action limits are explicit before work begins.

## 3. Implement and self-review

Implement the smallest complete change. Keep source, UI, tests, configuration,
and maintained technical documents in English. Protect existing user content and
production behavior. Use local disposable fixtures for mutating tests; never
point E2E tests at AWS or a real owner session. Fix failures without removing
assertions, disabling checks, or loosening security controls.

Update relevant requirements/contracts, operations notes, and Unreleased release
notes. Review input validation, SQL injection only for actual SQL paths,
DynamoDB expression safety, XSS, owner/IDOR authorization, expired-token behavior,
CSRF applicability, draft/media leakage, upload content/size limits, duplicate
requests, and concurrent writes where relevant. Mark each as tested, inspected,
not tested, or inapplicable with a reason.

Exit: implementers inspect their own actual changes and report omissions,
corrections, checks, residual risks, and out-of-role handoffs in Traditional
Chinese using `docs/agents/reporting.md`.

## 4. Run local acceptance and disclosure checks

Install the prerequisites in README and run `npm run preflight`. It includes
full `quality`, audits for all three npm dependency trees, actionlint, and staged
and unstaged Git whitespace checks. Missing tools, scanner failures, and test
failures block the automated gate; do not bypass it.

Gitleaks scans locally reachable Git history, exact staged index blobs, and
tracked/unignored untracked working-tree content with redacted output. Inclusion
checks reject local assistant settings, reports, secrets/key paths, and generated
artifacts even when force-added. Inspect the exact staged diff and candidate file
list as well: a clean scan cannot recognize every secret or private document.
See `docs/operations/repository-hygiene.md` for scope and incident response.

Check affected desktop/mobile layouts, accessibility, error recovery, and browser
behavior. Relevant SAM lint/ARM64 container builds must pass in CI; run them
locally when compatible tooling is available. Missing local AWS/SAM capability
must be recorded, not called passed. This permits a reviewed branch upload to
obtain CI evidence, not a production readiness claim.

Exit: local mandatory checks pass at the recorded source snapshot; remote-only
checks and all remaining findings have explicit status and owners.

## 5. Independent review and user gate

Freeze the review scope using a commit or file paths plus hashes, including new
files. Review both requirements and project standards. Every assigned specialist
returns a Chinese report; the primary checks their evidence, resolves findings,
and reruns affected checks. Material changes require fresh review of affected
areas, not reuse of an earlier unconditional pass.

Produce the consolidated Chinese report locally under `docs/reports/<task>/`.
It must name the snapshot, assigned/unassigned roles, actual commands/results,
failed attempts and fixes, untested items, data/permission/cost/compatibility
impacts, remaining risks, and recovery plan. Local reports stay out of Git; share
a sanitized summary through an explicitly authorized channel when needed.

The user reads the report and explicitly authorizes the reviewed upload/PR scope
before the agent pushes or creates/updates any PR, including a draft. Earlier
blanket authorization and silence do not satisfy this gate. Approval of local
changes does not imply permission to merge, publish tags/releases, deploy, or
delete anything. These actions need their own applicable authorization.

Exit: report and exact scope are reviewed and the intended external action is
explicitly authorized. Stop here when authorization is absent.

## 6. Prepare the commit and upload

Stage only reviewed paths, inspect `git diff --cached`, and rerun checks after
staging if content changed. Use focused commits with a concrete explanation.
Keep secrets out of commit messages, filenames, screenshots, traces, and reports.
Check the resulting commit matches the reviewed snapshot.

Install the hook once per clone with `npm run hooks:install`. It refuses existing
hook conflicts. The pre-push hook requires a clean index/working tree, verifies
outgoing branch/tag identity, runs full preflight, then rechecks HEAD and tree.
It blocks direct main pushes, remote deletions, noncurrent commits, arbitrary
refs, and invalid release tags. Commit the reviewed work first; ignored local
reports/settings do not make the tree dirty. Preserve the hook's executable mode
when adding it to Git on Unix. Installation also sets its local execute bit.

Hooks are local and bypassable, and cannot verify a human's approval. Never use
`--no-verify`, force pushes, removed hooks, or weakened checks to evade a failure.
Server rules and the human gate remain required. No hook or document grants an
agent permission to push.

Exit: only the authorized reviewed commit(s) are uploaded, with no unrelated or
local-only content. The PR describes the problem, final behavior, validation,
limits, and recovery impact; use `.github/pull_request_template.md`.

## 7. Require actual GitHub CI and review

`ci.yml` checks legacy behavior and calls `cms-ci.yml` at the same source SHA.
`release-readiness` requires every necessary result to be success; failure,
cancellation, skip, or missing results must block. Check actual Actions logs and
the PR commit; a local pass or stale run is insufficient. Re-run for new commits.
CI has no production secrets; OIDC write permission is scoped to deployment.

Before merging, verify GitHub rules require the actual observed readiness check,
protect main from force updates/deletion, and provide the intended independent
review controls. Preserve existing required checks until replacement is proven.
Do not claim repository files configure remote rules. Resolve workflow failure
or a stale/outdated base using a reviewed update, then repeat checks and review.
Never auto-approve or dismiss reviews to obtain a green result.

Exit: actual required CI is green for the final PR revision, necessary independent
review is complete, and merge is explicitly authorized. Merging does not trigger
a deployment in the current manual-release design.

## 8. Publish an authorized version

Follow `docs/operations/releases.md`, the owner of release/rollback commands.
Use stable semantic versions: patch for compatible fixes, minor for compatible
features, major for breaking behavior/contracts. Update root/web/backend and
lock metadata together in a reviewed commit; maintain release notes. Never
publish or move a tag automatically during normal development.

Verify production environment reviewers, OIDC trust, least-privilege target IAM,
branch/tag protections, configuration, retention, alarms, previous known-good
version, and recovery compatibility. Publish an authorized annotated `vX.Y.Z`
tag on the reviewed main commit. Dispatch deployment from main for that tag.
The pipeline validates source/version, reruns full CI, verifies and deploys its
same-run build artifact, and records the attempt. A source manifest is not proof
of successful deployment. Artifacts expire and are not independent signatures.

The legacy pipeline deploys `frontend/` and the contact stack, and refuses to
overwrite a CMS-mode site. The separate CMS delivery workflow uses explicit
backend, cutover, and legacy recovery operations with change-set review before
execution. Follow `docs/operations/cms-aws-setup.md`; passing CMS tests does not
satisfy its real AWS, owner enrollment, acceptance or authorization prerequisites.

Exit: authorized version and target are unambiguous; required gates pass and
production acceptance remains pending until observed.

## 9. Verify production and handle failure

After an authorized deployment, verify CloudFormation completion, CloudFront
invalidation, primary/www behavior, static assets/deep links, and form acceptance
plus notification delivery using an authorized test submission. For a future
CMS release, also verify real authentication, owner isolation, media, and data
lifecycle on the deployed services. Observe logs/alarms and record the run URL,
version/source, target, acceptance results, and remaining issues.

On failure, stop further release work, inspect the failing step, and follow the
recovery runbook. CloudFormation rollback alone does not restore S3 or caches.
Select a compatible known-good version and obtain recovery authorization;
never delete real stacks, content, backups, or records as a shortcut. Rebuilding
an old source is not guaranteed to reproduce identical bytes. For a credential
leak, arrange revocation/rotation before normal delivery resumes.

Exit: observed production results and recovery/incident outcomes are recorded.
Only then describe a version as accepted in production.

## Enforcement and evidence boundaries

| Control                                                     | Enforcement/evidence                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Source quality, index/history secrets, inclusion, versions  | Local preflight and CI execution                                              |
| Before-push commit identity and clean tree                  | Installed local hook; absent/bypassable without server controls               |
| PR merge checks, main/tag protection, environment approvals | GitHub settings requiring separate verification                               |
| Agent participation, self-review, user authorization        | Named human/agent reports and explicit user action; not proven by a green job |
| ARM64 SAM, real AWS authentication/data, live acceptance    | Actual compatible container/runner/AWS results; never inferred from mocks     |
| Long-term recovery and secret absence                       | Bounded evidence and explicit residual risk; no absolute guarantee            |
