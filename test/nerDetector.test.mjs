import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNerDetector } from '../src/pii/detectors/nerDetector.js';

function mockPipeline(text) {
  return [
    { entity: 'B-PER', word: 'Иван', start: null, end: null },
    { entity: 'I-PER', word: 'Петрович', start: null, end: null },
    { entity: 'B-LOC', word: 'Москва', start: null, end: null },
  ];
}
test('aggregates subwords and reconstructs offsets on Cyrillic', async () => {
  const text = 'Иван Петрович живёт в городе Москва.';
  const det = createNerDetector({ runPipeline: mockPipeline });
  const spans = await det.detectNames(text);
  const name = spans.find(s => s.type === 'NAME');
  assert.equal(text.slice(name.start, name.end), 'Иван Петрович');
  const loc = spans.find(s => s.type === 'LOCATION');
  assert.equal(text.slice(loc.start, loc.end), 'Москва');
});
test('patronymic heuristic catches standalone отчество the model missed', async () => {
  const text = 'Звонила Сергеевна вчера';
  const det = createNerDetector({ runPipeline: () => [] });
  const spans = await det.detectNames(text);
  const name = spans.find(s => s.type === 'NAME');
  assert.equal(text.slice(name.start, name.end), 'Сергеевна');
});
