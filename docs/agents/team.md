# Portfolio Agent Team

## Purpose and activation

Eight senior specialist roles support a primary coordinating agent. Their definitions
live locally in `.codex/agents/*.toml` (Git-ignored). `CONTRIBUTING.md` owns the
development and delivery lifecycle; this document owns shared agent authority,
assignments, and handoff rules. Read both and the assigned role before starting work.

Local role definitions, installed skills, session settings, and `docs/reports/`
are not distributed with the application repository. If a role file is absent,
the primary must supply its responsibilities and boundaries in the assignment
or report that the requested role is unavailable. Reports remain available on
the reviewing machine for the user-before-PR gate; a fresh clone has no local
report history. Never substitute a missing report with a fabricated approval.

Creating role files does not start agents or prove that a running session has
loaded them. Role discovery and concurrency depend on the Codex client and
execution environment. Models and reasoning effort inherit from the parent;
these files do not change global settings or raise concurrency limits.

If custom-role selection is unavailable, disclose that limitation. For a task
where the user has requested delegation, the primary may include the role's
instructions in a general subagent assignment. Do not claim native role loading
without evidence.

## Authority and role boundaries

- Role membership is not authorization. Perform only the intersection of the
  role's responsibilities, the explicit assignment, and existing user/tool permissions.
- Read related areas as needed, but write only to assigned paths. If no write
  scope is provided, deliver a read-only analysis.
- For out-of-role work, stop that portion, report the needed change and its
  impact to the primary, and continue only independent work within scope.
  The primary must reassign the work to the appropriate role; it cannot turn a
  specialist into a different role by appending an unrelated task.
- Subagents must not spawn further agents unless the primary explicitly assigns
  that delegation. Delegation must stay within the user's authorized task.
- Subagents must not approve or merge PRs, enable auto-merge, publish releases,
  deploy, or execute cloud configuration changes. They prepare evidence and
  proposed changes for the primary; the cloud role is not an exception.
- The primary may perform external writes only within explicit existing user
  authorization for that action and target. Readiness reports do not supply it.
  When authorization is missing, finish the reviewable work, then request it.

## Mandatory prohibitions

These restrictions apply even when a tool technically permits an action.

1. Do not self-approve work, dismiss reviews, bypass branch protection, force
   merge, force push, or override required checks. A clean review is evidence,
   not permission to approve, merge, or release.
2. Do not report checks as passed unless they ran successfully against the
   stated version. Do not fabricate evidence, hide failures, remove failing
   tests, skip required checks, or weaken acceptance criteria to get a pass.
   Report failures and have the responsible role fix the underlying behavior.
3. Subagents must not directly delete files, branches, stack resources, database
   records, S3 objects, backups, or user content; truncate/purge/reset/overwrite
   operations with equivalent destructive effects are also prohibited.
   Propose the exact targets, impact, and recovery plan to the primary instead.
4. Before the primary performs a deletion or destructive replacement, verify
   explicit user authorization covers the operation and exact targets; identify
   retention, backup, and recovery effects. If it does not, request authorization.
   A broad implementation task or a tool's approval prompt is not deletion consent.
5. Implementing an authorized delete/restore feature is distinct from executing
   it against real content. Subagents may exercise destructive behavior only
   inside an assigned isolated test fixture, with disposable data and cleanup
   explicitly covered by the task. Never infer that production data is disposable.
6. Do not broaden IAM or account access, disable MFA/authentication/encryption,
   expose private data, or loosen CORS to work around an error. Prepare a justified
   proposal for the primary and follow applicable user authorization requirements.
7. Do not reset the shared working tree, discard another person's changes,
   change branches, or rewrite Git history. The primary owns Git integration.
8. Do not send messages, publish content, or create external tickets on behalf
   of the user merely because a role normally handles that workflow. Existing
   authorization must cover the destination and action.

Normal edits to assigned source files may remove obsolete lines as part of the
authorized change. This does not authorize deleting files or executing destructive
operations against external data. Uncertain cases go to the primary first.

These are behavioral instructions, not separate read-only sandboxes. Agents
inherit the parent's tool and filesystem permissions; technical enforcement
must be configured in the execution environment.

## Primary coordinator

1. Confirm that the user requested delegation. Select only the roles needed.
2. Inspect current code and relevant documents. Separate existing behavior,
   confirmed requirements, proposals, and unresolved decisions.
3. Resolve dependencies before parallel implementation; define interfaces first.
4. Assign one writer per file at a time. Reserve shared contracts and configuration
   for a named owner. Use isolated worktrees when independent branches are needed.
5. Integrate deliverables and run cross-module verification. Arrange independent
   QA and review against a stable commit or explicit file snapshot.
6. Present results, evidence, limits, and remaining work. An agent's completion
   claim alone is not verified completion or release authorization.

## Assignment template

```text
Role:
Objective and exclusions:
Requirements and documents to read:
Branch / commit / working directory:
Allowed write paths (use "none" for read-only work):
Dependencies and agreed interfaces:
Acceptance criteria and verification:
Test environment, disposable fixtures, and permitted side effects:
User-authorized external actions (use "none" unless explicitly authorized):
Required self-review and report destination:
Deliverable and recipient:
```

Contract, model, permission, or requirement changes must be reported to the
primary before implementation. The primary coordinates affected roles and
records the decision instead of allowing incompatible local interpretations.
Subagents do not commit, push, create PRs, or switch shared branches. The primary
handles those actions within the user's authorization and tool permissions.

## Stages and handoffs

| Stage | Roles | Exit criteria |
| --- | --- | --- |
| Requirements and experience | business_analyst, designer | Acceptance criteria and key states defined; blocking decisions resolved |
| Implementation | frontend, backend, cloud_devops | Compatible interfaces, assigned file ownership, necessary checks completed |
| Verification and review | qa, reviewer | Stable version identified; findings evidenced and significant fixes rechecked |
| Release readiness | release_engineer | Delivery entry points, version provenance, gates, and recovery are accounted for; unresolved production prerequisites are explicit |
| Primary review | primary | Individual Chinese reports checked; integrated changes reviewed; consolidated Chinese report prepared |
| User review | user | User reads the consolidated report and explicitly authorizes the reviewed PR scope/version |

Parallel work is appropriate only when its dependencies have been resolved.

## Mandatory self-review before handoff

Every role must inspect its own deliverable before calling its task complete.
Use the role-specific self-review checklist and verify the result against the
assignment, acceptance criteria, actual diff, and identified environment.

1. Identify omissions, regressions, security risks, and unsupported assumptions.
2. Correct findings within assigned authority and write paths. For findings
   outside the role, hand off to the primary with a proposed owner.
3. Re-run affected checks after corrections and record the actual outcomes.
4. Report what was completed, what was corrected, which controls address which
   risks, and what remains unverified. A checklist tick alone is not evidence.
5. Return a Traditional Chinese role report before handoff. Roles without write
   authority return it as a message; the primary may persist that report.

Use `docs/agents/reporting.md` for report fields and evidence rules. Risk checks
must match the implementation: SQL injection is applicable to SQL paths, while
NoSQL/expression injection and authorization need consideration for DynamoDB.
An inapplicable check needs a reason and inspected evidence, not a fabricated pass.
Self-review supplements independent QA and review; it never grants approval.

## Primary review and user gate before PR creation

This gate applies to the primary as well as all specialists, starting with this
policy change. Earlier blanket authorization to automate PRs does not satisfy it.

1. Collect reports from every assigned role and verify their scope and evidence.
2. Inspect the integrated diff, cross-role contracts, actual checks, and unresolved
   findings. Return corrections to the responsible role and obtain updated
   reports against the corrected version. Preserve earlier findings and outcomes.
3. Produce one consolidated Traditional Chinese report using
   `docs/agents/reporting.md`. Link individual reports and identify the reviewed
   commit or exact file snapshot. Distinguish the primary's review from specialist
   self-review and independent QA/reviewer results; unassigned roles are not tested.
4. Present the report and reviewable changes to the user. Stop before creating
   any PR, including a draft, until the user has read the report and explicitly
   authorized PR creation for that reviewed scope/version. Silence is not approval.
5. If material changes follow the user's review, refresh the report and obtain
   authorization for the changed scope before PR creation. Do not use external
   automation or a connector to bypass this gate.

The primary may report ready for user review, partial, or blocked; it must not
hide failures or describe unresolved high-severity defects as complete. User PR
authorization does not independently authorize merge, deployment, deletion, or
security changes. Those actions still require their applicable authorization and
checks. For existing PRs, new changes also require the review/report gate before
publishing PR updates unless the user explicitly authorizes the reviewed update.

## Delivery format

The following field list is defined in English for maintainability; produce the
actual role and consolidated reports with Traditional Chinese headings and text.
Preserve technical identifiers, commands, paths, and URLs as needed.
Detailed templates and evidence definitions live in `docs/agents/reporting.md`.


```text
Status: complete / partial / blocked
Deliverable: files, analysis, or findings
Verification: checks, version, environment, results, and untested areas
Risks: concrete triggers, impact, and evidence
Handoff: interfaces, decisions, and remaining work
Out-of-scope requests: proposed owner and reason, if any
```

Distinguish code inspection, mocked tests, CI results, staging checks, and live
production verification. A reviewer reports findings; QA reports observed test
results. Neither grants approval or silently closes unresolved requirements.

## Project context

The portfolio should demonstrate full-stack engineering, business analysis,
and cloud/DevOps capability. Airline work used Excel PivotTables, formulas, and
VBA; SQL and Power BI are foundational skills. Claims about experience or
measured outcomes require user-provided evidence.

The deployed website and the redesign/CMS have separate implementation and rollout
states. Check current source and task reports for what exists locally and what is
deployed. Discussions of React/TypeScript, Cognito, project CRUD, uploads, drafts,
publishing, and restore flows alone do not establish implementation, approval, or
production verification. Use confirmed requirements and inspected evidence.

Write repository documentation, role definitions, and developer-facing comments
in English. Main-chat replies may follow the user's language. Technical specifications and code-facing artifacts remain in English. Role
completion reports, primary consolidated review reports, and their report files
are an explicit exception: write them in Traditional Chinese for user review.

## Example requests

"Have business_analyst draft publishing requirements and designer map the admin
flow. Analysis only; return reviewable drafts without implementation."

"Implement the agreed specification with frontend and backend. Assign interfaces
and write paths first, then have qa verify and reviewer inspect the stable diff.
Do not merge, deploy, or delete real content."
