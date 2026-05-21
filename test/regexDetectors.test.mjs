import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectStructured } from '../src/pii/detectors/regexDetectors.js';
const find = (text, type) => detectStructured(text).find(s => s.type === type);
test('email', () => { assert.equal(find('пишите ivan.petrov@example.ru сегодня', 'EMAIL').text, 'ivan.petrov@example.ru'); });
test('phone RU and intl', () => {
  assert.ok(find('тел +7 999 123-45-67', 'PHONE'));
  assert.ok(find('call +1 (415) 555-0142', 'PHONE'));
});
test('card validated by luhn (rejects invalid)', () => {
  assert.ok(find('карта 4242 4242 4242 4242', 'BANK'));
  assert.equal(find('номер 4242 4242 4242 4241', 'BANK'), undefined);
});
test('inn with checksum', () => {
  assert.ok(find('ИНН 7830002293', 'BANK'));            // if this INN value is invalid per validator, change BOTH here and in validators test to a valid one
  assert.equal(find('ИНН 7830002294', 'BANK'), undefined);
});
test('ip and url', () => {
  assert.ok(find('сервер 192.168.0.1', 'IP'));
  assert.ok(find('сайт https://example.com/x', 'URL'));
});
test('address span with markers', () => {
  const s = find('адрес: г. Москва, ул. Тверская, д. 7', 'ADDRESS');
  assert.ok(s && s.text.includes('ул. Тверская') && s.text.includes('д. 7'));
});
test('offsets are exact', () => {
  const text = 'ИНН 7830002293 и почта a@b.com';
  for (const s of detectStructured(text)) assert.equal(text.slice(s.start, s.end), s.text);
});
