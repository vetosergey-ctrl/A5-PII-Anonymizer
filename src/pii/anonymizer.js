import { detectStructured } from './detectors/regexDetectors.js';
import { mergeSpans } from './spanMerge.js';
import { createPseudonymizer } from './pseudonymizer.js';
import { replaceByOffset } from './replace.js';

export function createAnonymizer({ ner }) {
  async function anonymize(text) {
    const structured = safe(() => detectStructured(text), []);
    const names = ner ? await safeAsync(() => ner.detectNames(text), []) : [];
    const merged = mergeSpans([...structured, ...names]);
    const p = createPseudonymizer();
    const repl = merged.map((s) => ({
      start: s.start, end: s.end,
      replacement: p.assign(text.slice(s.start, s.end), s.type),
    }));
    const out = replaceByOffset(text, repl);
    return { text: out, mapping: p.mapping };
  }
  return { anonymize };
}
function safe(fn, fallback) { try { return fn(); } catch (e) { console.warn('detector error:', e.message); return fallback; } }
async function safeAsync(fn, fallback) { try { return await fn(); } catch (e) { console.warn('ner error:', e.message); return fallback; } }
