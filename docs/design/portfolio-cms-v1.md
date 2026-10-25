# Portfolio CMS v1: experience design proposal

Presentation update: [revision 2](portfolio-layout-v2.md) supersedes the hero metadata
and standalone About-route proposal below following owner feedback. Other v1
product and CMS requirements remain subject to their existing contracts.

## Status and evidence

Design proposal for primary/BA review, not an approved product contract or an implemented screen. Business rules, permissions, limits, API contracts and publishing transactions remain owned by the primary and relevant specialists. Resolve conflicts with the BA specification before engineering starts.

Inspected local sources: frontend/index.html, frontend/css/style.css, docs/architecture.md, AGENTS.md, docs/agents/domain.md, team.md, reporting.md and .codex/agents/designer.toml. No glossary or ADR directory was present. No browser render, live-site test or external link verification was performed.

The current HTML contains a headshot (assets/images/myPhoto.jpg), Airline-Point screenshot (assets/images/airline-point-website.png), portfolio screenshot (assets/images/portfolio.png), GitHub/LinkedIn links and two Credly links. Treat these as migration inventory requiring owner confirmation; file references do not establish current certification validity, image rights or demo availability. Existing copy mentions 6.5 years of aviation work; confirm dates before reuse. Existing CSS uses fixed-height project cards and hover-only image links; replace these with flowing cards and persistent text links. Contact inputs currently rely on placeholders; new forms need persistent labels.

## Experience principles

Public pages are an editorial portfolio: a clear professional story with generous typography and evidence-led cases, not an administration dashboard or invented analytics product. The story connects airline commercial judgment, Excel/VBA process improvement, full-stack delivery and cloud/DevOps. Actual airline work used PivotTables, formulas and VBA; SQL and Power BI are foundational knowledge. The future airline analytics side project is deferred. Do not introduce simulated performance charts or invented outcomes to fill space.

Public content is English; administration labels and feedback are English. Technical specifications remain English. One shared component system supports both while giving administration denser, task-oriented layouts.

## Public information architecture

| Route proposal | Layout and content |
| --- | --- |
| / | Dark navigation and hero; concise positioning; two evidence lanes for airline commercial experience and software work; selected published projects; practical capabilities; contact invitation |
| /projects | Page introduction, published projects with descriptive tags and optional filters only when enough content exists; no empty decorative categories |
| /projects/:slug | Breadcrumb, title/summary, cover, role/context and verified dates where available; body blocks; technology list; optional demo/repository links; next-project link |
| /experience/airline-revenue | Work-experience narrative: business context, revenue/cabin/load-factor inputs, comparable booking lead-time analysis, pricing/cabin decisions, VBA date/period updates; no invented metrics or employer data |
| /about | Career narrative, evidence-backed capabilities, verified certifications and optional resume when supplied |
| /contact | Brief invitation and existing contact form behavior; homepage contact links here |
| /admin/* | Separate authenticated authoring experience; not public navigation content |

Home hero copy direction: “Business insight. Full-stack delivery.” Supporting sentence describes applying aviation experience and software skills to practical problems; final wording needs user review. Primary action: “Explore my work”; secondary: “About my experience”. Use the existing portrait only after owner approval. Never use a stock person as the owner.

Project cards: image at 16:10, category/context label, title, short summary, compact technology text and persistent “Read case study” link. No fabricated ratings, visitor counts or proficiency meters. Airline-Point is earlier work; distinguish shipped capabilities from planned modernization. Portfolio case explains what actually exists at publication time; CMS and retry features are not presented as shipped before deployment verification.

Detail body follows context → contribution → decisions → implementation → evidence/limitations → next steps where content supports it. These are editorial prompts, not mandatory claims or a locked business schema. Hide absent optional links instead of rendering disabled demo buttons. Distinguish unavailable project, no published content and failed loading.

## Visual and responsive system

Provisional palette: canvas #F7F6F2, surface #FFFFFF, ink #18232A, muted text #4B5862, dark surface #142129, inverse text #F7F6F2, border #D8DDE0, warm accent #A44320 with white foreground. Use pale orange only as a background with dark text. Error/success/warning always include text or an icon label. Validate actual contrast in implementation; tokens alone are not an accessibility pass.

Typography: system sans stack for UI/body (with locally available fallbacks), optional locally hosted editorial serif for large public headings if licensed and performant. No external font dependency is required. Body 16–18px, line-height 1.6; reading measure 65–72ch; headings clamp from 36 to 64px for hero, 28–40px for sections. Avoid all-caps long labels and long centered paragraphs.

Spacing scale 4/8/12/16/24/32/48/64/96px; content max-width 1200px; gutters 20px small, 32px medium, 48px large. Borders 1px, radii 8–12px, restrained shadow only for overlays. Controls minimum 44px height. Visible focus ring with offset and contrast on both surfaces.

Below 640px: single column, text before optional hero portrait, stacked project cards, compact expandable nav. 640–1023px: two-column cards where readable; hero remains one column if copy becomes cramped. At 1024px+: asymmetric hero, two-column featured projects, optional sticky detail contents. Test at 320px, 200% zoom and 400% zoom/reflow; breakpoints are starting points, not device assumptions. No horizontal page scrolling; long links wrap.

Motion: short opacity/position transitions only; respect prefers-reduced-motion; no scroll-jacking, auto-playing video or animated charts. Every action remains visible without hover.

## English administration shell

Routes are provisional: /admin/login, /admin/projects, /admin/projects/new, /admin/projects/:id/edit, /admin/projects/:id/preview and /admin/trash. User sees “Projects”, “New project”, “Save draft”, “Preview”, “Publish”, “Unpublish”, “Trash” and “Restore”. Authentication mechanism and MFA/recovery policy are platform decisions, not invented by this design.

Desktop uses restrained sidebar and content workspace; mobile uses a labelled navigation disclosure, card-based lists and a single-column editor. Sticky save bar must not cover content, focus targets or phone keyboard. Reflow sidebar settings below content on small screens. Status badges include text: “Draft”, “Published”, “Unpublished changes”, “Moved to trash”. These display states must map to the agreed data contract rather than create new backend statuses.

### List, editor and preview

Project list shows title, status, last-updated time, featured indication and accessible action menu. Search/status filter can be local or server-driven per contract; preserve query while returning from edit. An empty list explains how to create the first project. Loading placeholders do not masquerade as content. Fetch error offers retry and never displays “no projects”. Trash is visually and operationally distinct from the active list.

Editor groups: basic information (title, summary, slug if exposed), media (cover, gallery, alt text and caption), case-study body, tags/technologies, optional links, display settings. Exact required fields and limits follow BA/backend validation. Show counters only against actual contract limits. The editor and content fields use English consistently.

Body editor supports headings, paragraphs, lists, links and images. Every reorder/remove action has labelled buttons; dragging is optional. Removal of an unsaved block is undoable locally. Removing a reference does not silently delete a media object. Link input rejects unsafe schemes through the agreed renderer/validation contract. Raw HTML is not part of this proposal.

Preview uses the same public renderer and responsive layout with an unmistakable “Draft preview, not published” banner and return-to-editor control. Private preview data/media must not become a public unauthenticated route. Preview failure preserves the editor buffer. Warn before preview if local edits have not been saved; offer save-and-preview or return, subject to agreed preview contract.

Publishing shows a concise confirmation: which project and whether this is first publication or replacement of an existing public version. Draft edits do not change the public version until publish succeeds. Save, publish and upload have separate busy states. Never show published success on an uncertain network result; reconcile with the server before repeating the operation.

## State and recovery map

| Journey/state | UI behavior and safe recovery |
| --- | --- |
| Login initial/pending | Labelled credentials, password visibility control, submit progress; do not erase input except secrets as required by auth provider |
| Login failed/MFA/recovery | Non-enumerating error text; follow provider-supported recovery; no insecure bypass or promised password-reset behavior without contract |
| Session expired | Stop protected writes, preserve current in-memory edits, offer sign-in; after return, compare server revision before save; no silent localStorage persistence of tokens/content |
| Authenticated but forbidden | Explain insufficient access; no edit controls offered as a workaround; backend still owns enforcement |
| Editor pristine/dirty | Explicit “Unsaved changes” indication; route/back navigation guard offers stay, save-and-leave or discard local edits with confirmation; beforeunload best effort, not durability guarantee |
| Save pending/succeeded/failed | Disable duplicate save, keep editing policy explicit; mark only acknowledged version saved; retry retains edits and field errors |
| Conflict | Keep local buffer; show server-change notice with choices to inspect latest version or return; explicit copy/reconciliation workflow, never silent overwrite or automatic force-save |
| Upload selected/pending | File name, size, progress if available and accessible cancel; no misleading percentage when only indeterminate progress exists |
| Upload invalid/failed | Field-level reason from agreed MIME/size/image validation; allow retry/remove selection; failed media cannot be published; retain other form values |
| Upload succeeded but save failed | Keep uploaded reference for retry; do not promise indefinite retention; orphan cleanup is backend/cloud contract |
| Publish validation failure | Focus error summary; link to invalid fields/blocks; keep draft and scroll position |
| Publish result unknown | Show “Publication outcome uncertain”; retrieve current publication state before allowing retry; public snapshot remains server authority |
| Unpublish | Confirm title and public visibility impact; only announce success after acknowledgement; precise semantics owned by BA |
| Move to trash | Confirm title and resulting visibility; server acknowledgement before removal from active list; offer route to trash; no permanent-delete shortcut |
| Restore conflict | Explain slug/name conflict according to server response; keep item in trash until a valid restore succeeds |
| Trash empty/error | Distinct empty-state copy and retry state; retention/permanent deletion policy remains unresolved |
| Public fetch failure | Clear temporary-unavailable message, retry and navigation; no leakage of draft metadata |
| Public missing/unpublished | Generic unavailable/not-found presentation per API; no draft title or existence disclosure |
| Contact pending/failure/success | Keep input on failure; pending feedback announced; success says message received, not email delivered, matching existing HTTP 202 semantics |

## Accessibility and engineering acceptance scenarios

Use semantic landmarks, one h1, ordered headings, skip link and aria-current navigation. Menu/dialog focus must be trapped only while appropriate, Escape closes non-destructive overlays, and focus returns to the trigger. Validation uses persistent labels, aria-describedby and a focusable error summary; asynchronous status uses restrained live announcements. Gallery images have meaningful owner-authored alt text or explicit decorative treatment. Editor toolbar is keyboard accessible and field instructions explain shortcuts; all reorder operations have button equivalents.

Required future checks: keyboard-only create/save/preview/publish/restore; refresh and direct-link project routes; no hover on touch; 320px viewport and 400% zoom; reduced motion; screen-reader labels/status/errors; upload cancel/failure; session expiry with dirty content; two-session revision conflict; timeout after publish; published snapshot unchanged while draft edited. Security enforcement, upload validation and private-media authorization require backend/QA tests; UX controls alone do not establish protection.

## Handoff and unresolved decisions

Primary/BA: required fields, limits, slug change/redirect policy, ordering, trash retention, unpublish semantics, draft/published snapshot contract, preview persistence, auth recovery and unresolved request reconciliation. Backend/cloud: upload cancellation/cleanup lifecycle, private preview delivery and revision conflict responses. Frontend: accessible block editor choice, shared public renderer, route focus, form buffer handling and error mapping. QA: execute state matrix with isolated fixtures only. No new external resource, production content change, migration deletion, PR or release is authorized by this document.
