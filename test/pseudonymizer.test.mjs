import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPseudonymizer } from '../src/pii/pseudonymizer.js';

test('same (text,type) -> same pseudonym; different -> different', () => {
  const p = createPseudonymizer();
  assert.equal(p.assign('Иван', 'NAME'), 'NAME_1');
  assert.equal(p.assign('Иван', 'NAME'), 'NAME_1');
  assert.equal(p.assign('Пётр', 'NAME'), 'NAME_2');
  assert.equal(p.assign('a@b.com', 'EMAIL'), 'EMAIL_1');
});
test('mapping is reversible 1:1', () => {
  const p = createPseudonymizer();
  const a = p.assign('Иван', 'NAME');
  const b = p.assign('a@b.com', 'EMAIL');
  assert.equal(p.mapping[a], 'Иван');
  assert.equal(p.mapping[b], 'a@b.com');
});
test('normalization: trims and collapses whitespace for keying', () => {
  const p = createPseudonymizer();
  assert.equal(p.assign('  Иван  ', 'NAME'), p.assign('Иван', 'NAME'));
});
