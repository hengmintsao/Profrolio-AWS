import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createApp } from '../src/cms/app.js';
import { memoryStore } from '../src/cms/store.js';
import { memoryMedia } from '../src/cms/media.js';
function fixture() {
  const store = memoryStore(),
    media = memoryMedia('/api'),
    app = createApp({ store, media, local: true, clientId: 'client' });
  const call = async (method, path, body) => {
    const r = await app({
      method,
      path,
      token: 'local-owner',
      rawBody: body === undefined ? '' : JSON.stringify(body),
    });
    return { ...r, json: r.body ? JSON.parse(r.body) : null };
  };
  return { store, media, call };
}
async function png(color) {
  return sharp({
    create: { width: 2, height: 2, channels: 3, background: color },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
}
async function verified(f, bytes) {
  const r = await f.call('POST', '/admin/media', {
    operationId: randomUUID(),
    contentType: 'image/png',
    size: bytes.length,
  });
  assert.equal(r.statusCode, 201);
  await f.media.upload(r.json.uploadUrl.split('/').at(-1), bytes, 'image/png');
  assert.equal(
    (await f.call('POST', `/admin/media/${r.json.mediaId}/complete`, {}))
      .statusCode,
    200,
  );
  return r.json;
}
const draftFor = (slug, mediaId) => ({
  slug,
  title: 'A',
  summary: 'summary',
  coverMediaId: mediaId,
  coverAlt: 'alt',
  blocks: [{ type: 'paragraph', text: 'body' }],
});
test('QA: verified media bytes survive a late overwrite through the original upload lease', async () => {
  const f = fixture(),
    original = await png('#ff0000'),
    replacement = await png('#0000ff'),
    upload = await verified(f, original);
  assert.equal(replacement.length, original.length);
  await f.media.upload(
    upload.uploadUrl.split('/').at(-1),
    replacement,
    'image/png',
  );
  assert.deepEqual(
    await f.media.readIncoming(upload.mediaId),
    replacement,
    'The incoming object really was replaced',
  );
  const url = await f.media.sign(upload.mediaId),
    result = await f.media.readSigned(url.split('/').at(-1));
  assert.deepEqual(
    result.bytes,
    original,
    'Verified bytes must remain an independent immutable copy',
  );
});
test('QA: competing publication requests at one revision cannot both commit', async () => {
  const f = fixture(),
    upload = await verified(f, await png('#ff0000'));
  const created = await f.call('POST', '/admin/projects', {
    operationId: randomUUID(),
    draft: draftFor('qa-race', upload.mediaId),
  });
  assert.equal(created.statusCode, 201);
  const p = created.json.project;
  const requests = await Promise.all(
    [1, 2].map(() =>
      f.call('POST', `/admin/projects/${p.id}/publish`, {
        operationId: randomUUID(),
        expectedRevision: p.revision,
      }),
    ),
  );
  assert.deepEqual(
    requests.map((r) => r.statusCode).sort((a, b) => a - b),
    [200, 409],
  );
  const visible = await f.call('GET', '/public/projects/qa-race');
  assert.equal(visible.statusCode, 200);
  assert.equal(visible.json.project.title, 'A');
});
test('QA: stale GSI candidates cannot resurrect a trashed publication', async () => {
  const f = fixture(),
    u = await verified(f, await png('#ff0000'));
  const c = await f.call('POST', '/admin/projects', {
    operationId: randomUUID(),
    draft: draftFor('qa-stale', u.mediaId),
  });
  assert.equal(c.statusCode, 201);
  const p = c.json.project;
  const published = await f.call('POST', `/admin/projects/${p.id}/publish`, {
    operationId: randomUUID(),
    expectedRevision: p.revision,
  });
  assert.equal(published.statusCode, 200);
  const stale = await f.store.get('PUBLIC#qa-stale');
  assert.ok(stale?.project);
  const trashed = await f.call('POST', `/admin/projects/${p.id}/trash`, {
    operationId: randomUUID(),
    expectedRevision: published.json.project.revision,
  });
  assert.equal(trashed.statusCode, 200);
  const laggingStore = {
      ...f.store,
      list: async () => ({ items: [stale], nextCursor: null }),
    },
    laggingApp = createApp({
      store: laggingStore,
      media: f.media,
      local: true,
      clientId: 'client',
    });
  const result = await laggingApp({
    method: 'GET',
    path: '/public/projects',
    rawBody: '',
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body).items, []);
  const restored = await f.call('POST', `/admin/projects/${p.id}/restore`, {
    operationId: randomUUID(),
    expectedRevision: trashed.json.project.revision,
  });
  assert.equal(restored.statusCode, 200);
  assert.equal(
    (await f.call('GET', '/public/projects/qa-stale')).statusCode,
    404,
  );
});
test('QA: stale writes and a newer draft cannot replace the public snapshot', async () => {
  const f = fixture(),
    u = await verified(f, await png('#ff0000')),
    draft = draftFor('qa-private', u.mediaId);
  const c = await f.call('POST', '/admin/projects', {
    operationId: randomUUID(),
    draft,
  });
  assert.equal(c.statusCode, 201);
  const p = c.json.project;
  const published = await f.call('POST', `/admin/projects/${p.id}/publish`, {
    operationId: randomUUID(),
    expectedRevision: p.revision,
  });
  assert.equal(published.statusCode, 200);
  const saved = await f.call('PUT', `/admin/projects/${p.id}`, {
    operationId: randomUUID(),
    expectedRevision: published.json.project.revision,
    draft: { ...draft, title: 'Private B' },
  });
  assert.equal(saved.statusCode, 200);
  for (const action of ['publish', 'trash'])
    assert.equal(
      (
        await f.call('POST', `/admin/projects/${p.id}/${action}`, {
          operationId: randomUUID(),
          expectedRevision: p.revision,
        })
      ).statusCode,
      409,
      action,
    );
  assert.equal(
    (
      await f.call('PUT', `/admin/projects/${p.id}`, {
        operationId: randomUUID(),
        expectedRevision: p.revision,
        draft: { ...draft, title: 'Stale C' },
      })
    ).statusCode,
    409,
  );
  const detail = await f.call('GET', '/public/projects/qa-private');
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json.project.title, 'A');
  const list = await f.call('GET', '/public/projects');
  assert.equal(list.statusCode, 200);
  assert.equal(list.json.items.find((item) => item.id === p.id).title, 'A');
});
