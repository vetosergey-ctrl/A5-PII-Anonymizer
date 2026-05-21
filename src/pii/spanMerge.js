const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const len = (a) => a.end - a.start;
function better(a, b) {
  const rank = (x) => (x.source === 'structured' ? 1 : 0);
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;
  if (len(a) !== len(b)) return len(a) > len(b) ? a : b;
  return a.start <= b.start ? a : b;
}
export function mergeSpans(spans) {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const span of sorted) {
    let conflict = -1;
    for (let i = 0; i < kept.length; i++) { if (overlaps(kept[i], span)) { conflict = i; break; } }
    if (conflict === -1) { kept.push(span); continue; }
    kept[conflict] = better(kept[conflict], span);
  }
  return kept.sort((a, b) => a.start - b.start);
}
