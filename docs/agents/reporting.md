# Senior Self-Review and Reporting

## Language and ownership

This instruction file and role definitions are in English. Actual completion
reports and the primary's consolidated report must use Traditional Chinese for
headings and explanatory text. Keep commands, paths, identifiers, and URLs intact.

Every assigned role returns a report, including analysis-only tasks. A role may
write its report only to an assigned path; a read-only reviewer returns a message
and the primary persists it if needed. Suggested paths are
`docs/reports/<task>/<role>.md` and `docs/reports/<task>/summary.md`.
Do not overwrite reports from a different task. Report files may be Chinese as
the explicit exception to the repository's English documentation rule.

## Individual report: required content

1. Identity: role, task, reviewed commit or exact file snapshot, environment, and
   complete/partial/blocked status.
2. Work completed: concrete changes or analysis, files, acceptance criteria met,
   and what remains out of scope.
3. Self-review: what was inspected, issues found, corrections made within role
   authority, rechecks, and findings handed off to another owner.
4. Risk controls: for each applicable risk, state the triggering scenario, the
   implemented control, and evidence. Distinguish avoided by design, inspected
   only, tested, failed, not tested, and not applicable with rationale.
5. Verification: exact commands/scenarios, version, environment, expected/actual
   outcome, and evidence locations. Say explicitly when only mocked/local checks
   ran, and when CI, staging, or production checks were not performed.
6. Remaining issues: severity, impact, limitations, evidence gaps, suggested owner,
   and any user decision required.
7. Handoff: requirements/interfaces affected, next steps, and changes requiring
   review. A readiness recommendation is not approval or permission to create a PR.

Do not manufacture vulnerabilities, business metrics, test execution, or another
role's participation. "Prevented SQL injection" requires an actual SQL path,
the relevant control and evidence; no SQL path should be marked not applicable
with an explanation. Static inspection alone is not an executed penetration test.
Never claim that the whole application is secure because a limited checklist passed.

## Role-specific self-review emphasis

| Role | Required focus within the assignment |
| --- | --- |
| business_analyst | Traceability, contradictory rules, assumptions, edge cases, acceptance criteria, factual experience claims |
| designer | Journey/state coverage, responsive behavior, accessibility, recovery, unsaved changes, destructive-action UX |
| frontend | UI state and contract handling, retries/races, XSS and token exposure, safe links, upload feedback, accessibility |
| backend | Validation, SQL/NoSQL injection applicability, object-level authorization, mass assignment, consistency, idempotency, privacy |
| cloud_devops | IAM scope, secret/public exposure, retention, replacement/deletion effects, cost, deployment provenance and recovery |
| release_engineer | CI trigger/gate coverage, exact source version, package/lock consistency, artifact provenance, release authorization, rollback, and Git change control |
| qa | Functional/regression matrix and relevant security negative cases; reproducible evidence and honest coverage limits |
| reviewer | Finding validity, false positives, requirement alignment, cross-role gaps, evidence quality and residual risk |

Security tests stay inside the assigned environment and disposable-fixture scope.
QA reports application defects to their owner rather than editing product logic.
Testing a destructive feature does not authorize deletion of real data or media.

## Consolidated primary report: required content

1. Task summary and reviewable change scope, with exact commit/snapshot.
2. Links to each assigned role's Chinese report; explicitly list roles not used
   and their unverified areas without implying they reviewed the change.
3. The primary's own review: inspected integration points, evidence checked,
   issues returned for correction, and the outcome of rechecks.
4. What was delivered and which risks were addressed, supported by evidence.
5. Combined verification results, including failed, untested, or inapplicable
   items. Include compatibility, data, permission, cost, and deployment effects.
6. Open findings and decisions, with severity, owner, and recovery considerations.
7. Recommendation: ready for user review, partial, or blocked. Keep unresolved
   significant problems visible; do not turn self-review into unconditional approval.
8. Explicit gate: the user must read this report and authorize PR creation for
   this scope/version. No draft PR or PR update may be published before that
   authorization. Merge/deployment/delete authorization is separate.

When no specialists were run, say so and provide the primary's own report. A
documentation-only change needs proportionate structural and consistency checks,
not invented application or security-test results.
