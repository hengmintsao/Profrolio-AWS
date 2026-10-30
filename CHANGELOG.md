# Changelog

## Unreleased

## 1.0.4 (prepared; not published)

- Build the legacy and CMS ARM64 SAM artifacts on native ARM64 CI runners, avoiding QEMU during dependency installation.
- Preserve container validation, artifact checksums, required checks, and manual deployment approvals.
- Synchronize package versions without dependency changes.

## 1.0.3

- Route CMS browser preflight requests without authentication while preserving JWT authorization on admin operations.
- Require successful public and admin CORS preflight checks during backend delivery, in addition to the public projects contract check.
- Synchronize workspace, web and backend patch versions without changing dependencies.

## 1.0.2

- Retain the CMS media bucket HTTPS enforcement policy with its retained bucket during rollback, deletion and replacement.

## 1.0.1

- Recover explicitly identified failed initial CMS plans without deleting the placeholder stack or executing unreviewed changes.
- Bind recovery input into reviewed plan/apply configuration and reject incomplete history, wrong identities, resource activity and intervening placeholder changes.
- Synchronize workspace, web and backend patch versions; dependencies remain unchanged.

## 1.0.0


- Require a preexisting account-scoped CMS runtime permissions boundary in backend delivery and the execution-role template.
- Keep text checkouts in LF format across platforms so Windows branch switches remain compatible with formatting checks.

- Prepare separate CMS backend/cutover/recovery delivery with source-bound artifacts and reviewed change sets.
- Keep legacy deployment from overwriting a CMS-mode site; add conditional SPA routing, exact-origin CSP and zero-minimum-TTL caching.
- Document production owner enrollment, AWS configuration and live acceptance prerequisites; no CMS deployment is implied.

- Published source release v1.0.0. Publication does not establish successful CMS deployment or production acceptance.
- Portfolio CMS preview and engineering quality tooling.
- Unified release-readiness gate and manual annotated-tag legacy deployment.
- Pinned actions, checked package versions, retained deployment inputs and source metadata.
- Documented the complete development/review/release lifecycle and added a local pre-push preflight gate.
- Scan staged index blobs as well as history and working files; preserve existing hooks and immutable release tags.
- Removed an inactive featured-project editor control while retaining API compatibility and published-project visibility.
