import test from 'node:test';
import assert from 'node:assert/strict';
import { credentials, profileInput, hashPassword, verifyPassword } from '../account-validation.js';

test('password hashing is salted and verifies without plaintext storage', async () => {
  const password = 'A test password with enough length';
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('incorrect password', first), false);
});
test('credentials and editable profiles validate boundaries', () => {
  assert.equal(credentials({ email: ' Me@Example.com ', password: 'Long-password-123' }).email, 'me@example.com');
  assert.throws(() => credentials({ email: 'invalid', password: 'short' }));
  const base = { name: 'Integration agent', service_area_ids: [1, 1], profile_version: 0 };
  assert.deepEqual(profileInput(base).service_area_ids, [1]);
  for (const change of [{ name: '' }, { latitude: '1' }, { longitude: 181, latitude: 0 },
    { service_area_ids: [-1] }, { phone: 'javascript:alert(1)' }, { profile_version: -1 }]) assert.throws(() => profileInput({ ...base, ...change }));
});
