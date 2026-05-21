import { luhn, innValid, snilsValid } from './validators.js';
const span = (type, m, text = m[0]) => ({ type, start: m.index, end: m.index + m[0].length, text, source: 'structured' });
const RULES = [
  { type: 'EMAIL', re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: 'URL', re: /https?:\/\/[^\s<>"')]+/g },
  { type: 'IP', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/g },
  { type: 'PHONE', re: /(?:\+?\d[\d().\-\s]{7,}\d)/g, validate: (m) => m[0].replace(/\D/g, '').length >= 9 },
  { type: 'BANK', re: /\b(?:\d[ -]?){13,19}\b/g, validate: (m) => luhn(m[0]) },
  { type: 'BANK', re: /ИНН[:\s]*(\d{10}|\d{12})(?!\d)/gi, validate: (m) => innValid(m[1]) },
  { type: 'BANK', re: /СНИЛС[:\s]*([\d \-]{11,14})(?!\d)/gi, validate: (m) => snilsValid(m[1]) },
  { type: 'BANK', re: /\b(?:р\/?с|расч[её]тный счет|корр?\.?\s?счет|к\/с|БИК|КПП)[:\s]*\d{9,20}\b/gi },
  { type: 'BANK', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g },
  { type: 'DATE', re: /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g },
  { type: 'PASSPORT', re: /\b\d{2}\s?\d{2}\s?\d{6}\b/g },
  { type: 'ADDRESS', re: /(?:г\.?\s*[А-ЯЁ][а-яё-]+|город\s+[А-ЯЁ][а-яё-]+)[,\s]*(?:ул\.?|улица|пр-?т|просп\.?|пер\.?|пл\.?|ш\.?)[^,]*(?:,\s*(?:д\.?|дом)\s*\d+[а-яёА-ЯЁ]?)?(?:[,\s]*(?:корп\.?|стр\.?)\s*\d+)?(?:[,\s]*кв\.?\s*\d+)?/gi },
  { type: 'ORG', re: /\b(?:ООО|ОАО|ЗАО|ПАО|АО|ИП|LLC|Ltd\.?|Inc\.?|GmbH)\s+(?:«[^»]+»|"[^"]+"|[А-ЯA-Z][\wА-Яа-яёЁ-]*)/g },
];
export function detectStructured(text) {
  const out = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      if (rule.validate && !rule.validate(m)) continue;
      out.push(span(rule.type, m));
    }
  }
  return out;
}
