# Repository hygiene

## Included and local files

Keep application source, tests, dependency locks, workflows, reviewed public
configuration, project specifications, and operational documentation in Git.
`AGENTS.md` and `docs/agents/` describe shared project conventions and remain
versioned. They contain no installed third-party skill implementation.

Keep `.codex/`, `.agents/`, `.claude/`, `.cursor/`, `.aws/`, and `docs/reports/`
local. These ignored paths hold assistant settings, installed skills, credentials,
or review evidence. Ignoring them preserves local files and does not publish or
delete them. Fresh clones do not receive local role definitions or reports.

Ignore `.env` and `.env.*` at every depth. Only `.env.example`, `.env.sample`, and
`.env.template` may be included, after verifying their values are placeholders.
Private key/certificate bundles, real `samconfig.toml`/YAML deployment parameters,
logs, build outputs, dependency directories, and browser traces stay local.
The reviewed `samconfig.toml.example` remains versioned.

Browser runtime config is public. Never put a client secret, AWS credentials,
private signing key, or owner token in frontend config or Vite variables.
Public API URLs, account IDs, role/certificate ARNs, and Cognito client IDs are
identifiers, not authentication secrets; retain them only when the application
or infrastructure needs them.

## Before staging and before a PR

Run `npm run check:repository` and `npm run check:secrets`. Full `quality` includes
both. The inclusion check examines tracked plus unignored untracked paths, so a
force-added ignored secret or local assistant file fails. `.gitignore` alone
never removes an already tracked file.

The pinned Gitleaks scanner uses its default rules without project allowlists,
baselines, or inline suppression comments. It scans all history reachable from
locally available Git refs and a temporary snapshot of candidate working-tree
files, including untracked files that would otherwise be missed by history-only
scanning. It separately reads and scans the exact staged index blobs, so cleaning
the working file after staging cannot hide a staged secret. Temporary copies are removed after the scan; logs redact detected
values. CI fetches full history for this check and includes it in the required
application-quality gate.

Review `git status --short` and the exact staged diff before committing. Do not
use `git add -f` to bypass local-file policy. New templates still require content
review; a safe filename does not make its contents safe.

If a real credential is detected, stop publication, identify its owner, and
arrange revocation/rotation. Removing it from the current file is insufficient
if it was committed earlier. History rewrite or deletion needs separate explicit
authorization. Never include a raw detected secret in a report or PR.

## Evidence limits

A clean scan means no configured rule matched the inspected data. It does not
prove the absence of every secret, validate whether a credential works, inspect
unavailable/deleted remote refs, or scan remote Actions artifacts, secrets
settings, issues, comments, and external storage. Private binary content and
encoded/custom credentials still require review. No secret is uploaded to a
third-party scanning service by these local CLI checks.
