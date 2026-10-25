# Portfolio presentation revision 2

This revision implements the owner's feedback after the first local preview.
It supersedes the hero metadata and standalone About route in the v1 proposal.
CMS, authentication, project data, infrastructure and deployment remain unchanged.

## Confirmed changes

- Remove the hero labels `FULL-STACK ENGINEER · BUSINESS ANALYST` and
  `PORTFOLIO / HENRY TSAO`, plus `UNDERSTAND THE PROBLEM`, `BUILD WITH PURPOSE`
  and `DELIVER & IMPROVE`. Remove their containers and unused styling as well.
- Keep the headline, supporting introduction and primary work link.
- Place the biography in a labelled `#about` section on the homepage. Navigation
  links to `/#about`; `/about` and `/about/` are compatibility entries that render
  the homepage and normalize its URL. This is client behavior, not an HTTP redirect.
- Use a single homepage-entry effect to position the About section after mount
  for direct fragment URLs and legacy entries, with animation-frame cleanup.

## Airline experience layout

Use a scoped case-study layout: introductory heading and summary, at-a-glance
definition list, four linked analysis sections, a short factual note and a compact
work link. Do not nest the full homepage contact callout inside a narrow article.

The case container is at most 1240px. The heading is capped at 3.8rem, with natural
wrapping. The story uses a desktop section index alongside a controlled reading
column. At 900px and below, both layouts become one column and the index becomes
static; at 480px and below, heading and number-column sizes reduce further.
New styles are scoped to `.experience-*`, `.step-number` and About classes.

Use one H1 and labelled H2 sections. Index destinations and headings derive from
the same four-step data. Keep visible focus, reduced-motion rules and anchor
spacing. No charts, confidential data or invented outcomes are introduced.
Excel/PivotTables/formulas/VBA remain actual experience; SQL/Power BI remain
foundational knowledge.

## Evidence and limits

`web/src/Public-layout.test.tsx` covers homepage content/navigation, both legacy
About paths under StrictMode, direct fragment positioning requests and unique
analysis-section destinations. DOM tests establish neither pixel layout nor
real browser scrolling/focus. Browser/phone visual acceptance remains outstanding
because the available browser-control runtime failed to start.

See `docs/reports/portfolio-layout-v2/summary.md` and its snapshot for the reviewed
version, role reports, actual verification and the unchanged PR authorization gate.
