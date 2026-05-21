import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnonymizer } from '../src/pii/anonymizer.js';
const mkNer = (spans) => ({ detectNames: async () => spans });
test('combines structured + ner, replaces by offset, returns mapping', async () => {
  const text = 'Иван Петров, почта a@b.com';
  const ner = mkNer([{ type: 'NAME', start: 0, end: 11, text: 'Иван Петров', source: 'ner' }]);
  const anon = createAnonymizer({ ner });
  const { text: out, mapping } = await anon.anonymize(text);
  assert.equal(out, 'NAME_1, почта EMAIL_1');
  assert.equal(mapping['NAME_1'], 'Иван Петров');
  assert.equal(mapping['EMAIL_1'], 'a@b.com');
});
