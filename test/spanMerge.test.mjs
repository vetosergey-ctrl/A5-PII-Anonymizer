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
test('new span overlapping multiple kept spans leaves no overlaps', () => {
  // A(0,10) ner, B(15,25) ner already conceptually kept; C(8,20) structured overlaps both
  const out = mergeSpans([
    { type:'NAME', start:0, end:10, text:'', source:'ner' },
    { type:'NAME', start:15, end:25, text:'', source:'ner' },
    { type:'ADDRESS', start:8, end:20, text:'', source:'structured' },
  ]);
  // assert pairwise non-overlap
  for (let i=0;i<out.length;i++) for (let j=i+1;j<out.length;j++) {
    assert.ok(out[i].end <= out[j].start || out[j].end <= out[i].start, 'no overlap');
  }
});
