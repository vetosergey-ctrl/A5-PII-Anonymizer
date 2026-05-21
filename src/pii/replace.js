export function replaceByOffset(text, spans) {
  const ordered = [...spans].sort((a, b) => b.start - a.start);
  let out = text;
  for (const s of ordered) {
    out = out.slice(0, s.start) + s.replacement + out.slice(s.end);
  }
  return out;
}
