// Unicode-capable PDF writer: embeds a TTF via fontkit so non-Latin (e.g. Cyrillic)
// text does not crash pdf-lib's default WinAnsi font. Includes word-wrap + pagination.
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';

export async function writePdf(PDFDocument, text, fontPath, outputPath) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fs.readFileSync(fontPath), { subset: true });

  const size = 11, margin = 50, lineGap = size * 1.35;
  let page = doc.addPage();
  let { width, height } = page.getSize();
  let y = height - margin;
  let maxW = width - margin * 2;

  const newPage = () => { page = doc.addPage(); const s = page.getSize(); width = s.width; height = s.height; maxW = width - margin * 2; y = height - margin; };
  const widthOf = (s) => font.widthOfTextAtSize(s, size);
  const drawLine = (line) => {
    if (y < margin) newPage();
    page.drawText(line, { x: margin, y, size, font });
    y -= lineGap;
  };
  const breakLongWord = (word) => {
    const chunks = [];
    let cur = '';
    for (const ch of word) {
      if (cur && widthOf(cur + ch) > maxW) { chunks.push(cur); cur = ch; }
      else cur += ch;
    }
    if (cur) chunks.push(cur);
    return chunks;
  };
  const wrap = (paragraph) => {
    if (paragraph === '') { drawLine(''); return; }
    let line = '';
    for (let word of paragraph.split(/\s+/)) {
      if (widthOf(word) > maxW) {
        if (line) { drawLine(line); line = ''; }
        const parts = breakLongWord(word);
        for (let i = 0; i < parts.length - 1; i++) drawLine(parts[i]);
        line = parts[parts.length - 1] || '';
        continue;
      }
      const trial = line ? line + ' ' + word : word;
      if (widthOf(trial) > maxW && line) { drawLine(line); line = word; }
      else line = trial;
    }
    if (line) drawLine(line);
  };

  const normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (const para of normalized.split('\n')) wrap(para);

  const bytes = await doc.save();
  fs.writeFileSync(outputPath, bytes);
  return true;
}
