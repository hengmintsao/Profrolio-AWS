import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../e2e-process.mjs';

function fixture(request, timeoutMs = 80) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let kills = 0;
  child.kill = () => {
    kills++;
    return true;
  };
  const failures = [];
  const pending = startServer({
    args: ['disposable-fixture'],
    cwd: process.cwd(),
    env: {},
    readyURL: 'http://127.0.0.1:4174/api/public/projects',
    onSpawn: () => {},
    onUnexpectedExit: (error) => failures.push(error.message),
    timeoutMs,
    pollMs: 2,
    spawnChild: () => child,
    request,
  });
  return {
    child,
    pending,
    failures,
    get kills() {
      return kills;
    },
  };
}

test('HTTP-ready server with split/colorized output cannot time out later', async () => {
  let httpReady = false;
  const server = fixture(async () => ({ status: httpReady ? 200 : 503 }));
  server.child.stdout.emit('data', Buffer.from('\x1b[32m  Local'));
  server.child.stdout.emit(
    'data',
    Buffer.from(': http://127.0.0.1:4174/\x1b[0m\n'),
  );
  httpReady = true;
  assert.equal(await server.pending, server.child);
  await delay(100);
  assert.equal(
    server.kills,
    0,
    'startup deadline must be cancelled after readiness',
  );
  assert.deepEqual(server.failures, []);
});

test('HTTP readiness works without a console readiness message and stops polling', async () => {
  let calls = 0;
  const server = fixture(async () => {
    calls++;
    return { status: 200 };
  });
  await server.pending;
  const settledCalls = calls;
  await delay(100);
  assert.equal(calls, settledCalls);
  assert.equal(server.kills, 0);
});

test('a never-ready server times out and stops only its owned child', async () => {
  const server = fixture(async () => ({ status: 503 }), 20);
  await assert.rejects(server.pending, /startup timed out/);
  assert.equal(server.kills, 1);
});

test('an early child exit rejects startup instead of leaving a deadline running', async () => {
  const server = fixture(async () => ({ status: 503 }));
  server.child.emit('exit', 7, null);
  await assert.rejects(server.pending, /E2E server exited \(7\)/);
  await delay(100);
  assert.equal(server.kills, 1);
  assert.deepEqual(server.failures, []);
});

test('a child spawn error rejects startup immediately', async () => {
  const server = fixture(async () => ({ status: 503 }));
  server.child.emit('error', Error('Fixture spawn failed'));
  await assert.rejects(server.pending, /Fixture spawn failed/);
  assert.equal(server.kills, 1);
});

test('an exit after readiness is reported to the owning launcher', async () => {
  const server = fixture(async () => ({ status: 200 }));
  await server.pending;
  server.child.emit('exit', 9, null);
  assert.deepEqual(server.failures, ['E2E server exited (9).']);
});
