import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePushUpdates } from '../push-policy.mjs';

const head = 'a'.repeat(40);
const zero = '0'.repeat(40);
test('push policy refuses replacement of an existing published tag', () => {
  assert.throws(
    () =>
      validatePushUpdates(
        `refs/tags/v1.0.0 ${'b'.repeat(40)} refs/tags/v1.0.0 ${'c'.repeat(40)}`,
        head,
        () => head,
      ),
    /immutable/,
  );
});
test('push policy allows only the tested branch commit and matching release tag', () => {
  validatePushUpdates(
    `refs/heads/feature ${head} refs/heads/feature ${zero}`,
    head,
    () => assert.fail(),
  );
  validatePushUpdates(
    `refs/tags/v1.0.0 ${'b'.repeat(40)} refs/tags/v1.0.0 ${zero}`,
    head,
    () => head,
  );
});
test('push policy rejects direct main updates, deletes, stale commits, and unknown refs', () => {
  for (const input of [
    '',
    `refs/heads/main ${head} refs/heads/main ${zero}`,
    `(delete) ${zero} refs/heads/feature ${head}`,
    `refs/heads/other ${'b'.repeat(40)} refs/heads/other ${zero}`,
    `refs/notes/test ${head} refs/notes/test ${zero}`,
  ])
    assert.throws(() => validatePushUpdates(input, head, () => head));
  assert.throws(() =>
    validatePushUpdates(
      `refs/tags/v1.0.0 ${'b'.repeat(40)} refs/tags/v1.0.0 ${zero}`,
      head,
      () => 'c'.repeat(40),
    ),
  );
});
