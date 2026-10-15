# Domain Docs

## Layout

This repository uses a single-context layout:

- `GLOSSARY.md`: shared domain vocabulary at the repository root.
- `docs/adr/`: architecture decision records.

## Before exploring the codebase

Read `GLOSSARY.md` and ADRs relevant to the area being explored.
Also read `docs/architecture.md` for the existing architecture overview.

If the glossary or ADR directory does not exist, proceed silently.
The domain-modeling skill creates them when terms or decisions are resolved.

## Vocabulary and decisions

Use glossary terms when naming domain concepts in issues, proposals,
hypotheses, tests, and code.

If a required concept is missing, check existing project terminology
and note any real gap for domain-modeling.

If a proposal conflicts with an ADR, identify the ADR and explain
why the decision should be reconsidered.
