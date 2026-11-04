// backend/services/tableRegions.js
// Finds tables (a "Table 21.3 ..." caption followed by rows of cells) from the
// positions of text items, so the whole table can be cropped as a picture.
// Plain-text extraction scrambles table cells; the picture is always correct.

const CAPTION = /^\s*(?:\d{1,4}\s+)?(?:table|frame)\s+\d+[A-Z]?(?:[.\-]\d+)*\b/i;

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

const FIG_CAPTION = /^\s*(?:\d{1,4}\s+)?(?:figure|fig\.)\s+\d+[A-Z]?(?:[.\-]\d+)*\s*[:.\u2013\-]/i;

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

// ─────────────────────────────────────────────
//  Tables WITHOUT a "Table N" caption: several consecutive rows made of short cells that
//  line up in the same columns (a summary table in a notes document, a filled-in form...).
// ─────────────────────────────────────────────
const MARKER = /^(?:[\u2022\u25AA\u25A0\u25CF\u25E6\u25CB\u25AB\u00B7\-\u2013o]|\(?\d{1,2}[.)]|\(?[a-z][.)])$/;

function cellsOfRow(r) {
  const h = r.y1 - r.y0 || 10;
  const cells = [];
  let cur = [r.items[0]];
  for (let i = 1; i < r.items.length; i++) {
    if (r.items[i].x0 - r.items[i - 1].x1 > h * 0.9) { cells.push(cur); cur = []; }
    cur.push(r.items[i]);
  }
  cells.push(cur);
  return cells
    .map((c) => ({ x0: c[0].x0, x1: c[c.length - 1].x1, text: c.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim() }))
    .filter((c) => c.text && !MARKER.test(c.text)); // bullet glyphs / "1." markers are not columns
}

function findGridRegions(items, viewport) {
  const rows = rowsOf(items, viewport.width);
  rows.forEach((r) => { r.cl = cellsOfRow(r); });
  const isRow = (r) => r.cl.length >= 2 && r.cl.every((c) => c.text.length <= 70) && r.cl.reduce((n, c) => n + c.text.length, 0) / r.cl.length <= 45;
  const out = [];
  let i = 0;
  while (i < rows.length) {
    if (!isRow(rows[i])) { i++; continue; }
    let j = i;
    let last = i;
    let miss = 0;
    while (j + 1 < rows.length) {
      const nxt = rows[j + 1];
      const gap = nxt.y0 - rows[j].y1;
      if (gap > (rows[j].y1 - rows[j].y0) * 2.2) break;
      if (isRow(nxt)) { j++; last = j; miss = 0; }
      else if (nxt.text.length <= 45 && miss < 1) { j++; miss++; } // wrapped cell text
      else break;
    }
    const run = rows.slice(i, last + 1).filter(isRow);
    if (run.length >= 4) {
      // columns = cell start positions shared by most rows
      const hist = new Map();
      run.forEach((r) => new Set(r.cl.map((c) => Math.round(c.x0 / 12))).forEach((k) => hist.set(k, (hist.get(k) || 0) + 1)));
      const anchors = [...hist.entries()].filter(([, n]) => n >= run.length * 0.5).map(([k]) => k);
      const aligned = run.filter((r) => r.cl.filter((c) => anchors.some((a) => Math.abs(a - Math.round(c.x0 / 12)) <= 1)).length >= 2).length;
      const sel = rows.slice(i, last + 1);
      const box = {
        x0: Math.max(0, Math.min(...sel.map((r) => r.x0)) - 10),
        x1: Math.min(viewport.width, Math.max(...sel.map((r) => r.x1)) + 10),
        y0: Math.max(0, Math.min(...sel.map((r) => r.y0)) - 8),
        y1: Math.min(viewport.height, Math.max(...sel.map((r) => r.y1)) + 8),
        kind: 'table',
      };
      if (anchors.length >= 2 && aligned / run.length >= 0.7 && box.y1 - box.y0 < viewport.height * 0.75) out.push(box);
    }
    i = last + 1;
  }
  return out;
}

module.exports = { findTableRegions, findFigureRegions, findGridRegions, rowsOf };
