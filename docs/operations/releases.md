# Release control

## Scope

The candidate workspace version is 1.0.0. It is not a published release.
The legacy deployment targets `frontend/` and the contact stack. The separate
`deploy-cms.yml` workflow prepares CMS backend deployment, frontend cutover and
legacy frontend recovery. Neither source changes nor a merged PR prove production
execution. Follow `cms-aws-setup.md` and `portfolio-cms.md` for AWS, authentication,
media, live acceptance and cutover prerequisites.

Both workflows share `portfolio-production` concurrency. The legacy workflow
refuses a CMS-mode website; use the explicit recovery operation instead.
Production environment review settings must be verified in GitHub: naming an
environment in YAML does not configure reviewers. Planning uploads packaged SAM
code and creates a change set, so even planning requires AWS-write authorization.

## Before a PR

Use a feature branch, preserve unrelated changes, and review tracked and untracked
files. Run `npm run quality`, `npm run audit:dependencies`, and actionlint 1.7.12.
Collect the assigned specialists' Chinese reports and the primary review, then
obtain explicit user authorization for that exact PR scope. Do not force push,
bypass required checks, or automatically approve/merge.

CI keeps `test`, `validate-frontend`, and `validate-infrastructure`, adds reusable
application checks, and exposes `release-readiness`. Configure that final job as
a required check after GitHub has observed its actual check name. This local
change does not update GitHub rulesets. Production environment reviewers and tag
update/deletion protection must also be verified separately.

## Release a reviewed version

1. Obtain explicit release authorization after the reviewed changes are merged.
2. Update root, web, and backend package versions and lock metadata together in a
   reviewed change. Use stable semantic versions and record release notes.
3. Create an annotated `vX.Y.Z` tag on the approved main commit only after tag
   publication is authorized. Never move or reuse a published version tag.
4. Run `Deploy to AWS` manually from `main`, supplying that existing tag. The
   resolver rejects lightweight tags, non-main ancestry, and version mismatch.
5. Complete the production environment review. All CI checks run against the
   resolved source SHA. Deployment downloads the same run's archived SAM build
   and legacy frontend, verifies SHA-256, and does not rebuild them.
6. Verify stack status, CloudFront completion, both domains, and contact delivery.
   Save the run URL and deployment-source artifact. A workflow success alone is
   insufficient evidence of form notification delivery.

Action references are pinned to commit IDs. Dependabot updates need review.
SAM container images and hosted runners can still change; this is not a fully
hermetic build. Source and workflow-definition SHAs are recorded separately. The source manifest
records a deployment attempt and its prior-step status; verify the complete run
result and live site before treating it as a successful release.
Artifacts retain deployment inputs for 90 days, subject to repository limits.
Runtime API configuration is injected after artifact verification using JSON
serialization and an HTTPS URL check. The checksum detects corruption; it is
not an independent signature against a compromised workflow.

## CMS operation sequence

Use `CMS production delivery` from `main` only after the reviewed workflow has
been merged, an annotated version has been separately authorized and published,
and the setup in `cms-aws-setup.md` has been verified. Select the existing tag;
never substitute a branch name or move an existing tag to retry.

1. Choose `backend` to provision or update only the separate CMS stack. Complete
   the production review before planning; SAM packaging uploads code to the
   configured artifact bucket and planning creates a CloudFormation change set.
2. Review the retained plan artifact, exact source/account/Region/stack, resource
   additions and modifications, and recovery material before approving execution.
   Replacement, deletion, stale plans and mismatched identities must stop the run.
   Configure actual required reviewers in GitHub; YAML alone cannot enforce them.
3. An authorized operator enrolls the owner with MFA and verifies real backend
   authorization and media behavior. Record sanitized evidence tied to the source,
   account and stack. Never include passwords, tokens or private content. Owner
   browser callback and final public-site checks remain pending until cutover;
   pre-cutover evidence must explicitly distinguish these unfinished checks.
4. Choose `cutover` at the same accepted backend source, supplying the live
   acceptance reference. Review its separate website change set and previous
   versioned frontend configuration. This updates the existing website stack
   and publishes the validated React build; the contact stack's packaged Lambda
   can also change. Preserve domain, certificate and notification parameters.
5. Perform the complete production acceptance in `portfolio-cms.md`, including
   owner login/callback, CRUD/privacy/media, primary/www, mobile/deep links,
   existing contact storage and notification delivery. Record what was actually
   observed. A supplied evidence URL is a human attestation, not automated proof.

On a failed cutover, stop and inspect the retained attempt/plan, CloudFormation
events, previous object version IDs and actual site state. CloudFormation changes
and S3 publication are separate operations: a failure can leave a partial cutover.
There is no automatic destructive rollback. After separate recovery authorization,
`restore-legacy` deploys the selected compatible release's legacy frontend and
matching website mode, while retaining CMS data, media and authentication.
This is a fresh validated publication, not exact restoration of previous bytes;
previous versioned objects and recorded parameters remain necessary for forensic
or exact recovery. Preserve older assets; publication must not use `--delete`.

This first delivery implementation stops on an empty/no-change CloudFormation
change set. If infrastructure completed but publication failed, rerunning the
same tag and operation can therefore stop before republishing. Inspect actual
state and select a separately reviewed compatible recovery operation or corrective
version; exact S3-version restoration requires its own authorized operator plan.
Do not bypass the change-set guard or assume a generic retry finishes recovery.

Changing source, target configuration, stack state or frontend version after
planning requires a new plan. Artifact retention is bounded to 90 days and is not
an independent backup strategy. Verify recovery material before it expires.

## Failure and recovery

Stop further deployment after a failure. Inspect CloudFormation events and the
exact failed step before retrying. Production concurrency prevents overlap but
does not promise FIFO ordering; cancel obsolete queued runs deliberately.

CloudFormation rollback does not restore S3 files or CloudFront caches. Select
the previous known-good compatible annotated version, obtain recovery deployment
authorization, and run the same manual pipeline to deploy its stack and frontend
together. This revalidates and rebuilds that source; it does not reproduce an
expired artifact byte-for-byte. Retain a separate approved backup when exact
long-term artifact restoration is required. Historical tags lacking the release
scripts/version metadata are not supported by this procedure.

Review template replacements, API compatibility, configuration, and data changes
before recovery. Never delete stacks, buckets, records, or backups as a rollback
shortcut. The new CMS requires its own migration/recovery plan before cutover.
