import { spawn } from 'node:child_process';

// Readiness is based on HTTP, never on the timing or shape of console chunks.
export function startServer({
  args,
  cwd,
  env,
  readyURL,
  onSpawn,
  onUnexpectedExit,
  timeoutMs = 15000,
  pollMs = 100,
  spawnChild = spawn,
  request = fetch,
}) {
  const child = spawnChild(process.execPath, args, {
    cwd,
    env,
    windowsHide: true,
  });
  onSpawn(child);
  return new Promise((resolve, reject) => {
    let settled = false;
    let started = false;
    let pollTimer;
    const controller = new AbortController();
    const deadline = setTimeout(
      () => finish(Error('Isolated E2E server startup timed out.')),
      timeoutMs,
    );
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(pollTimer);
      controller.abort();
      if (error) {
        child.kill('SIGTERM');
        reject(error);
      } else {
        started = true;
        resolve(child);
      }
    }
    function exited(error) {
      if (!settled) finish(error);
      else if (started) onUnexpectedExit(error);
    }
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.once('error', exited);
    child.once('exit', (code, signal) =>
      exited(Error(`E2E server exited (${signal || code}).`)),
    );
    async function probe() {
      let ready = false;
      try {
        const response = await request(readyURL, { signal: controller.signal });
        ready = response.status === 200;
      } catch {
        // Connection refusal is expected while the owned child is starting.
      }
      if (settled) return;
      if (ready) finish();
      else pollTimer = setTimeout(probe, pollMs);
    }
    void probe();
  });
}
