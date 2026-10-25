# Release control

## Scope

The candidate workspace version is 1.0.0. It is not a published release.
The deployment workflow still targets the legacy `frontend/` and contact stack.
The React CMS is checked by CI but is not deployed by this workflow. Its AWS,
authentication, media, migration, and cutover prerequisites remain in
`portfolio-cms.md`.

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
