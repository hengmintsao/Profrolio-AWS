import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
function start(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(`Could not start preview: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
console.log(
  'Local preview only. Development content is disposable and is not production data.',
);
start(process.execPath, ['backend/src/cms/dev-server.js']);
// Execute Vite through Node directly so Windows does not require a shell process.
start(process.execPath, [
  'web/node_modules/vite/bin/vite.js',
  'web',
  '--host',
  '127.0.0.1',
]);
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
