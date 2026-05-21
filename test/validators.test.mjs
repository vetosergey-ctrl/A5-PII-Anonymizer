import { test } from 'node:test';
import assert from 'node:assert/strict';
import { luhn, innValid, snilsValid } from '../src/pii/detectors/validators.js';
test('luhn', () => {
  assert.equal(luhn('4242424242424242'), true);
  assert.equal(luhn('4242424242424241'), false);
});
test('inn 10 and 12 digit', () => {
  assert.equal(innValid('7830002293'), true);
  assert.equal(innValid('7830002294'), false);
  assert.equal(innValid('500100732259'), true);
});
test('snils', () => {
  assert.equal(snilsValid('112-233-445 95'), true);
  assert.equal(snilsValid('112-233-445 96'), false);
});
