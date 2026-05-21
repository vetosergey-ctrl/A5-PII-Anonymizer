const LABEL_MAP = { PER: 'NAME', ORG: 'ORG', LOC: 'LOCATION' };
// Unicode-safe patronymic boundary: not preceded/followed by a Cyrillic letter
const PATRONYMIC = /(?<![А-ЯЁа-яё])([А-ЯЁ][а-яё]+(?:ович|евич|ьич|ич|овна|евна|инична|ична))(?![А-ЯЁа-яё])/g;

export function createNerDetector({ runPipeline }) {
  async function detectNames(text) {
    const raw = (await runPipeline(text)) || [];
    const groups = [];
    let cur = null;
    for (const t of raw) {
      const m = /^([BI])-(\w+)$/.exec(t.entity || '');
      if (!m) { cur = null; continue; }
      const [, bi, rawLabel] = m;
      const type = LABEL_MAP[rawLabel];
      if (!type) { cur = null; continue; }
      const word = String(t.word || '').replace(/^##/, '');
      if (bi === 'B' || !cur || cur.type !== type) {
        cur = { type, words: [word] };
        groups.push(cur);
      } else {
        cur.words.push(word);
      }
    }
    const spans = [];
    let searchFrom = 0;
    for (const g of groups) {
      const phrase = g.words.join(' ').trim();
      if (!phrase) continue;
      const loc = locate(text, phrase, searchFrom);
      if (loc) {
        spans.push({ type: g.type, start: loc.start, end: loc.end, text: text.slice(loc.start, loc.end), source: 'ner' });
        searchFrom = loc.end;
      }
    }
    for (const m of text.matchAll(PATRONYMIC)) {
      // m[1] is the captured patronymic word; m.index is the offset of the full match
      // The capture group starts at m.index + (m[0].length - m[1].length) due to possible
      // lookbehind consuming 0 chars, but the lookahead/lookbehind are zero-width,
      // so m.index points to the start of the captured group directly.
      const start = m.index;
      const end = m.index + m[0].length;
      spans.push({ type: 'NAME', start, end, text: m[0], source: 'ner' });
    }
    return spans;
  }
  return { detectNames };
}

function locate(text, phrase, from) {
  const words = phrase.split(/\s+/).map(escapeRe);
  const re = new RegExp(words.join('\\s+'));
  const sub = text.slice(from);
  const m = re.exec(sub);
  if (!m) {
    const m2 = re.exec(text);
    return m2 ? { start: m2.index, end: m2.index + m2[0].length } : null;
  }
  return { start: from + m.index, end: from + m.index + m[0].length };
}
function escapeRe(s) { return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'); }
