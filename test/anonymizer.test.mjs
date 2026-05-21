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
test('shared pseudonymizer keeps numbering consistent and accumulates mapping across calls', async () => {
  const { createPseudonymizer } = await import('../src/pii/pseudonymizer.js');
  const p = createPseudonymizer();
  const anon = createAnonymizer({ ner: { detectNames: async () => [] }, pseudonymizer: p });
  const a = await anon.anonymize('почта a@b.com');
  const b = await anon.anonymize('почта c@d.com');
  assert.equal(a.text, 'почта EMAIL_1');
  assert.equal(b.text, 'почта EMAIL_2');           // numbering continued, not reset
  assert.equal(p.mapping['EMAIL_1'], 'a@b.com');
  assert.equal(p.mapping['EMAIL_2'], 'c@d.com');   // accumulated
});
