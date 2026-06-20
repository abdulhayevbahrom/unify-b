import assert from 'node:assert/strict';
import test from 'node:test';
import { clearLoginFailures, getLoginBlock, registerLoginFailure } from '../src/services/login-protection.service.js';

test('five failed logins block the same IP and username', () => {
  const ip = 'test-ip';
  const username = 'test-user';
  clearLoginFailures(ip, username);
  for (let attempt = 0; attempt < 5; attempt += 1) registerLoginFailure(ip, username);
  const block = getLoginBlock(ip, username);
  assert.ok(block);
  assert.ok(block.retryAfterSeconds > 0);
  clearLoginFailures(ip, username);
  assert.equal(getLoginBlock(ip, username), null);
});
