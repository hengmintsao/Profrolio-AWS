import { createHash } from 'node:crypto';
import {
  ApiError,
  fail,
  uuid,
  object,
  draft,
  mediaIds,
  publishable,
  mutation,
} from './validation.js';
import { MAX_MEDIA_BYTES, verifyImage } from './media.js';
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const idFor = (owner, operation, kind) => {
  const hex = hash([owner, operation, kind]);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const admin = (row) => ({
  id: row.id,
  revision: row.revision,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  trashedAt: row.trashedAt,
  publishedRevision: row.publishedRevision,
  draft: row.draft,
});
const publicProject = (row) => row.project;
const response = (status, body, headers = {}) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...headers,
  },
  body: body === undefined ? '' : JSON.stringify(body),
});
export function createApp({
  store,
  media,
  clock = () => new Date().toISOString(),
  clientId,
  local = false,
}) {
  function ownerFor(request) {
    if (local && request.token === 'local-owner') return 'local-owner';
    const claims = request.claims;
    if (!claims || !claims.sub || claims.token_use !== 'access')
      fail(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    let groups = claims['cognito:groups'];
    if (typeof groups === 'string') {
      try {
        groups = JSON.parse(groups);
      } catch {
        groups = groups
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map((value) => value.trim());
      }
    }
    if (
      !clientId ||
      claims.client_id !== clientId ||
      !Array.isArray(groups) ||
      !groups.includes('portfolio-admin')
    )
      fail(403, 'FORBIDDEN', 'Owner permission required.');
    return claims.sub;
  }
  async function owned(id, owner) {
    if (!uuid(id)) fail(404, 'NOT_FOUND', 'Project unavailable.');
    const row = await store.get(`PROJECT#${id}`);
    if (!row || row.owner !== owner)
      fail(404, 'NOT_FOUND', 'Project unavailable.');
    return row;
  }
  async function availableMedia(ids, owner) {
    for (const id of ids) {
      const row = await store.get(`MEDIA#${id}`);
      if (!row || row.owner !== owner || !row.verified)
        fail(
          400,
          'INVALID_MEDIA',
          'Referenced media is unavailable or unverified.',
        );
    }
  }
  async function reserve(slug, id, owner) {
    if (!slug) return [];
    const pk = `SLUG#${slug}`,
      existing = await store.get(pk);
    if (existing && (existing.id !== id || existing.owner !== owner))
      fail(409, 'SLUG_CONFLICT', 'This slug is already reserved.');
    return existing ? [] : [{ pk, absent: true, value: { pk, id, owner } }];
  }
  return async (request) => {
    try {
      const method = request.method.toUpperCase(),
        path = request.path.replace(/\/$/, '') || '/',
        parts = path.split('/').filter(Boolean);
      if (request.rawBody && Buffer.byteLength(request.rawBody) > 96 * 1024)
        fail(413, 'TOO_LARGE', 'Request exceeds 96 KiB.');
      let body = {};
      if (request.rawBody) {
        try {
          body = JSON.parse(request.rawBody);
        } catch {
          fail(400, 'VALIDATION', 'Invalid JSON.');
        }
      }
      if (method === 'OPTIONS') {
        if (
          parts.length >= 2 &&
          (parts[0] === 'admin' || parts[0] === 'public')
        )
          return response(204);
        fail(404, 'NOT_FOUND', 'Route unavailable.');
      }
      const query = request.query || {};
      if (
        parts[0] === 'public' &&
        parts[1] === 'projects' &&
        method === 'GET'
      ) {
        if (parts.length === 2) {
          const page = await store.list('PUBLIC', query.cursor);
          const items = [];
          for (const stale of page.items) {
            const current = await store.get(stale.pk);
            if (current?.project) items.push(publicProject(current));
          }
          items.sort(
            (a, b) =>
              a.displayOrder - b.displayOrder || a.id.localeCompare(b.id),
          );
          return response(200, { items, nextCursor: page.nextCursor });
        }
        if (
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[2]) ||
          parts[2].length > 80
        )
          fail(404, 'NOT_FOUND', 'Project unavailable.');
        const snapshot = await store.get(`PUBLIC#${parts[2]}`);
        if (!snapshot) fail(404, 'NOT_FOUND', 'Project unavailable.');
        if (parts.length === 3)
          return response(200, { project: publicProject(snapshot) });
        if (
          parts.length === 5 &&
          parts[3] === 'media' &&
          mediaIds(snapshot.project).includes(parts[4])
        )
          return response(302, undefined, {
            Location: await media.sign(parts[4]),
          });
        fail(404, 'NOT_FOUND', 'Media unavailable.');
      }
      if (parts[0] !== 'admin') fail(404, 'NOT_FOUND', 'Route unavailable.');
      const owner = ownerFor(request);
      if (parts[1] === 'projects') {
        if (parts.length === 2 && method === 'GET') {
          const page = await store.list(
            query.trash === 'true' ? 'TRASH' : 'ACTIVE',
            query.cursor,
          );
          const items = [];
          for (const stale of page.items) {
            const row = await store.get(stale.pk);
            if (
              row?.owner === owner &&
              Boolean(row.trashedAt) === (query.trash === 'true')
            )
              items.push(admin(row));
          }
          return response(200, { items, nextCursor: page.nextCursor });
        }
        if (parts.length === 2 && method === 'POST') {
          object(body, ['operationId', 'draft']);
          if (!uuid(body.operationId))
            fail(400, 'VALIDATION', 'Operation ID required.');
          const value = draft(body.draft),
            id = idFor(owner, body.operationId, 'project'),
            pk = `PROJECT#${id}`,
            fingerprint = hash(['create', value]),
            existing = await store.get(pk);
          if (existing) {
            if (existing.createHash !== fingerprint)
              fail(
                409,
                'OPERATION_CONFLICT',
                'Operation ID was used for different content.',
              );
            return response(201, { project: admin(existing) });
          }
          const now = clock(),
            row = {
              pk,
              id,
              owner,
              revision: 1,
              createdAt: now,
              updatedAt: now,
              trashedAt: null,
              publishedRevision: null,
              draft: value,
              gsiPk: 'ACTIVE',
              gsiSk: id,
              createHash: fingerprint,
              lastOperation: { id: body.operationId, hash: fingerprint },
            };
          await store.commit([
            ...(await reserve(value.slug, id, owner)),
            { pk, absent: true, value: row },
          ]);
          return response(201, { project: admin(row) });
        }
        if (parts.length >= 3) {
          const row = await owned(parts[2], owner);
          if (parts.length === 3 && method === 'GET')
            return response(200, { project: admin(row) });
          const action =
            parts.length === 3 && method === 'PUT'
              ? 'save'
              : parts.length === 4 && method === 'POST'
                ? parts[3]
                : null;
          if (
            !['save', 'publish', 'unpublish', 'trash', 'restore'].includes(
              action,
            )
          )
            fail(404, 'NOT_FOUND', 'Route unavailable.');
          mutation(body, action === 'save');
          const value = action === 'save' ? draft(body.draft) : row.draft;
          const fingerprint = hash([
            action,
            body.expectedRevision,
            action === 'save' ? value : null,
          ]);
          if (row.lastOperation?.id === body.operationId) {
            if (row.lastOperation.hash !== fingerprint)
              fail(
                409,
                'OPERATION_CONFLICT',
                'Operation ID was used for another change.',
              );
            return response(200, { project: admin(row) });
          }
          if (row.revision !== body.expectedRevision)
            fail(
              409,
              'REVISION_CONFLICT',
              'A newer revision exists. Reload before retrying.',
            );
          if (row.trashedAt && action !== 'restore')
            fail(409, 'TRASHED', 'Restore this project before editing.');
          if (!row.trashedAt && action === 'restore')
            fail(409, 'CONFLICT', 'Project is not in trash.');
          if (
            action === 'save' &&
            row.publishedRevision !== null &&
            value.slug !== row.draft.slug
          )
            fail(409, 'SLUG_IMMUTABLE', 'Unpublish before changing the slug.');
          const now = clock(),
            next = {
              ...row,
              draft: value,
              revision: row.revision + 1,
              updatedAt: now,
              lastOperation: { id: body.operationId, hash: fingerprint },
            };
          const changes =
            action === 'save' ? await reserve(value.slug, row.id, owner) : [];
          if (action === 'publish') {
            publishable(value);
            await availableMedia(mediaIds(value), owner);
            next.publishedRevision = next.revision;
            const pk = `PUBLIC#${value.slug}`;
            changes.push({
              pk,
              value: {
                pk,
                gsiPk: 'PUBLIC',
                gsiSk: `${String(value.displayOrder).padStart(4, '0')}#${row.id}`,
                project: {
                  id: row.id,
                  revision: next.revision,
                  publishedAt: now,
                  ...value,
                },
              },
            });
          }
          if (
            ['unpublish', 'trash'].includes(action) &&
            row.publishedRevision !== null
          ) {
            changes.push({ pk: `PUBLIC#${row.draft.slug}` });
            next.publishedRevision = null;
          }
          if (action === 'trash') {
            next.trashedAt = now;
            next.gsiPk = 'TRASH';
          }
          if (action === 'restore') {
            next.trashedAt = null;
            next.gsiPk = 'ACTIVE';
            next.publishedRevision = null;
          }
          await store.commit([
            ...changes,
            { pk: row.pk, revision: row.revision, owner, value: next },
          ]);
          return response(200, { project: admin(next) });
        }
      }
      if (parts[1] === 'media') {
        if (parts.length === 2 && method === 'POST') {
          object(body, ['contentType', 'size', 'operationId']);
          if (
            !uuid(body.operationId) ||
            !['image/jpeg', 'image/png', 'image/webp'].includes(
              body.contentType,
            ) ||
            !Number.isInteger(body.size) ||
            body.size < 1 ||
            body.size > MAX_MEDIA_BYTES
          )
            fail(400, 'VALIDATION', 'Unsupported image type or size.');
          const id = idFor(owner, body.operationId, 'media'),
            pk = `MEDIA#${id}`,
            existing = await store.get(pk);
          if (
            existing &&
            (existing.contentType !== body.contentType ||
              existing.size !== body.size)
          )
            fail(
              409,
              'OPERATION_CONFLICT',
              'Operation ID was used for another image.',
            );
          if (!existing)
            await store.commit([
              {
                pk,
                absent: true,
                value: {
                  pk,
                  id,
                  owner,
                  contentType: body.contentType,
                  size: body.size,
                  verified: false,
                  revision: 1,
                },
              },
            ]);
          return response(201, {
            mediaId: id,
            ...(await media.grant(id, body.contentType, body.size)),
          });
        }
        if (parts.length >= 3 && uuid(parts[2])) {
          const row = await store.get(`MEDIA#${parts[2]}`);
          if (!row || row.owner !== owner)
            fail(404, 'NOT_FOUND', 'Media unavailable.');
          if (parts.length === 3 && method === 'GET') {
            if (!row.verified) fail(404, 'NOT_FOUND', 'Media unavailable.');
            return response(200, {
              url: await media.sign(row.id),
              expiresIn: 60,
            });
          }
          if (
            parts.length === 4 &&
            parts[3] === 'complete' &&
            method === 'POST'
          ) {
            object(body, []);
            if (!row.verified) {
              const bytes = await media.readIncoming(row.id);
              if (bytes.length !== row.size)
                fail(
                  400,
                  'INVALID_MEDIA',
                  'Image size differs from upload grant.',
                );
              const verified = await verifyImage(bytes, row.contentType);
              await media.writeVerified(row.id, verified, row.contentType);
              try {
                await store.commit([
                  {
                    pk: row.pk,
                    revision: row.revision,
                    owner,
                    value: {
                      ...row,
                      verified: true,
                      revision: row.revision + 1,
                    },
                  },
                ]);
              } catch (error) {
                if (
                  !(error instanceof ApiError) ||
                  error.status !== 409 ||
                  !(await store.get(row.pk))?.verified
                )
                  throw error;
              }
            }
            return response(200, { mediaId: row.id, verified: true });
          }
        }
      }
      fail(404, 'NOT_FOUND', 'Route unavailable.');
    } catch (error) {
      if (error instanceof ApiError)
        return response(error.status, {
          error: { code: error.code, message: error.message },
        });
      return response(503, {
        error: {
          code: 'DEPENDENCY_FAILURE',
          message:
            'Service temporarily unavailable. Retry after checking the saved state.',
        },
      });
    }
  };
}
