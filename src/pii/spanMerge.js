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
    const conflicts = [];
    for (let i = 0; i < kept.length; i++) { if (overlaps(kept[i], span)) conflicts.push(i); }
    if (conflicts.length === 0) { kept.push(span); continue; }
    let winner = span;
    for (const i of conflicts) winner = better(winner, kept[i]);
    for (let i = conflicts.length - 1; i >= 0; i--) kept.splice(conflicts[i], 1);
    kept.push(winner);
  }
  return kept.sort((a, b) => a.start - b.start);
}
