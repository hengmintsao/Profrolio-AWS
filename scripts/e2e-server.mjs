import { fileURLToPath } from 'node:url';
import { startServer } from './e2e-process.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
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
      PORTFOLIO_CMS_PORT: '8788',
      PORTFOLIO_WEB_PORT: '4174',
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
try {
  await start(
    ['backend/src/cms/dev-server.js'],
    'http://127.0.0.1:8788/api/public/projects',
  );
  await start(
    [
      'web/node_modules/vite/bin/vite.js',
      'web',
      '--host',
      '127.0.0.1',
      '--port',
      '4174',
      '--strictPort',
    ],
    'http://127.0.0.1:4174/api/public/projects',
  );
} catch (error) {
  console.error(error);
  stop(1);
}
