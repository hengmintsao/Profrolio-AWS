import assert from 'node:assert/strict';
import { startServer } from './e2e-process.mjs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const sharp = createRequire(
  new URL('../backend/package.json', import.meta.url),
)('sharp');

// Starts its own isolated memory server. Never targets production or an existing server.
const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
const origin = 'http://127.0.0.1:4175';
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
function start(args, readyURL) {
  return startServer({
    args,
    cwd: root,
    env: {
      ...process.env,
      PORTFOLIO_CMS_PORT: '8789',
      PORTFOLIO_WEB_PORT: '4175',
    },
    readyURL,
    onSpawn: (child) => children.push(child),
    onUnexpectedExit: (error) => {
      if (!stopping) {
        console.error(error);
        stop(1);
      }
    },
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
async function call(
  path,
  { method = 'GET', body, auth = true, status = 200 } = {},
) {
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: {
      ...(auth ? { Authorization: 'Bearer local-owner' } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${JSON.stringify(result)}`,
  );
  return result;
}
try {
  await start(
    ['backend/src/cms/dev-server.js'],
    'http://127.0.0.1:8789/api/public/projects',
  );
  await start(
    [
      'web/node_modules/vite/bin/vite.js',
      'web',
      '--host',
      '127.0.0.1',
      '--port',
      '4175',
      '--strictPort',
    ],
    `${origin}/api/public/projects`,
  );
  const page = await fetch(`${origin}/admin/projects`, {
    headers: { Accept: 'text/html' },
  });
  assert.equal(page.status, 200, 'Vite supports direct admin navigation');
  assert.match(await page.text(), /id="root"/);
  await call('/admin/projects', { auth: false, status: 401 });
  const slug = `smoke-${randomUUID()}`;
  let { project } = await call('/admin/projects', {
    method: 'POST',
    status: 201,
    body: {
      operationId: randomUUID(),
      draft: { title: 'Local smoke fixture', slug },
    },
  });
  await call(`/public/projects/${slug}`, { auth: false, status: 404 });
  const image = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#a44320' },
  })
    .png()
    .toBuffer();
  const grant = await call('/admin/media', {
    method: 'POST',
    status: 201,
    body: {
      operationId: randomUUID(),
      contentType: 'image/png',
      size: image.length,
    },
  });
  // Relative URL verifies the actual same-origin browser upload contract through Vite.
  assert.match(grant.uploadUrl, /^\/api\/dev\/uploads\//);
  const uploaded = await fetch(new URL(grant.uploadUrl, origin), {
    method: 'PUT',
    headers: grant.headers,
    body: image,
  });
  assert.equal(uploaded.status, 200, 'Upload through Vite proxy');
  await call(`/admin/media/${grant.mediaId}/complete`, {
    method: 'POST',
    body: {},
  });
  ({ project } = await call(`/admin/projects/${project.id}`, {
    method: 'PUT',
    body: {
      operationId: randomUUID(),
      expectedRevision: project.revision,
      draft: {
        ...project.draft,
        summary: 'Disposable integration fixture.',
        coverMediaId: grant.mediaId,
        coverAlt: 'Orange test square',
        blocks: [{ type: 'paragraph', text: 'Verified local content.' }],
      },
    },
  }));
  ({ project } = await call(`/admin/projects/${project.id}/publish`, {
    method: 'POST',
    body: { operationId: randomUUID(), expectedRevision: project.revision },
  }));
  const original = await call(`/public/projects/${slug}`, { auth: false });
  assert.equal(original.project.title, 'Local smoke fixture');
  const media = await fetch(
    `${origin}/api/public/projects/${slug}/media/${grant.mediaId}`,
  );
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('content-type'), 'image/png');
  const previousRevision = project.revision;
  ({ project } = await call(`/admin/projects/${project.id}`, {
    method: 'PUT',
    body: {
      operationId: randomUUID(),
      expectedRevision: project.revision,
      draft: { ...project.draft, title: 'Unpublished edit' },
    },
  }));
  assert.equal(
    (await call(`/public/projects/${slug}`, { auth: false })).project.title,
    'Local smoke fixture',
  );
  await call(`/admin/projects/${project.id}/publish`, {
    method: 'POST',
    status: 409,
    body: { operationId: randomUUID(), expectedRevision: previousRevision },
  });
  ({ project } = await call(`/admin/projects/${project.id}/trash`, {
    method: 'POST',
    body: { operationId: randomUUID(), expectedRevision: project.revision },
  }));
  await call(`/public/projects/${slug}`, { auth: false, status: 404 });
  const revoked = await fetch(
    `${origin}/api/public/projects/${slug}/media/${grant.mediaId}`,
    { redirect: 'manual' },
  );
  assert.equal(revoked.status, 404);
  ({ project } = await call(`/admin/projects/${project.id}/restore`, {
    method: 'POST',
    body: { operationId: randomUUID(), expectedRevision: project.revision },
  }));
  assert.equal(project.publishedRevision, null);
  await call(`/public/projects/${slug}`, { auth: false, status: 404 });
  console.log(
    'PASS: isolated HTTP preview, auth, same-origin image upload, draft privacy, publication snapshot, stale revision, trash/media revocation and unpublished restore.',
  );
} finally {
  stop(process.exitCode || 0);
}
