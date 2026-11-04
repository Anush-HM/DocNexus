// backend/services/pdfExportService.js
// ─────────────────────────────────────────────
//  Builds a real, downloadable PDF of the unified notes
//  (or the revision sheet) with PDFKit: structured text,
//  bullets, numbered steps and the extracted figures.
// ─────────────────────────────────────────────

const PDFDocument = require('pdfkit');

const COLORS = { ink: '#18181b', body: '#3f3f46', muted: '#71717a', accent: '#4338ca', rule: '#e4e4e7' };
const MARGIN = 50;

// PDFKit's built-in fonts only cover Latin-1/WinAnsi: swap common symbols for safe ones.
function clean(t) {
  return String(t == null ? '' : t)
    .replace(/[→⇒]/g, '->')
    .replace(/[←]/g, '<-')
    .replace(/[≤]/g, '<=')
    .replace(/[≥]/g, '>=')
    .replace(/[✓✔]/g, 'v')
    .replace(/[   ]/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ–—‘’“”•…]/g, '');
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

// Writes text that may contain **bold** segments.
function rich(doc, text, opts = {}) {
  const { size = 10.5, color = COLORS.body, indent = 0, gap = 5 } = opts;
  const width = doc.page.width - MARGIN * 2 - indent;
  const parts = clean(text).split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== '');
  doc.fontSize(size).fillColor(color);
  const x = MARGIN + indent;
  parts.forEach((p, i) => {
    const bold = /^\*\*[^*]+\*\*$/.test(p);
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(bold ? COLORS.ink : color)
      .text(bold ? p.slice(2, -2) : p.replace(/\*(?!\s)([^*]+)\*/g, '$1'), i === 0 ? x : undefined, i === 0 ? undefined : undefined, {
        width, continued: i < parts.length - 1, lineGap: 2,
      });
  });
  doc.font('Helvetica').moveDown(gap / 12);
}

// A sub-heading with nothing under it (next line is another heading, or the end) is just a label
// for content that was not extracted: leave it out.
function dropEmptyHeadings(lines) {
  const isHead = (l) => /^\s*#{1,6}\s*\S/.test(l) || /^\s*\*\*[^*]{2,60}?:?\*\*:?\s*$/.test(l);
  // generic labels the app used to add to every topic (not part of the source) are not shown
  const GENERIC = /^\s*(?:#{1,6}\s*|\*\*)\s*(?:key points|remember|steps|types \/ comparison)\s*:?\s*(?:\*\*)?:?\s*$/i;
  lines = lines.filter((l) => !GENERIC.test(l));
  return lines.filter((l, i) => {
    if (!isHead(l)) return true;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      return !isHead(lines[j]);
    }
    return false;
  });
}

function renderMarkdown(doc, content) {
  const lines = dropEmptyHeadings(String(content || '').replace(/\r/g, '').split('\n'));
  let num = 0;
  let prev = ''; // kind of the previous line: 'bullet' | 'num' | 'numNested' | other
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { num = 0; prev = ''; continue; }
    ensureSpace(doc, 30);
    let m;
    if ((m = line.match(/^#{1,6}\s*(.+)$/)) || (m = line.match(/^\*\*([^*]{2,60}?):?\*\*:?$/))) {
      num = 0; prev = 'head';
      doc.moveDown(0.4).font('Helvetica-Bold').fontSize(9).fillColor(COLORS.accent)
        .text(clean(m[1]).replace(/:$/, '').toUpperCase(), MARGIN, undefined, { characterSpacing: 0.6 });
      doc.moveDown(0.25);
    } else if ((m = line.match(/^[-•*]\s+(.+)$/))) {
      const lvl = Math.min(2, Math.floor((raw.match(/^\s*/)[0].length) / 2));
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.accent)
        .text(lvl ? '-' : '•', MARGIN + 6 + lvl * 16, y, { lineBreak: false });
      doc.y = y;
      rich(doc, m[1], { indent: 22 + lvl * 16, gap: 3 });
      prev = 'bullet';
    } else if ((m = line.match(/^(\d+)[.)]\s+(.+)$/))) {
      num++;
      // a 1,2,3 list directly under a bullet ("- Prepares reports summarizing:") belongs to that bullet
      const nested = prev === 'bullet' || prev === 'numNested';
      const off = nested ? 18 : 0;
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.accent).text(`${m[1]}.`, MARGIN + 4 + off, y, { lineBreak: false });
      doc.y = y;
      rich(doc, m[2], { indent: 22 + off, gap: 3 });
      prev = nested ? 'numNested' : 'num';
    } else {
      rich(doc, line, { gap: 6 });
      prev = 'para';
    }
  }
}

function drawImage(doc, d) {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(d.image || '');
  if (!m) return;
  let buf;
  try { buf = Buffer.from(m[2], 'base64'); } catch { return; }
  const maxW = doc.page.width - MARGIN * 2;
  const maxH = 300;
  let img;
  try { img = doc.openImage(buf); } catch { return; }
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale, h = img.height * scale;
  ensureSpace(doc, h + 30);
  const x = MARGIN + (maxW - w) / 2;
  const y = doc.y + 4;
  doc.rect(x - 4, y - 4, w + 8, h + 8).lineWidth(0.5).strokeColor(COLORS.rule).stroke();
  doc.image(buf, x, y, { width: w, height: h });
  doc.y = y + h + 8;
  if (d.description) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.muted)
      .text(clean(d.description), MARGIN, undefined, { width: maxW, align: 'center' });
  }
  doc.moveDown(0.6);
}

function startDoc(title, subtitle) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, info: { Title: `${title} - DocNexus`, Author: 'DocNexus' } });
  doc.font('Helvetica-Bold').fontSize(24).fillColor(COLORS.ink).text(clean(title), MARGIN, MARGIN);
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
    .text(clean(`${subtitle}  |  Generated by DocNexus on ${new Date().toLocaleDateString('en-GB')}`));
  doc.moveDown(0.6);
  const y = doc.y;
  doc.moveTo(MARGIN, y).lineTo(doc.page.width - MARGIN, y).lineWidth(0.8).strokeColor(COLORS.rule).stroke();
  doc.moveDown(1);
  return doc;
}

function addFooters(doc, label) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 32;
    doc.page.margins.bottom = 0; // allow drawing inside the bottom margin
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
      .text(label, MARGIN, y, { width: 300, lineBreak: false })
      .text(`Page ${i + 1} of ${range.count}`, doc.page.width - MARGIN - 100, y, { width: 100, align: 'right', lineBreak: false });
  }
}

// A topic whose content is only headings (no sentence, bullet or picture) is just a title: skip it.
function hasContent(n) {
  if ((n.diagrams || []).length || n.hasConflict) return true;
  const body = String(n.content || '').split('\n')
    .filter((l) => !/^\s*#{1,6}\s/.test(l) && !/^\s*\*\*[^*]+\*\*:?\s*$/.test(l))
    .join(' ').replace(/[-•*]\s/g, ' ').trim();
  return body.length >= 25;
}

function buildNotesPdf(allNotes) {
  const notes = allNotes.filter(hasContent);
  const doc = startDoc('Unified Notes', `${notes.length} topics`);
  notes.forEach((note, idx) => {
    ensureSpace(doc, 90);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.ink)
      .text(`${idx + 1}. ${clean(String(note.title).replace(/\s*\(cont\.\)\s*$/i, ''))}`, MARGIN, undefined, { width: doc.page.width - MARGIN * 2 });
    doc.moveDown(0.4);
    renderMarkdown(doc, note.content);
    (note.diagrams || []).forEach((d) => drawImage(doc, d));
    if (note.hasConflict) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#b45309').text('! Conflict detected - see Conflicts tab', MARGIN);
    }
    if ((note.sources || []).length) {
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(`Source: ${clean(note.sources.join(', '))}`, MARGIN);
    }
    doc.moveDown(0.7);
    if (idx < notes.length - 1) {
      const y = doc.y;
      doc.moveTo(MARGIN, y).lineTo(doc.page.width - MARGIN, y).lineWidth(0.5).strokeColor(COLORS.rule).stroke();
      doc.moveDown(0.9);
    }
  });
  addFooters(doc, 'DocNexus - Unified Notes');
  return doc;
}

function buildRevisionPdf(sections) {
  const doc = startDoc('Revision Sheet', `${sections.length} units`);
  sections.forEach((s) => {
    ensureSpace(doc, 60);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.ink).text(clean(s.unit), MARGIN);
    doc.moveDown(0.3);
    (s.points || []).forEach((p) => {
      ensureSpace(doc, 24);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.accent).text('•', MARGIN + 6, y, { lineBreak: false });
      doc.y = y;
      rich(doc, p, { indent: 22, gap: 3 });
    });
    doc.moveDown(0.8);
  });
  addFooters(doc, 'DocNexus - Revision Sheet');
  return doc;
}

module.exports = { buildNotesPdf, buildRevisionPdf };
