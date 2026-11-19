import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { draft, uuid } from '../backend/src/cms/validation.js';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => structuredClone(value);
const defaultMigration = () =>
  JSON.parse(
    readFileSync(
      new URL('../content/migrations/airline-point.json', import.meta.url),
      'utf8',
    ),
  );

export class AirlinePointImportError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const requireValue = (value, code) => {
  if (!value) throw new AirlinePointImportError(code);
};
const idFor = (owner, operation, kind) => {
  const hex = digest(JSON.stringify([owner, operation, kind]));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

export function planAirlinePointImport({
  ownerSub,
  operations,
  coverBytes,
  migration = defaultMigration(),
}) {
  requireValue(
    typeof ownerSub === 'string' &&
      ownerSub.length > 0 &&
      ownerSub.length <= 128 &&
      !/\s/.test(ownerSub),
    'INVALID_OWNER',
  );
  requireValue(
    operations &&
      isDeepStrictEqual(Object.keys(operations).sort(), [
        'create',
        'media',
        'save',
      ]) &&
      Object.values(operations).every(uuid) &&
      new Set(Object.values(operations)).size === 3,
    'INVALID_OPERATIONS',
  );
  requireValue(
    migration?.schemaVersion === 1 &&
      migration.cover?.contentType === 'image/png' &&
      Number.isInteger(migration.cover.size) &&
      migration.cover.size > 0 &&
      migration.cover.size <= 5 * 1024 * 1024 &&
      /^[a-f0-9]{64}$/.test(migration.cover.sha256) &&
      Buffer.isBuffer(coverBytes) &&
      coverBytes.length === migration.cover.size &&
      digest(coverBytes) === migration.cover.sha256,
    'COVER_MISMATCH',
  );
  const initialDraft = draft(migration.draft);
  requireValue(
    initialDraft.slug === 'airline-point' &&
      initialDraft.coverMediaId === null &&
      initialDraft.blocks.every((block) => block.type !== 'image'),
    'INVALID_MIGRATION',
  );
  const projectId = idFor(ownerSub, operations.create, 'project');
  const mediaId = idFor(ownerSub, operations.media, 'media');
  const plan = {
    schemaVersion: 1,
    ownerSub,
    operations: clone(operations),
    projectId,
    mediaId,
    initialDraft,
    finalDraft: { ...clone(initialDraft), coverMediaId: mediaId },
    cover: {
      contentType: migration.cover.contentType,
      size: migration.cover.size,
      sha256: migration.cover.sha256,
    },
  };
  return { ...plan, planSha256: digest(JSON.stringify(plan)) };
}

export async function importAirlinePointDraft({
  plan,
  coverBytes,
  request,
  upload,
  download,
  onProgress = () => {},
  migration = defaultMigration(),
}) {
  const expected = planAirlinePointImport({
    ownerSub: plan?.ownerSub,
    operations: plan?.operations,
    coverBytes,
    migration,
  });
  requireValue(isDeepStrictEqual(plan, expected), 'PLAN_MISMATCH');
  plan = expected;
  coverBytes = Buffer.from(coverBytes);
  requireValue(
    [request, upload, download, onProgress].every(
      (value) => typeof value === 'function',
    ),
    'INVALID_TRANSPORT',
  );
  async function call(path, method = 'GET', body, statuses = [200]) {
    let result;
    try {
      result = await request(path, { method, body });
    } catch {
      throw new AirlinePointImportError(
        'REQUEST_FAILED_CHECK_STATE_BEFORE_RETRY',
      );
    }
    requireValue(statuses.includes(result?.status), 'API_REQUEST_REJECTED');
    return result;
  }
  const projectPath = `/admin/projects/${plan.projectId}`;
  const publicPath = `/public/projects/${plan.initialDraft.slug}`;
  const mediaPath = `/admin/media/${plan.mediaId}`;
  function state(row) {
    requireValue(
      row?.id === plan.projectId &&
        row.trashedAt === null &&
        row.publishedRevision === null,
      'TARGET_NOT_PRIVATE_ACTIVE_DRAFT',
    );
    if (row.revision === 1 && isDeepStrictEqual(row.draft, plan.initialDraft))
      return 'initial';
    if (row.revision === 2 && isDeepStrictEqual(row.draft, plan.finalDraft))
      return 'complete';
    throw new AirlinePointImportError('TARGET_CHANGED_STOP_FOR_REVIEW');
  }
  async function assertPrivate() {
    const response = await call(publicPath, 'GET', undefined, [200, 404]);
    requireValue(response.status === 404, 'SLUG_ALREADY_PUBLIC');
  }
  async function assertNoOtherProject() {
    const normalizedTitle = (value) =>
      value.normalize('NFKC').trim().toLowerCase();
    const normalizedDemo = (value) => {
      if (!value) return null;
      try {
        const url = new URL(value);
        return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
      } catch {
        return null;
      }
    };
    const title = normalizedTitle(plan.initialDraft.title);
    const demo = normalizedDemo(plan.initialDraft.demoUrl);
    for (const trash of [false, true]) {
      let cursor = null;
      const seen = new Set();
      do {
        const response = await call(
          `/admin/projects?trash=${trash}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
        );
        const page = response.body;
        requireValue(Array.isArray(page?.items), 'INVALID_PROJECT_COLLECTION');
        for (const item of page.items) {
          requireValue(
            typeof item?.id === 'string' &&
              typeof item?.draft?.slug === 'string' &&
              typeof item.draft.title === 'string' &&
              typeof item.draft.demoUrl === 'string',
            'INVALID_PROJECT_COLLECTION',
          );
          requireValue(
            item.draft.slug !== plan.initialDraft.slug ||
              item.id === plan.projectId,
            'EXISTING_SLUG_STOP_FOR_REVIEW',
          );
          requireValue(
            item.id === plan.projectId ||
              (normalizedTitle(item.draft.title) !== title &&
                (!demo || normalizedDemo(item.draft.demoUrl) !== demo)),
            'EXISTING_PROJECT_STOP_FOR_REVIEW',
          );
        }
        cursor = page.nextCursor;
        requireValue(
          cursor === null ||
            (typeof cursor === 'string' &&
              cursor.length > 0 &&
              cursor.length <= 8192),
          'INVALID_PROJECT_PAGINATION',
        );
        if (cursor) {
          requireValue(
            !seen.has(cursor) && seen.size < 100,
            'INVALID_PROJECT_PAGINATION',
          );
          seen.add(cursor);
        }
      } while (cursor);
    }
  }
  async function verifyMedia() {
    const response = await call(mediaPath, 'GET', undefined, [200, 404]);
    if (response.status === 404) return false;
    requireValue(
      typeof response.body?.url === 'string',
      'INVALID_MEDIA_RESPONSE',
    );
    let image;
    try {
      image = await download(response.body.url);
    } catch {
      throw new AirlinePointImportError('MEDIA_DOWNLOAD_FAILED');
    }
    requireValue(
      image?.status === 200 &&
        Buffer.isBuffer(image.bytes) &&
        image.bytes.length === plan.cover.size &&
        digest(image.bytes) === plan.cover.sha256,
      'VERIFIED_MEDIA_MISMATCH',
    );
    return true;
  }

  await assertPrivate();
  await assertNoOtherProject();
  let row;
  const existing = await call(projectPath, 'GET', undefined, [200, 404]);
  if (existing.status === 404) {
    row = (
      await call(
        '/admin/projects',
        'POST',
        {
          operationId: plan.operations.create,
          draft: plan.initialDraft,
        },
        [201],
      )
    ).body?.project;
  } else row = existing.body?.project;
  let currentState = state(row);
  onProgress('draft-identified');

  let verified = await verifyMedia();
  requireValue(
    currentState !== 'complete' || verified,
    'COMPLETED_DRAFT_MEDIA_MISSING',
  );
  if (!verified) {
    const grant = (
      await call(
        '/admin/media',
        'POST',
        {
          operationId: plan.operations.media,
          contentType: plan.cover.contentType,
          size: plan.cover.size,
        },
        [201],
      )
    ).body;
    requireValue(
      grant?.mediaId === plan.mediaId &&
        typeof grant.uploadUrl === 'string' &&
        grant.headers?.['Content-Type'] === plan.cover.contentType,
      'INVALID_UPLOAD_GRANT',
    );
    let result;
    try {
      result = await upload(grant.uploadUrl, {
        headers: { 'Content-Type': plan.cover.contentType },
        bytes: coverBytes,
      });
    } catch {
      throw new AirlinePointImportError(
        'MEDIA_UPLOAD_FAILED_CHECK_STATE_BEFORE_RETRY',
      );
    }
    requireValue(result?.status === 200, 'MEDIA_UPLOAD_REJECTED');
    const completed = (await call(`${mediaPath}/complete`, 'POST', {})).body;
    requireValue(
      completed?.mediaId === plan.mediaId && completed.verified === true,
      'MEDIA_COMPLETION_REJECTED',
    );
    verified = await verifyMedia();
    requireValue(verified, 'MEDIA_VERIFICATION_MISSING');
  }
  onProgress('cover-verified');
  row = (await call(projectPath)).body?.project;
  currentState = state(row);
  if (currentState === 'initial') {
    row = (
      await call(projectPath, 'PUT', {
        operationId: plan.operations.save,
        expectedRevision: 1,
        draft: plan.finalDraft,
      })
    ).body?.project;
    requireValue(state(row) === 'complete', 'SAVE_RESPONSE_MISMATCH');
  }
  const saved = (await call(projectPath)).body?.project;
  requireValue(state(saved) === 'complete', 'DRAFT_READBACK_MISMATCH');
  await assertPrivate();
  onProgress('draft-ready');
  return {
    status: 'draft-ready',
    projectId: plan.projectId,
    mediaId: plan.mediaId,
    slug: plan.finalDraft.slug,
    revision: saved.revision,
    publishedRevision: null,
    coverSha256: plan.cover.sha256,
  };
}
