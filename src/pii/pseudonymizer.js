export function createPseudonymizer() {
  const counters = Object.create(null);
  const byKey = new Map();
  const mapping = Object.create(null);
  const norm = (s) => String(s).trim().replace(/\s+/g, ' ');
  function assign(text, type) {
    const key = `${type} ${norm(text)}`;
    const existing = byKey.get(key);
    if (existing) return existing;
    counters[type] = (counters[type] || 0) + 1;
    const pseudonym = `${type}_${counters[type]}`;
    byKey.set(key, pseudonym);
    mapping[pseudonym] = norm(text);
    return pseudonym;
  }
  return { assign, mapping };
}
