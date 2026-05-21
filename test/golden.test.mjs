import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnonymizer } from '../src/pii/anonymizer.js';

const TEXT = [
  'Имя: Иван Петров',
  'Телефон: +7 999 123-45-67',
  'Email: ivan.petrov@example.ru',
  'Город: Москва, ул. Тверская, д. 7',
  'Это длинная строка на русском языке для проверки. '.repeat(10),
].join('\n');

function makeNer() {
  return {
    detectNames: async (t) => {
      const i = t.indexOf('Иван Петров');
      return i >= 0 ? [{ type: 'NAME', start: i, end: i + 'Иван Петров'.length, text: 'Иван Петров', source: 'ner' }] : [];
    },
  };
}
test('Russian document: PII hidden, surrounding text intact, reversible', async () => {
  const anon = createAnonymizer({ ner: makeNer() });
  const { text: out, mapping } = await anon.anonymize(TEXT);
  assert.ok(!out.includes('Иван Петров'), 'name removed');
  assert.ok(!out.includes('ivan.petrov@example.ru'), 'email removed');
  assert.ok(!out.includes('ул. Тверская'), 'street address removed');
  assert.ok(out.includes('NAME_1') && out.includes('EMAIL_1'));
  assert.ok(out.includes('длинная строка на русском языке'), 'body text intact');
  assert.ok(out.length > TEXT.length * 0.6, 'no catastrophic shrink');
  let restored = out;
  for (const [pseudo, orig] of Object.entries(mapping)) restored = restored.split(pseudo).join(orig);
  assert.ok(restored.includes('ivan.petrov@example.ru'));
});
