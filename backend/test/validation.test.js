import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContact } from '../src/validation.js';

test('accepts and normalizes a valid contact', () => {
  const result = validateContact({
    name: ' Henry ',
    email: 'HENRY@example.com ',
    phone: '',
    message: 'Hello',
  });

  assert.equal(result.valid, true);
  assert.equal(result.value.name, 'Henry');
  assert.equal(result.value.email, 'henry@example.com');
});

test('rejects invalid email addresses', () => {
  assert.equal(
    validateContact({ name: 'Henry', email: 'invalid' }).valid,
    false,
  );
});

test('rejects honeypot submissions', () => {
  assert.equal(
    validateContact({ name: 'Bot', email: 'bot@example.com', website: 'spam' })
      .valid,
    false,
  );
});

test('rejects oversized messages', () => {
  const result = validateContact({
    name: 'Henry',
    email: 'henry@example.com',
    message: 'x'.repeat(2001),
  });

  assert.equal(result.valid, false);
});
