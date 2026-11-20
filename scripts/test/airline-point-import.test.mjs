import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createApp } from '../../backend/src/cms/app.js';
import { memoryStore } from '../../backend/src/cms/store.js';
import { memoryMedia } from '../../backend/src/cms/media.js';
import { publishable } from '../../backend/src/cms/validation.js';
import {
  AirlinePointImportError,
  planAirlinePointImport,
  importAirlinePointDraft,
} from '../airline-point-import.mjs';

const sharp = createRequire(
  new URL('../../backend/package.json', import.meta.url),
)('sharp');
const source = JSON.parse(
  readFileSync(
    new URL('../../content/migrations/airline-point.json', import.meta.url),
    'utf8',
  ),
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture({ bytes, owner = 'local-owner' } = {}) {
  bytes ??= await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#ff0000' },
  })
    .png()
    .toBuffer();
  const migration = {
    ...structuredClone(source),
    cover: { ...source.cover, size: bytes.length, sha256: hash(bytes) },
  };
  const operations = {
    create: randomUUID(),
    media: randomUUID(),
    save: randomUUID(),
  };
  const plan = planAirlinePointImport({
    ownerSub: owner,
    operations,
    coverBytes: bytes,
    migration,
  });
  const store = memoryStore();
  const media = memoryMedia('/api');
  const app = createApp({ store, media, local: true });
  const calls = [];
  const request = async (path, { method = 'GET', body } = {}) => {
    calls.push({ path, method, body });
    const parsed = new URL(path, 'https://fixture.invalid');
    const result = await app({
      path: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams),
      method,
      token: 'local-owner',
      rawBody: body === undefined ? '' : JSON.stringify(body),
    });
    return {
      status: result.statusCode,
      body: result.body ? JSON.parse(result.body) : null,
    };
  };
  const upload = async (url, { bytes, headers }) => {
    await media.upload(url.split('/').at(-1), bytes, headers['Content-Type']);
    return { status: 200 };
  };
  const download = async (url) => {
    const result = await media.readSigned(url.split('/').at(-1));
    return { status: 200, bytes: result.bytes };
  };
  const options = {
    plan,
    coverBytes: bytes,
    migration,
    request,
    upload,
    download,
  };
  return {
    options,
    plan,
    store,
    app,
    calls,
    request,
    run: (extra = {}) => importAirlinePointDraft({ ...options, ...extra }),
  };
}
const failure = (code) => (error) =>
  error instanceof AirlinePointImportError && error.code === code;

test('the existing preview image and metadata form a publishable, deterministic import plan', () => {
  const bytes = readFileSync(
    new URL('../../web/public/airline-point-home.png', import.meta.url),
  );
  const operations = {
    create: 'e2f3e647-fc8d-4ca7-9fa2-5b9d8f6ef608',
    media: '6f432373-a480-4d98-a9f4-83f4eb15b848',
    save: '23330f2b-f846-487f-9171-5ae038b9c456',
  };
  const first = planAirlinePointImport({
    ownerSub: 'owner',
    operations,
    coverBytes: bytes,
  });
  const second = planAirlinePointImport({
    ownerSub: 'owner',
    operations,
    coverBytes: bytes,
  });
  assert.deepEqual(first, second);
  assert.equal(
    first.finalDraft.demoUrl,
    'https://airline-point-website.vercel.app/',
  );
  assert.equal(first.finalDraft.repositoryUrl, '');
  assert.deepEqual(first.finalDraft.technologies, [
    'React',
    'Express',
    'MongoDB',
    'Cypress',
  ]);
  assert.equal(first.cover.size, 3463558);
  assert.equal(first.cover.sha256, source.cover.sha256);
  assert.doesNotThrow(() => publishable(first.finalDraft));
  assert.throws(
    () =>
      planAirlinePointImport({
        ownerSub: 'owner',
        operations,
        coverBytes: Buffer.from('wrong'),
      }),
    failure('COVER_MISMATCH'),
  );
});

test('imports through the real app and media verifier, retaining a private editable draft', async () => {
  const f = await fixture();
  const result = await f.run();
  assert.equal(result.status, 'draft-ready');
  assert.equal(result.revision, 2);
  assert.equal(result.publishedRevision, null);
  const row = await f.store.get(`PROJECT#${f.plan.projectId}`);
  assert.deepEqual(row.draft, f.plan.finalDraft);
  assert.equal(row.owner, 'local-owner');
  assert.equal((await f.store.get(`MEDIA#${f.plan.mediaId}`)).verified, true);
  assert.equal(await f.store.get('PUBLIC#airline-point'), undefined);
  assert.equal((await f.request('/public/projects/airline-point')).status, 404);
  assert.equal(
    (await f.request(`/public/projects/airline-point/media/${f.plan.mediaId}`))
      .status,
    404,
  );
  assert.equal(
    f.calls.some((c) =>
      /publish|unpublish|trash|restore/.test(c.path.split('?')[0]),
    ),
    false,
  );
  assert.equal(
    f.calls.some((c) => c.method === 'DELETE'),
    false,
  );
});

test('replaying the persisted plan performs no additional writes or duplicate import', async () => {
  const f = await fixture();
  await f.run();
  f.calls.length = 0;
  await f.run();
  assert.equal(
    f.calls.every((c) => c.method === 'GET'),
    true,
  );
  assert.equal((await f.store.list('ACTIVE')).items.length, 1);
  assert.equal((await f.store.get(`PROJECT#${f.plan.projectId}`)).revision, 2);
});

test('a lost create response resumes from the exact initial draft', async () => {
  const f = await fixture();
  await assert.rejects(
    f.run({
      request: async (...args) => {
        const result = await f.request(...args);
        if (args[0] === '/admin/projects' && args[1].method === 'POST')
          throw Error('Lost response');
        return result;
      },
    }),
    failure('REQUEST_FAILED_CHECK_STATE_BEFORE_RETRY'),
  );
  assert.equal((await f.store.list('ACTIVE')).items.length, 1);
  assert.equal((await f.run()).revision, 2);
  assert.equal((await f.store.list('ACTIVE')).items.length, 1);
});

test('a lost save response resumes by exact readback rather than a fresh mutation', async () => {
  const f = await fixture();
  await assert.rejects(
    f.run({
      request: async (...args) => {
        const result = await f.request(...args);
        if (args[1]?.method === 'PUT') throw Error('Lost response');
        return result;
      },
    }),
    failure('REQUEST_FAILED_CHECK_STATE_BEFORE_RETRY'),
  );
  f.calls.length = 0;
  await f.run();
  assert.equal(
    f.calls.every((c) => c.method === 'GET'),
    true,
  );
  assert.equal((await f.store.get(`PROJECT#${f.plan.projectId}`)).revision, 2);
});

test('owner edits are never overwritten by a rerun', async () => {
  const f = await fixture();
  await f.run();
  const path = `/admin/projects/${f.plan.projectId}`;
  await f.request(path, {
    method: 'PUT',
    body: {
      operationId: randomUUID(),
      expectedRevision: 2,
      draft: { ...f.plan.finalDraft, title: 'Owner changed this title' },
    },
  });
  f.calls.length = 0;
  await assert.rejects(f.run(), failure('TARGET_CHANGED_STOP_FOR_REVIEW'));
  assert.equal(
    f.calls.every((c) => c.method === 'GET'),
    true,
  );
  assert.equal(
    (await f.store.get(`PROJECT#${f.plan.projectId}`)).draft.title,
    'Owner changed this title',
  );
});

test('an existing manually created project using the slug stops before mutation', async () => {
  const f = await fixture();
  await f.request('/admin/projects', {
    method: 'POST',
    body: {
      operationId: randomUUID(),
      draft: f.plan.initialDraft,
    },
  });
  f.calls.length = 0;
  await assert.rejects(f.run(), failure('EXISTING_SLUG_STOP_FOR_REVIEW'));
  assert.equal(
    f.calls.every((c) => c.method === 'GET'),
    true,
  );
});

test('an earlier manual entry under another slug stops by normalized title or demo URL', async () => {
  for (const match of ['title', 'demo']) {
    for (const trash of [false, true]) {
      const f = await fixture();
      let row = (
        await f.request('/admin/projects', {
          method: 'POST',
          body: {
            operationId: randomUUID(),
            draft: {
              slug: 'earlier-manual-entry',
              title:
                match === 'title'
                  ? '  AIRLINE-POINT WEBSITE '
                  : 'Different title',
              demoUrl:
                match === 'demo'
                  ? 'https://airline-point-website.vercel.app/?campaign=old'
                  : '',
            },
          },
        })
      ).body.project;
      if (trash)
        row = (
          await f.request(`/admin/projects/${row.id}/trash`, {
            method: 'POST',
            body: { operationId: randomUUID(), expectedRevision: row.revision },
          })
        ).body.project;
      f.calls.length = 0;
      await assert.rejects(
        f.run(),
        failure('EXISTING_PROJECT_STOP_FOR_REVIEW'),
      );
      assert.equal(
        f.calls.every((call) => call.method === 'GET'),
        true,
      );
      assert.equal(await f.store.get(`PROJECT#${f.plan.projectId}`), undefined);
      assert.equal(
        (await f.store.get(`PROJECT#${row.id}`)).revision,
        row.revision,
      );
    }
  }
});

test('a conflicting slug on a later real collection page is detected before mutation', async () => {
  const f = await fixture();
  const rows = [];
  for (let index = 0; index < 31; index++) {
    rows.push(
      (
        await f.request('/admin/projects', {
          method: 'POST',
          body: {
            operationId: randomUUID(),
            draft: { slug: `unrelated-${index}` },
          },
        })
      ).body.project,
    );
  }
  const last = rows.sort((a, b) => a.id.localeCompare(b.id)).at(-1);
  await f.request(`/admin/projects/${last.id}`, {
    method: 'PUT',
    body: {
      operationId: randomUUID(),
      expectedRevision: 1,
      draft: f.plan.initialDraft,
    },
  });
  f.calls.length = 0;
  await assert.rejects(f.run(), failure('EXISTING_SLUG_STOP_FOR_REVIEW'));
  assert.equal(
    f.calls.some((call) => call.path.includes('&cursor=')),
    true,
  );
  assert.equal(
    f.calls.every((call) => call.method === 'GET'),
    true,
  );
  assert.equal((await f.store.list('ACTIVE')).items.length, 30);
  assert.equal(await f.store.get(`PROJECT#${f.plan.projectId}`), undefined);
});

test('unauthenticated admin access fails before any import writes', async () => {
  const f = await fixture();
  await assert.rejects(
    f.run({
      request: async (path, { method, body }) => {
        const parsed = new URL(path, 'https://fixture.invalid');
        const result = await f.app({
          path: parsed.pathname,
          query: Object.fromEntries(parsed.searchParams),
          method,
          rawBody: body === undefined ? '' : JSON.stringify(body),
        });
        return { status: result.statusCode, body: JSON.parse(result.body) };
      },
    }),
    failure('API_REQUEST_REJECTED'),
  );
  assert.equal((await f.store.list('ACTIVE')).items.length, 0);
  assert.equal(await f.store.get(`MEDIA#${f.plan.mediaId}`), undefined);
});

test('a lost upload response resumes with the same media ID and verified bytes', async () => {
  const f = await fixture();
  await assert.rejects(
    f.run({
      upload: async (...args) => {
        await f.options.upload(...args);
        throw Error('Lost upload response');
      },
    }),
    failure('MEDIA_UPLOAD_FAILED_CHECK_STATE_BEFORE_RETRY'),
  );
  assert.equal((await f.store.get(`MEDIA#${f.plan.mediaId}`)).verified, false);
  await f.run();
  assert.equal((await f.store.get(`MEDIA#${f.plan.mediaId}`)).verified, true);
  assert.equal((await f.store.list('ACTIVE')).items.length, 1);
});

test('published or trashed import targets stop instead of changing their lifecycle', async () => {
  for (const action of ['publish', 'trash']) {
    const f = await fixture();
    await f.run();
    await f.request(`/admin/projects/${f.plan.projectId}/${action}`, {
      method: 'POST',
      body: {
        operationId: randomUUID(),
        expectedRevision: 2,
      },
    });
    f.calls.length = 0;
    await assert.rejects(
      f.run(),
      failure(
        action === 'publish'
          ? 'SLUG_ALREADY_PUBLIC'
          : 'TARGET_NOT_PRIVATE_ACTIVE_DRAFT',
      ),
    );
    assert.equal(
      f.calls.every((c) => c.method === 'GET'),
      true,
    );
  }
});

test('same-size wrong verified image content stops without overwriting the draft', async () => {
  const f = await fixture();
  await f.run();
  f.calls.length = 0;
  await assert.rejects(
    f.run({
      download: async () => ({
        status: 200,
        bytes: Buffer.alloc(f.options.coverBytes.length),
      }),
    }),
    failure('VERIFIED_MEDIA_MISMATCH'),
  );
  assert.equal(
    f.calls.every((c) => c.method === 'GET'),
    true,
  );
});

test('a stale concurrent save is rejected by the real revision guard', async () => {
  const f = await fixture();
  let changed = false;
  await assert.rejects(
    f.run({
      request: async (...args) => {
        if (!changed && args[1]?.method === 'PUT') {
          changed = true;
          await f.request(args[0], {
            method: 'PUT',
            body: {
              operationId: randomUUID(),
              expectedRevision: 1,
              draft: {
                ...f.plan.initialDraft,
                summary: 'Concurrent owner change',
              },
            },
          });
        }
        return f.request(...args);
      },
    }),
    failure('API_REQUEST_REJECTED'),
  );
  assert.equal(
    (await f.store.get(`PROJECT#${f.plan.projectId}`)).draft.summary,
    'Concurrent owner change',
  );
});

test('tampered plans and changed input bytes stop before making API requests', async () => {
  const f = await fixture();
  await assert.rejects(
    f.run({
      plan: {
        ...f.plan,
        finalDraft: { ...f.plan.finalDraft, title: 'Changed' },
      },
    }),
    failure('PLAN_MISMATCH'),
  );
  await assert.rejects(
    f.run({ coverBytes: Buffer.from('wrong') }),
    failure('COVER_MISMATCH'),
  );
  assert.equal(f.calls.length, 0);
});

test('invalid image contents fail real backend verification and never save a cover', async () => {
  const f = await fixture({ bytes: Buffer.from('not an image') });
  await assert.rejects(f.run(), failure('API_REQUEST_REJECTED'));
  assert.equal((await f.store.get(`PROJECT#${f.plan.projectId}`)).revision, 1);
  assert.equal(
    (await f.store.get(`PROJECT#${f.plan.projectId}`)).draft.coverMediaId,
    null,
  );
  assert.equal((await f.store.get(`MEDIA#${f.plan.mediaId}`)).verified, false);
});
