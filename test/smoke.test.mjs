import { test } from 'node:test';
import assert from 'node:assert/strict';

test('electron-node runs node:test ESM', () => {
  assert.equal(1 + 1, 2);
});
