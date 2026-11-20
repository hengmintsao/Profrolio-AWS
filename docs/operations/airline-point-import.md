# Import the earlier Airline-Point project

## Scope and current state

`content/migrations/airline-point.json` preserves the existing public project's
title, summary, technologies, demo link and homepage screenshot description.
It is a one-time migration input, not a second runtime content source. The public
interface reads published CMS projects through its existing API. New projects
continue to use the normal CMS editor without code changes.

The source image remains `web/public/airline-point-home.png` (3,463,558 bytes,
SHA-256 `166a30d12dd4d47ace271f9324b613a5586c1c23ba8936d6a02c4527472e041d`).
Keep it available until the imported media and publication have been verified;
this migration does not delete that file or any existing content.

The importer creates only an unpublished, active draft and one verified cover
image. It does not publish, unpublish, trash, restore, or delete anything. A
successful local test or dry run does not establish a production import.

## Maintained module and operator boundary

`scripts/airline-point-import.mjs` exports:

- `planAirlinePointImport({ ownerSub, operations, coverBytes, migration? })`:
  validates the image digest and generates deterministic project/media IDs,
  initial/final draft bodies, and `planSha256`. Persist the three distinct UUID
  operation IDs (`create`, `media`, `save`) before making any requests.
- `importAirlinePointDraft({ plan, coverBytes, request, upload, download,
onProgress?, migration? })`: reconstructs and compares the plan, imports the
  draft through existing API validation, verifies downloaded cover bytes, and
  returns `{ status: 'draft-ready', projectId, mediaId, slug, revision,
publishedRevision: null, coverSha256 }`.

The optional `migration` override supports explicitly isolated test fixtures.
Production operators use the reviewed default JSON and screenshot. The module
contains no authentication credentials, environment-based tokens, direct
DynamoDB writes, privileged Lambda invocation, or IAM configuration changes.

The primary prepares an operator-specific interactive wrapper locally under
`.scratch/airline-point-import/`. It and its manifest/results remain Git-ignored;
they are not part of a fresh clone. Before executing a production import, review
that wrapper and its exact target/manifest independently. Never substitute copied
browser tokens or disable MFA. The operator must enter their own credentials and
Authenticator code privately, with tokens retained only in memory.

Transport callbacks have these contracts:

| Callback   | Input                                    | Output                                  |
| ---------- | ---------------------------------------- | --------------------------------------- |
| `request`  | API-relative path and `{ method, body }` | `{ status, body }`, parsed JSON         |
| `upload`   | Signed URL and `{ headers, bytes }`      | `{ status }`                            |
| `download` | Signed URL                               | `{ status, bytes }`, with a Node Buffer |

The wrapper must restrict API origin, allowed paths/methods and authenticated
owner to the reviewed manifest. It must independently restrict signed media URLs
to the exact bucket, object ID and `incoming`/`verified` prefix, use HTTPS without
redirects, and never forward the API Authorization header to object storage.
The core deliberately leaves these deployment-specific origin checks to that
reviewed transport. It logs only fixed progress labels, not signed URLs or tokens.

## Import and verification sequence

1. Confirm the deployed backend source and API, user pool/client, owner, and
   media bucket against the reviewed manifest. Confirm the cover and all source
   hashes. Run the prepared wrapper's `--dry-run`; it must not authenticate or
   make network requests.
2. Inspect the current owner project list before import. The module checks all
   active and trash pages for another project with the same slug, normalized
   title, or normalized demo URL origin/path. A manual entry is never silently
   overwritten or duplicated. A matching public slug stops the import.
3. Execute the prepared wrapper interactively with `--run` within the user's
   authorized scope. The fixed create operation reserves the slug before any
   media upload. Existing global slug reservations are enforced by the API.
4. Upload the existing PNG through its normal object-scoped grant, complete the
   backend image validation, download the verified bytes, and compare size and
   SHA-256. The draft's cover is saved only after this succeeds.
5. Read back the exact project: revision 2, expected content, active/unpublished,
   with the expected cover media ID. Verify its public project/media paths remain
   unavailable and review the private preview in the owner CMS. Confirm the title,
   description, tags, image, and demo link are editable through the existing UI.
6. Record sanitized IDs, revisions, image digest, deployment source, and results
   locally under `docs/reports/`. Do not include authentication secrets or signed
   URLs in reports. Stop on any failure; no automatic rollback or cleanup occurs.

## Retries and partial completion

Keep the same persisted plan and operation IDs. A transport failure can happen
after a server write succeeded. Inspect state before rerunning; do not generate
new IDs or assume a lost response means no data exists. Resumption accepts only
revision 1 with the exact initial draft, or revision 2 with the exact final draft.
Verified image content is downloaded and checked even when resuming.

A complete draft replay performs only GET requests. If the owner has subsequently
edited, published, or trashed that project, the importer stops for review. It will
not reset owner changes to make a rerun pass. Same-size but different verified
image bytes stop the operation; they are not overwritten or deleted. Concurrent
edits are also guarded by the API's `expectedRevision` check.

## Coordinating publication and frontend rollout

Draft import does not remove the old card from the deployed site. Removing its
hardcoded frontend representation is a separate reviewed source/deployment
change. Before that rollout, have the owner review the draft and agree on the
publication window. Publishing on the old frontend can briefly show both the old
card and the new CMS card; deploying a CMS-only frontend before publication can
leave the work collection empty. Coordinate the two operations explicitly and
verify exactly one public card and its detail/demo/media links after rollout.

Use the existing release and CMS delivery runbooks. Do not bypass source-version,
acceptance, plan/apply, user-review, or artifact checks to remove this interval.
Publication and frontend deployment require their applicable authorization.
Preserve the draft/media and previous source on failure; do not delete live
records, buckets, or stacks as a recovery shortcut.
