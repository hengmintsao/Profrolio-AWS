# Henry Tsao — Portfolio on AWS

A portfolio connecting full-stack engineering, business analysis, and cloud
software delivery. The redesign includes a React/TypeScript public site and an
owner-only project CMS, with a separate serverless backend proposal.

## Current status

| Area                                    | Source                                                                | Status                                                                               |
| --------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Existing website and contact API        | `frontend/`, `backend/src/handler.js`, `infrastructure/template.yaml` | Target of the legacy production deployment workflow                                  |
| Redesigned portfolio and project editor | `web/`, `backend/src/cms/`                                            | Local implementation with automated checks; not switched into production             |
| CMS AWS resources                       | `infrastructure/cms-template.yaml`                                    | Separate infrastructure proposal; requires authorized deployment and live acceptance |

The existing site's primary hostname is [henry-tsao.com](https://henry-tsao.com);
`www` is configured to redirect to it. This README is not a live availability
check. The candidate package version is recorded in `package.json`, not proof
that a matching version has been published.

## Start here

**Every change follows [CONTRIBUTING.md](CONTRIBUTING.md), including documentation,
dependency updates, hotfixes, and agent-assisted work.** It defines implementation,
review, secrets, upload, PR, merge, release, acceptance, and recovery gates.

Install Node using `.nvmrc`, npm, Git, and Go. Install all dependency trees, browser
binaries, and the pinned inspection tools:

```powershell
npm ci
npm --prefix backend ci
npm --prefix web ci
npx playwright install chromium webkit
go install github.com/zricethezav/gitleaks/v8@v8.30.1
go install github.com/rhysd/actionlint/cmd/actionlint@v1.7.12
npm run hooks:install
npm run dev
```

Put the Go binary directory on PATH. Workspace-local tools in `.scratch/bin/`
are also supported. Hook installation applies only to this repository and refuses
to overwrite an existing hook arrangement. Fresh clones need installation again.

Open the Vite Local URL, normally `http://127.0.0.1:5173`. The preview uses a
loopback-only, in-memory backend on 8787. Its owner token and content are local
fixtures, not AWS credentials or production authentication. Restarting discards
preview content. The production Lambda runtime remains Node.js 22/ARM64; the
workspace tooling uses the version in `.nvmrc`.

## Verify before uploading

```powershell
npm run preflight
```

This runs repository inclusion, Gitleaks history/index/working-tree scans,
release/workflow controls, English-language checks, lint, formatting, type/build
checks, tooling/unit/browser tests, dependency audits, actionlint, and Git
whitespace checks. See the [development guide](docs/development.md) for focused
commands and isolated E2E behavior.

The installed pre-push hook requires a clean working tree and index, checks that
outgoing refs identify the tested HEAD, and reruns preflight. It rejects direct
main pushes and remote deletions. Local hooks can be bypassed or absent, so they
supplement GitHub branch protection and human authorization. No local tool proves
that an agent reviewed work or that a user approved it.

## Delivery and AWS

[CI](.github/workflows/ci.yml) runs the legacy and reusable CMS checks at the same
source SHA. Its `release-readiness` gate rejects failed, cancelled, skipped, or
missing required results. The GitHub ruleset must separately require the actual
observed check name; this repository cannot enforce that setting by itself.

[Deployment](.github/workflows/deploy.yml) is manual from `main` and accepts an
existing annotated `vX.Y.Z` tag with matching package/lock versions. It rechecks
that source, verifies the same run's archived SAM build and legacy frontend,
then deploys the existing stack and publishes `frontend/`. It does **not** deploy
`web/dist/` or switch the CMS into production. Follow the
[release and recovery runbook](docs/operations/releases.md); direct manual AWS
commands are not the normal release path.

Production uses CloudFront, private S3, API Gateway, Lambda, DynamoDB, SNS,
CloudWatch, and AWS SAM/CloudFormation. GitHub obtains short-lived AWS access
through OIDC. Configure `AWS_ROLE_ARN`, optional `NOTIFICATION_EMAIL`, and the
`AWS_REGION`/`SAM_STACK_NAME` variables for the authorized production target.
OIDC trust, least-privilege IAM, environment reviewers, and branch/tag protection
must be verified before a real release. Never store AWS access keys in Git.

See [architecture](docs/architecture.md) for contact acceptance, retention, and
known notification/idempotency follow-ups. See
[CMS operations](docs/operations/portfolio-cms.md) for authentication, media,
data, cost, deployment, and cutover prerequisites.

## Repository map

| Path                     | Purpose                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `web/`                   | Redesigned React site, editor, styles, public assets, tests |
| `frontend/`              | Existing static production frontend                         |
| `backend/`               | Contact API, separate CMS, backend tests                    |
| `infrastructure/`        | Existing stack and proposed CMS template                    |
| `scripts/`, `e2e/`       | Local tooling, release checks, browser tests                |
| `.github/`, `.githooks/` | CI/CD, PR checklist, optional local enforcement             |
| `docs/`                  | Requirements, design, operations, shared agent rules        |

Local assistant roles/skills, reports, `.env` variants, credentials, build outputs,
and traces stay out of Git. Sanitized example files remain subject to secret
scanning. Read [repository hygiene](docs/operations/repository-hygiene.md).
Repository documents, source, tests, and UI use English; local completion reports
use Traditional Chinese. Serverless usage, CI execution, and artifact storage may
incur costs; this project is not guaranteed to be free or risk-free.
