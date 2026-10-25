# Portfolio CMS development

The new application lives in `web/`. The existing deployed `frontend/` and contact
handler remain separate until an explicitly authorized cutover. The separate CMS
SAM template is a proposal, not an automatically deployed stack.

## Local workflow

Use the tooling version in `.nvmrc` (Node 24.16.0) and install all three dependency
trees. The existing Lambda runtime and legacy deployment checks remain on Node
22; this tooling setup does not change the production runtime.

```powershell
npm ci
npm --prefix backend ci
npm --prefix web ci
npx playwright install chromium webkit
npm run dev
```

Open the Local URL printed by Vite (normally http://127.0.0.1:5173).
The backend binds only 127.0.0.1:8787. This development environment uses disposable
in-memory content and a development owner token. Restarting loses local projects
and images. It does not connect to production AWS. Do not enter confidential data.
The token is accepted only by the separate local server, never the Lambda handler.
Production builds must have runtime configuration and Cognito authentication.

Use the English administration screen to create a draft, upload a local image,
save and preview it, publish it, then verify the public project route. Edit the
draft again to observe the public snapshot remaining unchanged until publication.
Trash/restore in this local environment operates on disposable fixtures only.

## Verification

Install the pinned Gitleaks CLI using Go before running full quality checks:

```powershell
go install github.com/zricethezav/gitleaks/v8@v8.30.1
```

Ensure the Go binary directory is on PATH. A workspace-local binary at
`.scratch/bin/gitleaks` (or `gitleaks.exe`) is also supported. See
`operations/repository-hygiene.md` for scan scope and local-file rules.

```powershell
npm run quality
npm run audit:dependencies
```

`quality` checks repository inclusion, secrets, release controls, and the
English-only source/documentation policy, then runs
ESLint, Prettier checking, tooling and application type/build checks, unit tests,
and Playwright browser tests. `check:language` rejects Han characters in maintained
project text files outside `docs/reports/`; reports remain Traditional Chinese.
It does not inspect dependencies, ignored artifacts, or binary files. For faster feedback, run
`npm run lint`, `npm run format:check`, `npm run check`, `npm test`, or
`npm run test:e2e` separately. `npm run format` applies the checked-in formatting
rules to application code and tooling; historical reports and hash manifests
are excluded. The control-character validation regex has a documented local
ESLint exception because its purpose is to reject those characters.

All application UI, error messages, test fixtures and locators use English. The
document language is `en`, and administration timestamps use the `en-CA` locale.
Review reports are the only maintained project documents written in Chinese.

Playwright runs desktop Chromium, phone Chromium, and phone WebKit. Device
settings emulate browser layout and input behavior; WebKit emulation is not a
physical iPhone or a guarantee about Safari hardware behavior. Tests cover
320/390/402/440px widths, tablet and landscape layouts, navigation, images,
service failure, WCAG scans, and the local CMS publication lifecycle. axe scans
cover common WCAG issues, not full accessibility compliance.

`test:e2e` starts its own loopback-only memory backend on 8788 and Vite on 4174.
It refuses to reuse an existing server and never targets AWS or the running
5173/8787 preview. Only fixtures created by the tests are published, trashed or
restored; the isolated server state disappears when it stops. The development
backend validates an exact host/origin allowlist for the configured ports.
Do not set the test base URL to production.

The launcher waits for HTTP 200 from each owned server's public project endpoint,
independently of console output. Once ready, it cancels the startup deadline and
polling; genuine startup failures stop only its own children. `npm run test:tooling`
covers split/colorized/missing console output, cancelled deadlines, timeouts,
spawn errors, and child exits. These tests also run in the code-quality CI job.

Use `npm run test:e2e:ui` for interactive local tests, or
`npm run test:e2e:report` to open the latest report. Screenshots and failure traces
are written to ignored `test-results/` and `playwright-report/` directories. CI
uploads these artifacts for seven days. Test-server output and reports contain
only disposable fixtures; do not add real credentials or confidential data.

The new CI jobs check quality/audits and run Chromium/WebKit with installed Linux
browser dependencies. GitHub CI execution still requires a future authorized
push/PR; local results are not remote CI results. Existing required check names
are preserved; deployment now uses the manual annotated-tag release described
in `operations/releases.md`. To make new jobs required, update
branch protection separately after their first successful GitHub run.

`.github/dependabot.yml` prepares weekly npm and GitHub Actions update proposals.
It has no effect until merged to the default branch and does not enable
auto-merge. No update PR was created as part of this local setup.

The scripts intentionally keep dependency audits separate from formatting and
browser checks. Audit results reflect advisories available when they run; do not
use `npm audit fix --force` without reviewing the resulting dependency changes.

These are local checks, not GitHub CI or AWS acceptance results. The additional
`cms-ci.yml` workflow is called by the complete `ci.yml` gate. It checks the new
application but does not deploy the CMS. See `operations/portfolio-cms.md` for
production prerequisites and `CONTRIBUTING.md` for the complete delivery process.

The optional `npm run test:preview` starts its own disposable servers on ports
4175/8789 and stops them afterward. It leaves the normal 5173/8787 preview alone
and uses HTTP readiness rather than console text, including in colorized CI logs. It checks actual HTTP requests through
the Vite proxy, including uploads and publication lifecycle; it is not a rendered
browser, keyboard, screen-reader or phone layout test.

## Runtime configuration

`window.PORTFOLIO_CONFIG` is public configuration, never credentials. Configuration
must provide the CMS origin, existing contact endpoint and Cognito public client
settings. Development-only configuration is injected only by the Vite development
server. Never publish a local development configuration. See
`docs/specs/project-api.md` for field names and authorization rules.

## Review gate

Follow `CONTRIBUTING.md`. Read the current task's local Chinese consolidated
report and its exact source snapshot before authorizing a PR. Reports are
Git-ignored; a fresh clone must produce new evidence rather than rely on an old
report. Upload, PR creation/update, merge, tag publication, and deployment each
require the applicable explicit authorization.
