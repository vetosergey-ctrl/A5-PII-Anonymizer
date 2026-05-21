import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSpans } from '../src/pii/spanMerge.js';
const s = (type, start, end, source) => ({ type, start, end, text: '', source });
test('sorts by start and drops exact duplicates', () => {
  const out = mergeSpans([s('NAME', 10, 14, 'ner'), s('NAME', 0, 4, 'ner'), s('NAME', 0, 4, 'ner')]);
  assert.deepEqual(out.map(x => [x.start, x.end]), [[0, 4], [10, 14]]);
});
test('structured beats ner on overlap', () => {
  const out = mergeSpans([s('LOCATION', 0, 20, 'ner'), s('ADDRESS', 0, 25, 'structured')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'ADDRESS');
});
test('longer wins when same source overlaps', () => {
  const out = mergeSpans([s('NAME', 0, 5, 'ner'), s('NAME', 0, 9, 'ner')]);
  assert.deepEqual(out.map(x => [x.start, x.end]), [[0, 9]]);
});
test('non-overlapping spans are all kept', () => {
  const out = mergeSpans([s('NAME', 0, 4, 'ner'), s('EMAIL', 5, 12, 'structured')]);
  assert.equal(out.length, 2);
});
