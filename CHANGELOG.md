# Changelog

## Unreleased

- Require a preexisting account-scoped CMS runtime permissions boundary in backend delivery and the execution-role template.
- Keep text checkouts in LF format across platforms so Windows branch switches remain compatible with formatting checks.

- Prepare separate CMS backend/cutover/recovery delivery with source-bound artifacts and reviewed change sets.
- Keep legacy deployment from overwriting a CMS-mode site; add conditional SPA routing, exact-origin CSP and zero-minimum-TTL caching.
- Document production owner enrollment, AWS configuration and live acceptance prerequisites; no CMS deployment is implied.

- Candidate workspace version 1.0.0; no release tag has been published.
- Portfolio CMS preview and engineering quality tooling.
- Unified release-readiness gate and manual annotated-tag legacy deployment.
- Pinned actions, checked package versions, retained deployment inputs and source metadata.
- Documented the complete development/review/release lifecycle and added a local pre-push preflight gate.
- Scan staged index blobs as well as history and working files; preserve existing hooks and immutable release tags.
- Removed an inactive featured-project editor control while retaining API compatibility and published-project visibility.
