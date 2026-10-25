# Portfolio and Project CMS v1 — Requirements

Status: implementation-ready draft for primary review; not a release approval.
Source: the user's Portfolio planning conversation and `docs/architecture.md`.
Technical architecture and API contracts are owned by the primary, not this document.

Presentation amendment: `docs/design/portfolio-layout-v2.md` moves About into the
homepage and refines the hero and airline case layout. The former standalone
About route is now a compatibility entry. CMS acceptance criteria are unchanged.

## 1. Confirmed intent and evidence

- Present full-stack engineering, business analysis, and cloud/DevOps capability.
- Use a professional, readable presentation with restrained dark/technical accents.
- Describe actual airline work: route revenue, cabin sales and load-factor analysis;
  Excel PivotTables/formulas; VBA updating latest available data dates and
  comparable booking periods; analysis informing price and cabin strategy.
- Compare booking progress at comparable lead times. Do not imply a formally
  identical historical methodology or quantified uplift without user evidence.
- SQL and Power BI are foundational skills, not tools claimed to have been used
  in that airline role. The airline analytics side project is deferred.
- An older full-stack airline-points project may be described using verified
  existing material; its redesign is a later task. Do not invent features or results.
- Manage project objects through a web application: create, read, edit, remove,
  upload pictures, and provide titles/descriptions without editing TypeScript or
  redeploying the site for ordinary content changes.
- Specialists self-review and report in Traditional Chinese; the primary reviews
  and consolidates, and the user explicitly authorizes the reviewed version before PR.

## 2. Implementation assumptions, not individually approved choices

The user has confirmed English public content, administration UI, source code,
tests, and technical documentation; only review reports use Traditional Chinese.
The remaining implementation defaults are one owner account, no public
registration, and authenticator-app MFA. Proposed
structured content supports headings, paragraphs, lists, images, and links.
Provide draft, preview, publish, unpublish, trash, and restore. Editing a live
project does not silently publish changes. These defaults derive from earlier
proposals; primary review must expose material deviations to the user.

Public routes are home, project listing, project detail, airline experience,
about/resume/contact, and a not-found page. Admin routes cover login, project
listing, edit/preview, media upload, and trash. Exact routes/UI are implementation
decisions. Airline experience and personal biography are fixed content in v1.

## 3. Actors and boundaries

| Actor | Allowed | Forbidden |
| --- | --- | --- |
| Visitor | Read published project snapshots and public assets; submit contact form | Read drafts, inspect admin lists, mutate content, upload files |
| Authenticated owner | Manage projects, preview drafts, upload media, publish/unpublish, trash/restore | Permanent deletion, account/IAM management through CMS |
| Unauthenticated/expired session | Login; public access | Any management operation or private-media access |

Backend authorization must enforce this matrix for every operation, including
object IDs, revisions, and media references. Hiding admin navigation is insufficient.
Login failures disclose no private project data. MFA/authentication must not be
weakened as an error workaround. Session recovery belongs to infrastructure
handoff; no secret recovery backdoor belongs in the UI.

## 4. Logical project contract

This is a business data contract; storage layout and endpoint shapes remain open.

| Field | Rule |
| --- | --- |
| id | Immutable server-issued identity |
| slug | Unique lowercase public URL key; validated; reserved while in trash |
| title | Required for publish; plain text |
| summary | Required for publish; short plain-text card description |
| content | Ordered allowlisted blocks; no arbitrary HTML or script |
| cover / gallery | References to verified images with alt text/captions |
| tags / technologies | Bounded plain-text lists |
| demoUrl / repositoryUrl | Optional; missing links never prevent publication |
| featured / displayOrder | Reserved compatibility metadata / deterministic published ordering |
| workingRevision | Versioned editable state, including field values |
| publishedSnapshot | Last explicitly published complete version, or absent |
| trashedAt / timestamps | Server-controlled state and audit dates |

Drafts may be incomplete. Published projects require title, slug, summary, cover
and nonempty readable content. Decorative images may use explicitly empty alt
text; meaningful images require useful alternative text. Engineering must publish
concrete field/file limits shared by client and server before implementation.
Optional links allow approved web URL schemes only, never executable protocols.

## 5. Lifecycle and acceptance criteria

| ID | Flow | Observable acceptance |
| --- | --- | --- |
| AC-01 | Create | Owner saves an incomplete draft; receives stable ID and revision; visitors cannot retrieve it by ID, slug, lists or media URL. |
| AC-02 | Read/list | Public reads return only complete published snapshots; admin lists show draft/live/changed/trash state and latest save time. Missing/unpublished/trash slugs return not found without draft details. |
| AC-03 | Edit/save | Saving updates the working revision only. A live page continues to show its earlier snapshot until explicit publication. Failure preserves form input and previous saved state. |
| AC-04 | Preview | Authenticated owner previews saved working content using public rendering rules; preview is not publicly shared or indexed, and unsaved input is identified. |
| AC-05 | Publish | Server validates the full revision and referenced media, atomically activates a complete snapshot, and returns the active revision. Invalid content keeps the previous public snapshot unchanged. |
| AC-06 | Unpublish | Owner confirms action; project disappears from public discovery/detail after successful operation while working content/media remain available privately. |
| AC-07 | Trash | Confirmation identifies the target and public impact. Successful soft-delete removes public availability, retains recoverable content, and blocks editing/publishing until restoration. No permanent-delete endpoint/UI or automatic purge in v1. |
| AC-08 | Restore | Restores retained content into an unpublished editable draft; never republishes implicitly. Slug remains reserved for that same project. Missing media are reported and must be resolved before publish. |
| AC-09 | Concurrent tabs | Writes/publication/unpublish/trash/restore include an expected revision; stale operations fail with a conflict, preserve user input, and offer reload/reconcile rather than overwriting. |
| AC-10 | Slugs | Duplicate/reserved/invalid keys fail clearly without replacing another project. Provisional v1 policy: slug cannot change while a published snapshot exists; unpublish first. Old unpublished URLs return not found; redirects are out of scope. |
| AC-11 | Published ordering | Home/list show all published projects using published displayOrder; featured is reserved metadata with no discovery effect. Draft edits do not change public placement. Ties have deterministic ordering. |
| AC-12 | Public freshness | Successful publish returns the active version; subsequent newly initiated reads eventually reflect it within a documented bounded interval. No deployment is required. The primary must set and test that bound. |

For all mutations, disable accidental duplicate submission in the UI and use
server-recognized operation identity or equivalent safe semantics. An uncertain
network outcome must be reconciled against stored state before retry; retries
must not create duplicate project identities or undo newer state.

## 6. Media acceptance

- Owner requests a bounded, short-lived upload grant for a unique object, uploads,
  then completes server-side verification. Only completed, verified media can
  be attached or published. Do not trust filename, MIME declaration, or client checks.
- Initial allowlist proposal: JPEG, PNG and WebP images; SVG, HTML, scripts,
  documents and arbitrary remote embeds are excluded. Limits are primary-owned.
- Draft uploads and authenticated previews are private. A public attachment is
  explicitly promoted during publication; public site files and CMS uploads have
  separate deployment/retention ownership so site sync cannot delete content.
- Deletion, trash and unpublish deny subsequent origin access to private content,
  subject to a disclosed/tested cache-revocation bound. Previously downloaded
  copies cannot be recalled. Do not describe published uploads as confidential.
- A media object referenced by another published snapshot cannot be silently
  removed. v1 has no permanent media deletion or automated orphan cleanup.
- Interrupted upload cannot corrupt an existing image. Failure explains retry
  and retains the draft; unreferenced uploads may incur retained storage cost.

## 7. Failure, accessibility and security acceptance

- Interrupted publish/media promotion exposes no partial new snapshot. Previous
  public content remains valid, with a retryable error and state reconciliation.
- Login expiry does not report an unsaved operation as successful. Unsaved changes
  trigger navigation warnings; recoverable input is retained in memory, not tokens
  or confidential drafts in unprotected persistent browser storage.
- Keyboard operation, labelled forms, visible focus, inline error association,
  responsive layouts and announced progress/error states cover admin/public flows.
- API rejects unknown privileged fields, invalid content/IDs, oversized inputs,
  unverified/foreign image references, missing/expired tokens and unauthorized users.
- Structured rendering must treat input as untrusted: XSS/safe-link checks apply.
  NoSQL/expression-injection negative cases apply to DynamoDB paths; SQL injection
  applies only if implementation actually introduces SQL. Never claim a test pass
  for a path that does not exist.
- Logs and public error bodies exclude tokens, uploaded private content and contact
  details. Rate controls and cost effects require cloud review.
- Preserve existing contact semantics: storage success means accepted, not email
  delivery. Do not silently merge the separately pending notification work.

## 8. Delivery and exclusions

Implementation proceeds in a separately verified development environment with
disposable fixtures, not production content. Seed records remain drafts unless
the primary verifies source claims/assets and an authorized publication is made.
Retain the existing site until a separately authorized cutover. Backup/retention,
recovery, incremental charges and asset migration require documented cloud review;
the earlier cost estimate is not a measured bill or spending authorization.

Out of scope: public accounts/comments, multi-owner/editor roles, airline analytics
side project, old full-stack project rebuild, SQL database migration, arbitrary
page builder, permanent deletion, automatic content purging and analytics claims.

The primary must finalize API/storage contracts, limits, freshness/revocation
bounds and infrastructure proposals before dependent implementation. These are
engineering handoffs, not reasons to block independent page/content planning.
Independent QA must execute the criteria on an exact integrated version. This
document defines intended behavior only; none of these features is asserted to
exist or have passed runtime tests.
