## Agent skills

### Delivery workflow

Before development, review, commit preparation, upload, PR creation/update, or release work, read `CONTRIBUTING.md`. It owns the delivery stages and evidence gates; no successful check substitutes for the user's required authorization.

### Issue tracker

Track issues and specs in GitHub Issues for hengmintsao/Profrolio-AWS.
Before issue operations, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels.
Before triaging or applying labels, read `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout.
Before exploring the codebase, read `docs/agents/domain.md`.

### Agent team

When the user requests delegated work, read `docs/agents/team.md` before assigning tasks.
Local role definitions live in Git-ignored `.codex/agents/*.toml`; creating them does not start agents. If unavailable, provide explicit responsibilities and boundaries in the assignment or report the role as unavailable.

### Documentation language

Write new and updated repository documentation, role definitions, and developer-facing comments in English unless the user explicitly requests otherwise. Chat replies may follow the user's language. Role completion reports and the primary's consolidated review report must be in Traditional Chinese; see `docs/agents/reporting.md`.

### Authority and protected actions

Before delegation, destructive operations, PR approval/merge, deployment, or security changes, read the authority and mandatory-prohibition sections of `docs/agents/team.md`. Role assignments do not grant approval or deletion authority.

### Review before PR creation

Every assigned role must complete senior-level self-review and deliver a Traditional Chinese report. Before creating any PR (including drafts) or publishing new PR updates, the primary must review the work, present a consolidated Traditional Chinese report, and receive explicit user authorization for the reviewed scope/version. Earlier blanket PR authorization does not satisfy this gate. Read `docs/agents/team.md` and `docs/agents/reporting.md` for the required process.
