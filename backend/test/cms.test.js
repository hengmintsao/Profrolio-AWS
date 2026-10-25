import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { S3Client } from '@aws-sdk/client-s3';
import { createApp } from '../src/cms/app.js';
import { memoryStore } from '../src/cms/store.js';
import { memoryMedia, s3Media } from '../src/cms/media.js';
const json = (result) => (result.body ? JSON.parse(result.body) : null);
function fixture() {
  const store = memoryStore(),
    media = memoryMedia('/api'),
    app = createApp({ store, media, local: true, clientId: 'client' });
  const call = (method, path, body, token = 'local-owner', claims) =>
    app({
      method,
      path,
      token,
      claims,
      rawBody: body === undefined ? '' : JSON.stringify(body),
    });
  async function create(draft = {}) {
    const result = await call('POST', '/admin/projects', {
      operationId: randomUUID(),
      draft,
    });
    assert.equal(result.statusCode, 201);
    return json(result).project;
  }
  const mutate = (project, action, extra = {}) =>
    call(
      action === 'save' ? 'PUT' : 'POST',
      `/admin/projects/${project.id}${action === 'save' ? '' : `/${action}`}`,
      {
        operationId: randomUUID(),
        expectedRevision: project.revision,
        ...extra,
      },
    );
  async function upload() {
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    const grant = json(
      await call('POST', '/admin/media', {
        operationId: randomUUID(),
        contentType: 'image/png',
        size: bytes.length,
      }),
    );
    assert.ok(grant.uploadUrl.startsWith('/api/dev/uploads/'));
    await media.upload(grant.uploadUrl.split('/').at(-1), bytes, 'image/png');
    assert.equal(
      (await call('POST', `/admin/media/${grant.mediaId}/complete`, {}))
        .statusCode,
      200,
    );
    return grant.mediaId;
  }
  return { store, media, app, call, create, mutate, upload };
}
const content = (mediaId) => ({
  slug: 'case-study',
  title: 'Original',
  summary: 'Summary',
  coverMediaId: mediaId,
  coverAlt: 'Example',
  blocks: [{ type: 'paragraph', text: 'Case study' }],
});
test('published snapshots isolate edits; trash and restore remain private', async () => {
  const f = fixture(),
    mediaId = await f.upload();
  let project = await f.create(content(mediaId));
  assert.equal(
    (await f.call('GET', '/public/projects/case-study')).statusCode,
    404,
  );
  assert.equal(
    (await f.call('GET', `/public/projects/case-study/media/${mediaId}`))
      .statusCode,
    404,
  );
  project = json(await f.mutate(project, 'publish')).project;
  assert.equal(
    (await f.call('GET', `/public/projects/case-study/media/${mediaId}`))
      .statusCode,
    302,
  );
  const live = json(await f.call('GET', '/public/projects/case-study')).project;
  assert.equal(live.title, 'Original');
  assert.equal('owner' in live, false);
  assert.equal('draft' in live, false);
  project = json(
    await f.mutate(project, 'save', {
      draft: { ...project.draft, title: 'Unpublished edit' },
    }),
  ).project;
  assert.equal(
    json(await f.call('GET', '/public/projects/case-study')).project.title,
    'Original',
  );
  assert.equal(
    (
      await f.mutate(project, 'save', {
        draft: { ...project.draft, slug: 'different' },
      })
    ).statusCode,
    409,
  );
  project = json(
    await f.mutate(project, 'save', { draft: { ...project.draft, title: '' } }),
  ).project;
  assert.equal((await f.mutate(project, 'publish')).statusCode, 400);
  assert.equal(
    json(await f.call('GET', '/public/projects/case-study')).project.title,
    'Original',
  );
  project = json(await f.mutate(project, 'trash')).project;
  assert.equal(
    (await f.call('GET', '/public/projects/case-study')).statusCode,
    404,
  );
  assert.equal(
    (await f.call('GET', `/public/projects/case-study/media/${mediaId}`))
      .statusCode,
    404,
  );
  assert.equal((await f.mutate(project, 'publish')).statusCode, 409);
  assert.equal(
    (
      await f.call('POST', '/admin/projects', {
        operationId: randomUUID(),
        draft: { slug: 'case-study' },
      })
    ).statusCode,
    409,
  );
  project = json(await f.mutate(project, 'restore')).project;
  assert.equal(project.publishedRevision, null);
  assert.equal(project.trashedAt, null);
  assert.equal(
    (await f.call('GET', '/public/projects/case-study')).statusCode,
    404,
  );
});
test('retry identities and stale revisions cannot overwrite newer state', async () => {
  const f = fixture(),
    request = { operationId: randomUUID(), draft: { title: 'First' } };
  const first = json(await f.call('POST', '/admin/projects', request)).project;
  assert.equal(
    json(await f.call('POST', '/admin/projects', request)).project.id,
    first.id,
  );
  assert.equal(
    (
      await f.call('POST', '/admin/projects', {
        ...request,
        draft: { title: 'Different' },
      })
    ).statusCode,
    409,
  );
  const change = {
      operationId: randomUUID(),
      expectedRevision: first.revision,
      draft: { title: 'Saved' },
    },
    path = `/admin/projects/${first.id}`;
  const saved = json(await f.call('PUT', path, change)).project;
  assert.equal(
    json(await f.call('PUT', path, change)).project.revision,
    saved.revision,
  );
  assert.equal(
    (
      await f.call('PUT', path, {
        ...change,
        draft: { title: 'Reused operation' },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await f.mutate(first, 'save', { draft: { title: 'Stale' } })).statusCode,
    409,
  );
  assert.equal(json(await f.call('GET', path)).project.draft.title, 'Saved');
});
test('production rejects local authentication and enforces owner boundaries', async () => {
  const f = fixture(),
    project = await f.create(),
    mediaId = await f.upload();
  assert.equal(
    (await f.call('GET', '/admin/projects', undefined, '')).statusCode,
    401,
  );
  const production = createApp({
      store: f.store,
      media: f.media,
      clientId: 'client',
    }),
    request = { method: 'GET', path: '/admin/projects', token: 'local-owner' };
  assert.equal((await production(request)).statusCode, 401);
  const claims = {
    sub: 'other-owner',
    token_use: 'access',
    client_id: 'client',
    'cognito:groups': ['portfolio-admin'],
  };
  assert.equal(
    (await production({ ...request, claims: { ...claims, token_use: 'id' } }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await production({
        ...request,
        claims: { ...claims, client_id: 'wrong' },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await production({
        ...request,
        claims: { ...claims, 'cognito:groups': ['viewer'] },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await production({
        ...request,
        claims,
        path: `/admin/projects/${project.id}`,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (await production({ ...request, claims, path: `/admin/media/${mediaId}` }))
      .statusCode,
    404,
  );
  assert.deepEqual(json(await production({ ...request, claims })).items, []);
});
test('validation rejects mass assignment, query objects, unsafe URLs and oversized input', async () => {
  const f = fixture();
  for (const draft of [
    { title: { $ne: null } },
    { owner: 'attacker' },
    { demoUrl: 'javascript:alert(1)' },
    { slug: 'a OR pk = :x' },
    { blocks: [{ type: 'html', text: '<script>' }] },
    { featured: 'true' },
    { blocks: [{ type: 'paragraph', text: 'x', html: 'bad' }] },
  ])
    assert.equal(
      (
        await f.call('POST', '/admin/projects', {
          operationId: randomUUID(),
          draft,
        })
      ).statusCode,
      400,
    );
  assert.equal(
    (
      await f.app({
        method: 'POST',
        path: '/admin/projects',
        token: 'local-owner',
        rawBody: ' '.repeat(96 * 1024 + 1),
      })
    ).statusCode,
    413,
  );
  assert.equal(
    (
      await f.app({
        method: 'POST',
        path: '/admin/projects',
        token: 'local-owner',
        rawBody: '{',
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await f.call('POST', '/admin/projects', {
        operationId: randomUUID(),
        draft: { title: '<img src=x onerror=alert(1)>' },
      })
    ).statusCode,
    201,
  );
});
test('media rejects disguised content and foreign references', async () => {
  const f = fixture();
  assert.equal(
    (
      await f.call('POST', '/admin/media', {
        operationId: randomUUID(),
        contentType: 'image/svg+xml',
        size: 40,
      })
    ).statusCode,
    400,
  );
  const bytes = Buffer.from('<svg onload="alert(1)"/>'),
    grant = json(
      await f.call('POST', '/admin/media', {
        operationId: randomUUID(),
        contentType: 'image/png',
        size: bytes.length,
      }),
    );
  await f.media.upload(grant.uploadUrl.split('/').at(-1), bytes, 'image/png');
  assert.equal(
    (await f.call('POST', `/admin/media/${grant.mediaId}/complete`, {}))
      .statusCode,
    400,
  );
  assert.equal(
    (await f.call('GET', `/admin/media/${grant.mediaId}`)).statusCode,
    404,
  );
  let project = await f.create({ ...content(grant.mediaId), slug: 'unsafe' });
  assert.equal((await f.mutate(project, 'publish')).statusCode, 400);
  const mediaId = await f.upload();
  assert.equal(
    (await f.call('POST', `/admin/media/${mediaId}/complete`, {})).statusCode,
    200,
  );
  const row = await f.store.get(`MEDIA#${mediaId}`);
  await f.store.commit([
    { pk: row.pk, revision: row.revision, value: { ...row, owner: 'other' } },
  ]);
  project = await f.create({ ...content(mediaId), slug: 'foreign' });
  assert.equal((await f.mutate(project, 'publish')).statusCode, 400);
});
test('transaction failure preserves the live snapshot and redacts dependencies', async () => {
  const f = fixture(),
    mediaId = await f.upload();
  let project = await f.create({ ...content(mediaId), slug: 'stable' });
  project = json(await f.mutate(project, 'publish')).project;
  const app = createApp({
    store: {
      ...f.store,
      async commit() {
        throw Error('secret database token');
      },
    },
    media: f.media,
    local: true,
  });
  const result = await app({
    method: 'POST',
    path: `/admin/projects/${project.id}/unpublish`,
    token: 'local-owner',
    rawBody: JSON.stringify({
      operationId: randomUUID(),
      expectedRevision: project.revision,
    }),
  });
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.includes('secret'), false);
  assert.equal(
    (await f.call('GET', '/public/projects/stable')).statusCode,
    200,
  );
});
test('admin listings paginate and reject invalid cursors', async () => {
  const f = fixture();
  for (let i = 0; i < 32; i++) await f.create({ title: `Draft ${i}` });
  const first = json(await f.call('GET', '/admin/projects'));
  assert.equal(first.items.length, 30);
  assert.ok(first.nextCursor);
  const second = await f.app({
    method: 'GET',
    path: '/admin/projects',
    token: 'local-owner',
    query: { cursor: first.nextCursor },
  });
  assert.equal(json(second).items.length, 2);
  assert.equal(
    (
      await f.app({
        method: 'GET',
        path: '/admin/projects',
        token: 'local-owner',
        query: { cursor: 'bad' },
      })
    ).statusCode,
    400,
  );
});
test('offline presigned upload has no empty-payload checksum', async () => {
  const client = new S3Client({
    region: 'us-east-1',
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: 'offline-access',
      secretAccessKey: 'offline-secret',
    },
  });
  const grant = await s3Media('offline-private-bucket', client).grant(
      randomUUID(),
      'image/png',
      120,
    ),
    url = new URL(grant.uploadUrl);
  assert.equal(url.searchParams.has('x-amz-checksum-crc32'), false);
  assert.equal(url.searchParams.has('x-amz-sdk-checksum-algorithm'), false);
  assert.equal(url.searchParams.get('X-Amz-Expires'), '120');
  assert.ok(url.pathname.startsWith('/incoming/'));
});
