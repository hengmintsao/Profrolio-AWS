import { createServer } from 'node:http';
import { createApp } from './app.js';
import { memoryStore } from './store.js';
import { memoryMedia, MAX_MEDIA_BYTES } from './media.js';
const port = Number(process.env.PORTFOLIO_CMS_PORT || 8787),
  webPort = Number(process.env.PORTFOLIO_WEB_PORT || 5173);
if (
  ![port, webPort].every(
    (value) => Number.isInteger(value) && value >= 1024 && value <= 65535,
  )
)
  throw Error('Invalid local preview port.');
const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const origins = new Set([
  `http://127.0.0.1:${webPort}`,
  `http://localhost:${webPort}`,
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
]);
const media = memoryMedia('/api'),
  app = createApp({ store: memoryStore(), media, local: true });
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (
    !hosts.has(req.headers.host) ||
    (req.headers.origin && !origins.has(req.headers.origin))
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const chunks = [];
    let length = 0;
    const upload = url.pathname.startsWith('/api/dev/uploads/');
    for await (const chunk of req) {
      length += chunk.length;
      if (length > (upload ? MAX_MEDIA_BYTES : 96 * 1024)) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (req.method === 'PUT' && upload) {
      await media.upload(
        url.pathname.split('/').at(-1),
        bytes,
        req.headers['content-type'],
      );
      res.writeHead(200, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/dev/media/')) {
      const result = await media.readSigned(url.pathname.split('/').at(-1));
      res.writeHead(200, {
        'Content-Type': result.type,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(result.bytes);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/dev/session') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          token: 'local-owner',
          warning:
            'Local preview only. All content is disposable and lost on restart.',
        }),
      );
      return;
    }
    const result = await app({
      method: req.method,
      path: url.pathname.replace(/^\/api(?=\/|$)/, ''),
      query: Object.fromEntries(url.searchParams),
      rawBody: bytes.toString('utf8'),
      token: req.headers.authorization?.replace(/^Bearer /, ''),
    });
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
  } catch (error) {
    res.writeHead(error.status || 503, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(
      JSON.stringify({
        error: {
          code: error.code || 'DEPENDENCY_FAILURE',
          message: error.status ? error.message : 'Local service unavailable.',
        },
      }),
    );
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    `Local CMS: http://127.0.0.1:${port} (disposable memory state; never production authentication)`,
  ),
);
