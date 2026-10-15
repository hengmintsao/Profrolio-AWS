# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `hengmintsao/Profrolio-AWS`.
Use the `gh` CLI with `--repo hengmintsao/Profrolio-AWS`.

## Operations

- Create: `gh issue create --title "..." --body-file <file>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels`.
- Comment: `gh issue comment <number> --body-file <file>`.
- Apply labels: `gh issue edit <number> --add-label "<label>"`.
- Remove labels: `gh issue edit <number> --remove-label "<label>"`.
- Close: `gh issue close <number> --comment "..."`.

Add the explicit `--repo` argument to each command.
For multiline content, write a temporary UTF-8 file and use `--body-file`.

When a skill says "publish to the issue tracker", create a GitHub issue.
When a skill says "fetch the relevant ticket", read the GitHub issue.

## Related issues

Use GitHub sub-issues and native issue dependencies when supported.
Otherwise, link children with `Part of #<parent>` and record blockers
with `Blocked by: #<number>` in the issue body.

## Pull requests as a triage surface

**PRs as a request surface: no.**
