# Project CMS implementation contract

Owner: primary. Scope: local implementation and proposed AWS integration; no release authorization.
This contract resolves technical details in portfolio-cms-v1.md. Existing contact API is unchanged.

## Boundaries

New React/TypeScript application lives in `web/`; existing `frontend/` remains available for rollback.
New CMS backend lives in `backend/src/cms/`. No real content migration or seed publication.
Production API base is the SAM CMS API origin; routes below are relative to it.
Local development uses Vite `/api` proxy to a loopback-only server on port 8787.
Local owner authentication exists ONLY in that separate development server, never Lambda.
Browser runtime configuration is `window.PORTFOLIO_CONFIG` with `apiBase`, `contactUrl`,
`authDomain`, `clientId`, `redirectUri`, and `localDevelopment` (boolean, default false).
Local config uses apiBase `/api`, localDevelopment true. Missing production config fails closed.

## Representations

Project draft fields: `slug`, `title`, `summary`, `coverMediaId` (string or null),
`coverAlt`, `blocks`, `tags`, `technologies`, `demoUrl`, `repositoryUrl`, `featured`, `displayOrder`.

`featured` is retained for API compatibility and has no current discovery effect.
All published projects remain visible; `displayOrder` controls ordering. The
editor does not expose an inactive featured toggle.
Blocks are exact allowlisted objects:
`{type:'paragraph'|'heading',text}`, `{type:'list',items:string[]}`,
`{type:'image',mediaId,alt}`, `{type:'link',text,url}`. No HTML.
Plain text limits: title 120, summary 360, alt 240, slug 80, each text 4000,
at most 40 blocks, lists 20 items of 500 chars, tags 8 and technologies 16 of 40 chars.
Total serialized request maximum 96 KiB. Links optional empty strings or HTTPS only, max 2048.
Slug matches `[a-z0-9]+(?:-[a-z0-9]+)*`. displayOrder is integer 0..9999.
Drafts may have empty fields. Publish requires slug/title/summary/cover with nonempty alt
and at least one nonempty readable paragraph/heading/list/link; all media verified.
Images require nonempty alt in this version (decorative image support deferred).
Reject unknown fields, nested invalid types, duplicate media or list values where relevant.

Admin project: `{id,revision,createdAt,updatedAt,trashedAt,publishedRevision,draft}`.
`publishedRevision` null means unpublished; otherwise indicates last explicitly published draft revision.
Public project: `{id,revision,publishedAt,...draft}`; no working draft or private audit metadata.
Media links generated in UI: `${apiBase}/public/projects/${slug}/media/${mediaId}`;
private preview uses authorized admin media endpoint returning `{url,expiresIn:60}`.
UTC ISO timestamps, UUID server IDs. New projects revision 1; EVERY state mutation increments revision.
Mutation `operationId` UUID is required; server retains last operation ID/result semantics to
reconcile immediate duplicate retries. Expected revision protects later retries from overwrites.
Create uses operationId as idempotency identity (deterministic project ID), with conditional put.

## Routes

All JSON success responses use JSON objects; errors `{error:{code,message,fields?}}`.
401 unauthenticated, 403 forbidden, 404 absent/private, 409 revision/slug conflict,
400 validation, 413 too large, 503 dependency failure. Error bodies never contain raw dependencies.
Admin `Authorization: Bearer <access-token>` required; no cookie auth.

| Method and path | Request | Response |
| --- | --- | --- |
| GET /public/projects | optional `cursor` | `{items:PublicProject[],nextCursor:string|null}` |
| GET /public/projects/:slug | | `{project:PublicProject}` |
| GET /public/projects/:slug/media/:mediaId | | 302 short-lived signed private S3 GET, only current snapshot references |
| GET /admin/projects | optional `trash=true`, `cursor` | `{items:AdminProject[],nextCursor}` |
| POST /admin/projects | `{operationId,draft}` | 201 `{project:AdminProject}` |
| GET /admin/projects/:id | | `{project:AdminProject}` |
| PUT /admin/projects/:id | `{operationId,expectedRevision,draft}` | `{project:AdminProject}` |
| POST /admin/projects/:id/:action | `{operationId,expectedRevision}`; action publish/unpublish/trash/restore | `{project:AdminProject}` |
| POST /admin/media | `{contentType,size,operationId}` | 201 `{mediaId,uploadUrl,headers,expiresIn:120}` |
| POST /admin/media/:id/complete | `{}` | `{mediaId,verified:true}` |
| GET /admin/media/:id | | `{url,expiresIn:60}` |

All project listing pages are at most 30 entries; callers follow opaque nextCursor.
Sort public results by displayOrder then id after retrieving pages. GSI-backed lists may lag;
strongly consistent public snapshot read backs each public result, so unpublished content never
leaks from stale index rows. A newly initiated detail read reflects acknowledged writes immediately;
discovery convergence is subject to DynamoDB GSI eventual consistency (no guaranteed AWS time bound).
The UI distinguishes an acknowledged publication from discovery visibility, links to the
public detail page and explains that listings may need a later reload. No timed convergence
guarantee or automatic polling is implemented in v1.
All API responses Cache-Control:no-store. S3 signed links expire at 60 seconds; already downloaded
images cannot be recalled. Draft response requires admin and never uses public caches.

## State and storage

Single CMS DynamoDB table keyed `pk` (string), optional GSI `gsiPk`/`gsiSk` strings.
Store project working record `PROJECT#id`, slug reservation `SLUG#slug`, public snapshot
`PUBLIC#slug`, media metadata `MEDIA#id`. Project rows indexed by ACTIVE or TRASH; public
snapshot rows indexed by PUBLIC. Slug reservations always conditional and remain while trashed.
Published slug is immutable; unpublish before editing it. Trash atomically removes public snapshot,
restore leaves unpublished draft. No hard-delete operation or automated cleanup.
Transactional writes combine expected-revision condition, reservation and snapshot changes.
Operation retries never overwrite a newer revision. No scan requirement for normal routes.

Private upload bucket is separate from website artifacts, encrypted and fully public-blocked.
Presigned PUT targets unique `incoming/id` for at most 120 seconds; actual bytes are checked at
completion (maximum 5 MiB, JPEG/PNG/WebP signatures, MIME consistency, image decoding and pixel cap
20 megapixels via sharp). Copy verified content to immutable `verified/id` using the fetched bytes,
not a subsequent untrusted object read; completion is conditional/idempotent. Incoming key remains
untrusted and is never served. Media IDs belong to authenticated owner `sub`; publish verifies
all references belong to that owner. No arbitrary object key from client.
Public media endpoint checks current published snapshot membership, then signs verified object GET.
No media object is made public or copied into frontend deployment bucket.

## Authentication and operational limits

Cognito Hosted UI authorization-code PKCE, client without secret, no self-signup, required TOTP MFA,
admin group `portfolio-admin`. API Gateway JWT issuer/audience plus Lambda group and token_use=access
checks. Tokens remain in memory; PKCE state/verifier are temporary sessionStorage only and removed
after callback. Reload can require sign-in. Do not persist tokens or private drafts.
Hosted-domain prefix is parameterized; existing ACM/DNS/contact resources are preserved.
No credentials, AWS changes, PR, push or deployment in this implementation assignment.
Offline tests use disposable in-memory fixtures. Local disk state, if used, is gitignored and
never contains production content. Development server only binds 127.0.0.1.

## Explicit limitation

AWS GSI has no contractual bounded visibility guarantee; AC-12 is clarified to immediate detail
freshness and honest discovery-pending handling. Production deployment, IAM grants, MFA enrollment,
cloud media round trips, runtime-config injection and live acceptance require a later authorized
cutover. Review and report these gaps instead of claiming a live CMS.
