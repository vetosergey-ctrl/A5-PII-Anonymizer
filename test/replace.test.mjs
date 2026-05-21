import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replaceByOffset } from '../src/pii/replace.js';

test('replaces exact spans without offset drift', () => {
  const text = 'Иван звонил на +7 999, почта a@b.com';
  const spans = [
    { start: 0, end: 4, replacement: 'NAME_1' },
    { start: 15, end: 21, replacement: 'PHONE_1' },
    { start: 29, end: 36, replacement: 'EMAIL_1' },
  ];
  assert.equal(replaceByOffset(text, spans), 'NAME_1 звонил на PHONE_1, почта EMAIL_1');
});
test('does not eat surrounding Cyrillic (regression)', () => {
  const text = 'Город: Москва, очень длинный русский текст после';
  const spans = [{ start: 7, end: 13, replacement: 'LOCATION_1' }];
  assert.equal(replaceByOffset(text, spans), 'Город: LOCATION_1, очень длинный русский текст после');
});
