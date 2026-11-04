// backend/services/tableRegions.js
// Finds tables (a "Table 21.3 ..." caption followed by rows of cells) from the
// positions of text items, so the whole table can be cropped as a picture.
// Plain-text extraction scrambles table cells; the picture is always correct.

const CAPTION = /^\s*table\s+\d+[A-Z]?(?:[.\-]\d+)*\b/i;

function rowsOf(items, W) {
  const sorted = [...items].sort((a, b) => (a.y1 + a.y0) / 2 - (b.y1 + b.y0) / 2 || a.x0 - b.x0);
  const rows = [];
  for (const it of sorted) {
    const mid = (it.y0 + it.y1) / 2;
    const row = rows[rows.length - 1];
    if (row && Math.abs(mid - row.mid) <= Math.max(4, (it.y1 - it.y0) * 0.5)) {
      row.items.push(it);
      row.mid = (row.mid * (row.items.length - 1) + mid) / row.items.length;
    } else rows.push({ mid, items: [it] });
  }
  rows.forEach((r) => {
    r.items.sort((a, b) => a.x0 - b.x0);
    // page numbers / running side-heads parked far to the right are not part of the table
    while (r.items.length > 1) {
      const last = r.items[r.items.length - 1];
      const prev = r.items[r.items.length - 2];
      if (last.x0 > W * 0.8 && last.x0 - prev.x1 > W * 0.05) r.items.pop(); else break;
    }
    if (r.items.length === 1 && r.items[0].x0 > W * 0.85) r.items = [];
    if (!r.items.length) { r.empty = true; r.x0 = r.x1 = r.y0 = r.y1 = 0; r.text = ''; r.cells = 0; return; }
    r.x0 = Math.min(...r.items.map((i) => i.x0));
    r.x1 = Math.max(...r.items.map((i) => i.x1));
    r.y0 = Math.min(...r.items.map((i) => i.y0));
    r.y1 = Math.max(...r.items.map((i) => i.y1));
    r.text = r.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    // cells = items separated by a visible horizontal gap
    const h = r.y1 - r.y0 || 10;
    let cells = 1;
    for (let i = 1; i < r.items.length; i++) if (r.items[i].x0 - r.items[i - 1].x1 > h * 0.9) cells++;
    r.cells = cells;
  });
  return rows.filter((r) => !r.empty);
}

/**
 * @param {{str:string,x0:number,x1:number,y0:number,y1:number}[]} items  viewport coordinates (y down)
 * @param {{width:number,height:number}} viewport
 * @returns {{x0:number,y0:number,x1:number,y1:number,kind:'table'}[]}
 */
function findTableRegions(items, viewport) {
  const rows = rowsOf(items, viewport.width);
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    if (!CAPTION.test(rows[i].text) || rows[i].text.length > 140) continue;
    // a caption that opens a sentence ("Table 21.2 shows ...") inside body text is a reference, not a table title
    if (/\b(shows?|presents?|lists?|gives?|summari[sz]es?|describes?)\b/i.test(rows[i].text) && rows[i].cells < 2 && rows[i].text.length > 60) continue;
    const heights = rows.map((r) => r.y1 - r.y0).sort((a, b) => a - b);
    const lineH = heights[Math.floor(heights.length / 2)] || 12;
    let end = i;
    let tabular = 0;
    for (let j = i + 1; j < rows.length; j++) {
      const r = rows[j];
      const gap = r.y0 - rows[j - 1].y1;
      if (gap > lineH * 2.4) break;
      const paragraph = r.cells < 2 && r.text.length > 70 && (r.x1 - r.x0) > viewport.width * 0.55;
      if (paragraph) break;
      if (r.cells >= 2) tabular++;
      else if (r.text.length > 70) break;
      end = j;
    }
    if (tabular < 2) continue;
    // trailing rows without cells are probably the next paragraph's first line
    while (end > i && rows[end].cells < 2) end--;
    const sel = rows.slice(i, end + 1);
    const box = {
      x0: Math.min(...sel.map((r) => r.x0)),
      x1: Math.max(...sel.map((r) => r.x1)),
      y0: Math.min(...sel.map((r) => r.y0)),
      y1: Math.max(...sel.map((r) => r.y1)),
      kind: 'table',
    };
    // widen to the full width of the text block so cell borders at the edges are kept
    box.x0 = Math.max(0, box.x0 - 8); box.x1 = Math.min(viewport.width, box.x1 + 8);
    box.y0 = Math.max(0, box.y0 - 6); box.y1 = Math.min(viewport.height, box.y1 + 8);
    if (box.y1 - box.y0 > viewport.height * 0.9) continue;
    out.push(box);
    i = end;
  }
  return out;
}

const FIG_CAPTION = /^\s*(?:figure|fig\.)\s+\d+[A-Z]?(?:[.\-]\d+)*\s*[:.\u2013\-]/i;

/**
 * Diagrams drawn with vector graphics have no image to find. Their caption
 * ("Figure 21A.1: ...") sits right below them, and the labels inside the diagram are
 * short text rows, so the figure is the block of short rows directly above the caption.
 */
function findFigureRegions(items, viewport) {
  const rows = rowsOf(items, viewport.width);
  const heights = rows.map((r) => r.y1 - r.y0).sort((a, b) => a - b);
  const lineH = heights[Math.floor(heights.length / 2)] || 12;
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    if (!FIG_CAPTION.test(rows[i].text) || rows[i].text.length > 120) continue;
    const climb = (stopAtParagraph) => {
      let top = i;
      for (let j = i - 1; j >= 0; j--) {
        const r = rows[j];
        if (rows[j + 1].y0 - r.y1 > lineH * 3.2) break;
        if (stopAtParagraph && r.cells < 2 && r.text.length > 75 && (r.x1 - r.x0) > viewport.width * 0.5) break;
        top = j;
      }
      return top;
    };
    let top = climb(true);
    // a filled-in form / grid has long note lines inside it: take the whole block when most of its rows are tabular
    const whole = climb(false);
    const blk = rows.slice(whole, i);
    if (whole < top && blk.length >= 8 && blk.filter((r) => r.cells >= 2).length >= 6) top = whole;
    const n = i - top;
    const sel = rows.slice(top, i + 1);
    const y0 = Math.min(...sel.map((r) => r.y0));
    const y1 = rows[i].y1;
    if (n < 4 || y1 - y0 < lineH * 9) continue;
    out.push({
      x0: Math.max(viewport.width * 0.07, Math.min(...sel.map((r) => r.x0)) - 16),
      x1: Math.min(viewport.width, Math.max(...sel.map((r) => r.x1)) + 16),
      y0: Math.max(0, y0 - 14),
      y1: Math.min(viewport.height, y1 + 8),
      kind: 'figure',
    });
  }
  return out;
}

module.exports = { findTableRegions, findFigureRegions, rowsOf };
