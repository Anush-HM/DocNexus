// backend/services/pdfImageService.js
// ─────────────────────────────────────────────
//  Extracts the REAL images/figures from a PDF
//  (no AI calls, no re-drawing as SVG).
//
//  How it works:
//   1. Walk each page's operator list and track the
//      transform matrix, so we know exactly where every
//      image is placed on the page.
//   2. Merge boxes that touch/overlap (notes exported from
//      Word/PPT often slice one picture into several strips).
//   3. Render ONLY pages that actually have images, crop the
//      merged boxes out of the render and encode as JPEG.
//
//  Pages with no images are never rendered, so this is far
//  faster than the old render-everything + vision-model path.
// ─────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createCanvas } = require('@napi-rs/canvas');

let pdfjsLibPromise = null;
function getPdfjsLib() {
  if (!pdfjsLibPromise) pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsLibPromise;
}

const RENDER_SCALE = 2;          // render resolution for crops
const MIN_SIDE_PX = 90;          // ignore icons / bullets / rules (px at RENDER_SCALE)
const MIN_AREA_FRACTION = 0.012; // ignore boxes smaller than ~1.2% of the page
const MERGE_GAP_PX = 14;         // boxes closer than this are one figure
const MAX_OUTPUT_WIDTH = 1000;   // downscale big crops (keeps MongoDB docs small)
const MAX_SCAN_WIDTH = 1500;     // scanned/handwritten pages need more resolution to stay legible
const NEAR_DUP_BITS = 2;         // perceptual hashes this close = same figure
const JPEG_QUALITY = 82;
const VECTOR_OPS_THRESHOLD = 250; // vector-heavy page with no raster = probably a drawn diagram
const REPEAT_PAGES_LIMIT = 3;    // same image on >= this many pages = logo/watermark, skip
const REPEAT_BOX_PAGES = 3;      // an image drawn at the same spot on >= this many pages ...
const REPEAT_BOX_FRACTION = 0.25; // ... AND on >= this share of the document = watermark/letterhead
const BACKGROUND_COVERAGE = 0.45; // a box this big behind a text-heavy page is a background, not a figure
const BACKGROUND_TEXT_CHARS = 500;


// Branding junk (site logos, QR codes, "scan to download" badges) is never a study figure.
// Heuristic: small, nearly pure black/white pictures that are square-ish (QR) or sit in the
// header/footer band of the page (logo). Real diagrams are larger or contain greys/colours.
function binaryShare(canvas) {
  const w = 48, h = 48;
  const c = createCanvas(w, h);
  const x = c.getContext('2d');
  x.drawImage(canvas, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  let extreme = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    if (l < 40 || l > 215) extreme++;
  }
  return extreme / (w * h);
}

function isBrandingJunk(box, viewport, outCanvas) {
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const areaFrac = (bw * bh) / (viewport.width * viewport.height);
  const aspect = bw / Math.max(1, bh);
  const inMargin = box.y1 < viewport.height * 0.14 || box.y0 > viewport.height * 0.88;
  if (areaFrac < 0.12 && inMargin) return true;                  // header/footer logo
  if (aspect > 5 || aspect < 0.2) return areaFrac < 0.12;        // thin banner / strip
  if (areaFrac < 0.12) {
    const bin = binaryShare(outCanvas);
    if (bin > 0.88 && aspect > 0.7 && aspect < 1.4) return true;   // QR code (+ its caption)
    if (bin > 0.9 && areaFrac < 0.04 && aspect < 3 && box.y1 < viewport.height * 0.4) return true; // small top-of-page logo
  }
  return false;
}

// 64-bit difference hash: survives re-encoding / slight rescaling, so the SAME
// figure appearing in two different PDFs (combined notes) is recognised.
function dHash(srcCanvas) {
  const w = 9, h = 8;
  const c = createCanvas(w, h);
  const x = c.getContext('2d');
  x.drawImage(srcCanvas, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  let bits = 0n;
  for (let y = 0; y < h; y++) {
    for (let i = 0; i < w - 1; i++) {
      const a = d[(y * w + i) * 4] * 0.299 + d[(y * w + i) * 4 + 1] * 0.587 + d[(y * w + i) * 4 + 2] * 0.114;
      const b = d[(y * w + i + 1) * 4] * 0.299 + d[(y * w + i + 1) * 4 + 1] * 0.587 + d[(y * w + i + 1) * 4 + 2] * 0.114;
      bits = (bits << 1n) | (a > b ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}

// Larger hash on the picture with its white margins trimmed: the same figure cropped slightly
// differently (with / without caption) in two PDFs still matches, different tables do not.
function trimmedHash(srcCanvas) {
  const W = 160;
  const sc = W / srcCanvas.width;
  const H = Math.max(8, Math.round(srcCanvas.height * sc));
  const c = createCanvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  x.drawImage(srcCanvas, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const i = (yy * W + xx) * 4;
    if (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < 215) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
  }
  if (x1 <= x0 || y1 <= y0) return { ph2: null, ar2: 0 };
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const c2 = createCanvas(16, 16);
  const x2 = c2.getContext('2d');
  x2.fillStyle = '#fff'; x2.fillRect(0, 0, 16, 16);
  x2.drawImage(c, x0, y0, bw, bh, 0, 0, 16, 16);
  const e = x2.getImageData(0, 0, 16, 16).data;
  const g = [];
  for (let i = 0; i < 256; i++) g.push(e[i * 4] * 0.299 + e[i * 4 + 1] * 0.587 + e[i * 4 + 2] * 0.114);
  const mean = g.reduce((a, b) => a + b, 0) / 256;
  let bits = 0n;
  for (let i = 0; i < 256; i++) bits = (bits << 1n) | (g[i] < mean ? 1n : 0n);
  return { ph2: bits.toString(16).padStart(64, '0'), ar2: bw / bh };
}

function hamming(h1, h2) {
  let x = BigInt('0x' + h1) ^ BigInt('0x' + h2);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

// ── matrix helpers (PDF [a,b,c,d,e,f]) ──
function mul(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

// image occupies the unit square under the current matrix
function unitSquareBox(m) {
  const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
  const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function overlapsOrNear(a, b, gap) {
  return a.x0 <= b.x1 + gap && b.x0 <= a.x1 + gap && a.y0 <= b.y1 + gap && b.y0 <= a.y1 + gap;
}

function mergeBoxes(boxes, gap) {
  let list = boxes.map((b) => ({ ...b }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (overlapsOrNear(list[i], list[j], gap)) {
          list[i] = {
            x0: Math.min(list[i].x0, list[j].x0),
            y0: Math.min(list[i].y0, list[j].y0),
            x1: Math.max(list[i].x1, list[j].x1),
            y1: Math.max(list[i].y1, list[j].y1),
            junk: !!(list[i].junk && list[j].junk),
          };
          list.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return list;
}


// A figure is more than its raster box: diagram labels, "Fig 3.1" captions and
// short callouts sit on/around the picture as normal PDF text. Grow the crop box to
// include them, so the figure is complete (and readable) instead of a bare picture.
const { findTableRegions, findFigureRegions, findGridRegions } = require('./tableRegions');
const CAPTION_RE = /^\s*(fig(ure)?\.?|table|diagram|chart|graph|source|image|illustration)\b/i;
function expandWithText(box, items, viewport) {
  const o = { ...box };          // judge every text item against the ORIGINAL picture box,
  let b = { ...box };            // so growing the crop can't chain-pull neighbouring paragraphs
  const reach = 22;              // px (at RENDER_SCALE): how close a short label must be
  const capGap = 60;             // px: how far above/below the picture a caption line may sit
  const pageW = viewport.width, pageH = viewport.height;
  const picW = o.x1 - o.x0;
  for (const t of items) {
    const cx = (t.x0 + t.x1) / 2, cy = (t.y0 + t.y1) / 2;
    const str = t.str.trim();
    const inside = cx > o.x0 && cx < o.x1 && cy > o.y0 && cy < o.y1;            // label drawn on the picture
    const nearBox = cx > o.x0 - reach && cx < o.x1 + reach && cy > o.y0 - reach && cy < o.y1 + reach;
    const short = str.length <= 28 && (t.x1 - t.x0) < picW * 0.6;
    const hOverlap = t.x1 > o.x0 && t.x0 < o.x1;
    const below = t.y0 >= o.y1 - 6 && t.y0 - o.y1 <= capGap;
    const above = t.y1 <= o.y0 + 6 && o.y0 - t.y1 <= capGap;
    const caption = hOverlap && (below || above) && CAPTION_RE.test(str);       // "Figure 3.1: ..." / "Table 2 ..."
    if (inside || (nearBox && short) || caption) {
      t.used = true;
      b = {
        x0: Math.min(b.x0, t.x0), y0: Math.min(b.y0, t.y0),
        x1: Math.max(b.x1, t.x1), y1: Math.max(b.y1, t.y1),
      };
    }
  }
  const usedText = items.filter((t) => t.used).map((t) => t.str).join(' ');
  const pad = 3;
  return {
    x0: Math.max(0, b.x0 - pad), y0: Math.max(0, b.y0 - pad),
    x1: Math.min(pageW, b.x1 + pad), y1: Math.min(pageH, b.y1 + pad),
    junk: /studocu|scan to open|downloaded by|scanned with|camscanner/i.test(usedText),
  };
}

/**
 * Find image placements + vector-drawing weight on one page.
 * Returns boxes in viewport pixel space (top-left origin).
 */
function scanOperatorList(opList, OPS, Util, viewportTransform) {
  const boxes = [];
  let vectorOps = 0;

  const stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];

  const imageOps = new Set(
    [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintJpegXObject].filter(
      (v) => v !== undefined
    )
  );

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    } else if (fn === OPS.transform) {
      ctm = mul(ctm, args);
    } else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (Array.isArray(args) && Array.isArray(args[0])) ctm = mul(ctm, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) {
      ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    } else if (imageOps.has(fn)) {
      const full = Util.transform(viewportTransform, ctm);
      boxes.push(unitSquareBox(full));
    } else if (fn === OPS.constructPath) {
      vectorOps++;
    }
  }
  return { boxes, vectorOps };
}

/**
 * @param {string} filePath
 * @param {object} [opts]
 * @param {number} [opts.maxPages=80]       pages scanned
 * @param {number} [opts.maxPerPage=3]      figures kept per page
 * @param {number} [opts.maxTotal=40]       figures kept per document
 * @param {string[]} [opts.pageTexts=[]]    extracted text per page (0-indexed), used to
 *                                          tell scanned pages / backgrounds from figures
 * @param {boolean} [opts.includeVectorPages=true]
 * @returns {Promise<{ pageNumber: number, image: string, width: number, height: number, kind: 'image'|'scan'|'vector' }[]>}
 *          `image` is a data: URI (image/jpeg)
 */
async function extractImagesFromPDF(
  filePath,
  { maxPages = 400, maxPerPage = 4, maxTotal = 120, pageTexts = [], includeVectorPages = true } = {}
) {
  const pdfjsLib = await getPdfjsLib();
  const { OPS, Util } = pdfjsLib;
  const data = new Uint8Array(fs.readFileSync(filePath));

  const standardFontDataUrl =
    path
      .join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')
      .split(path.sep)
      .join('/') + '/';

  const loadingTask = pdfjsLib.getDocument({ data, disableFontFace: true, standardFontDataUrl });
  const pdfDoc = await loadingTask.promise;

  const pageCount = Math.min(maxPages, pdfDoc.numPages);
  const found = [];
  const hashPages = new Map(); // hash -> Set(pageNumber) to catch repeated logos

  try {
    // ── Pass 1 (cheap, no rendering): where is every image placed on every page?
    // An image drawn at the same spot on many pages is a watermark / letterhead /
    // logo, never a figure, so it is ignored (and must not be merged into real figures).
    const scans = [];
    const boxPages = new Map(); // position signature -> Set(pageNumber)
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      try {
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const opList = await page.getOperatorList();
        const { boxes, vectorOps } = scanOperatorList(opList, OPS, Util, viewport.transform);
        const sigs = boxes.map((b) => {
          const q = (v, d) => Math.round(v / d / 0.03);
          return `${q(b.x0, viewport.width)}:${q(b.y0, viewport.height)}:${q(b.x1, viewport.width)}:${q(b.y1, viewport.height)}`;
        });
        sigs.forEach((sg) => {
          if (!boxPages.has(sg)) boxPages.set(sg, new Set());
          boxPages.get(sg).add(pageNum);
        });
        scans[pageNum] = { boxes, sigs, vectorOps, width: viewport.width, height: viewport.height };
      } finally {
        page.cleanup();
      }
    }
    const repeatedSig = (sg) => {
      const n = boxPages.get(sg)?.size || 0;
      return n >= REPEAT_BOX_PAGES && n >= pageCount * REPEAT_BOX_FRACTION;
    };

    // ── Pass 2: render only pages that still have a real figure, crop it out.
    for (let pageNum = 1; pageNum <= pageCount && found.length < maxTotal; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      try {
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const pageArea = viewport.width * viewport.height;
        const textLen = (pageTexts[pageNum - 1] || '').length;

        const sc = scans[pageNum];
        const vectorOps = sc.vectorOps;
        const boxes = sc.boxes.filter((_, i) => !repeatedSig(sc.sigs[i]));

        // 1) keep real-looking image boxes, merge strips of the same picture
        const sized = boxes.filter((b) => b.x1 - b.x0 >= MIN_SIDE_PX && b.y1 - b.y0 >= MIN_SIDE_PX);
        let merged = mergeBoxes(sized, MERGE_GAP_PX);
        merged = merged.filter((b) => (b.x1 - b.x0) * (b.y1 - b.y0) >= pageArea * MIN_AREA_FRACTION);

        // include the labels / caption that belong to each figure (not full-page scans)
        if (merged.length) {
          try {
            const tc = await page.getTextContent();
            const items = tc.items
              .filter((it) => it.str && it.str.trim())
              .map((it) => {
                const tr = Util.transform(viewport.transform, it.transform);
                const h = Math.max(6, (it.height || Math.abs(it.transform[3]) || 8) * RENDER_SCALE);
                const w = Math.max(4, (it.width || 0) * RENDER_SCALE);
                return { str: it.str, x0: tr[4], x1: tr[4] + w, y1: tr[5] + h * 0.25, y0: tr[5] - h };
              });
            merged = merged.map((b) => {
              const cov = ((b.x1 - b.x0) * (b.y1 - b.y0)) / pageArea;
              return cov > 0.6 ? b : expandWithText(b, items, viewport);
            });
            merged = mergeBoxes(merged, 0);
          } catch (e) { /* text lookup is best-effort: keep the plain image box */ }
        }

        const regions = [];
        for (const b of merged) {
          const coverage = ((b.x1 - b.x0) * (b.y1 - b.y0)) / pageArea;
          if (coverage > 0.85) {
            // Full-page picture: a scanned/photographed note page if there's
            // (almost) no real text, otherwise a decorative background → skip.
            if (textLen < 200) regions.push({ box: b, kind: 'scan' });
          } else if (coverage > BACKGROUND_COVERAGE && textLen >= BACKGROUND_TEXT_CHARS) {
            // Big picture sitting behind a page full of text = background/watermark, skip.
          } else {
            regions.push({ box: b, kind: 'image' });
          }
        }

        // 1b) tables: crop the whole table (caption + rows) as a picture, since extracted
        // text scrambles table cells
        const pageText = pageTexts[pageNum - 1] || '';
        if (pageText.length > 150) { // any text page: captioned tables/figures, and uncaptioned grids of short aligned cells
          try {
            const tc2 = await page.getTextContent();
            const titems = tc2.items
              .filter((it) => it.str && it.str.trim() && Math.abs(it.transform[1]) <= Math.abs(it.transform[0]) * 0.5) // skip rotated side-heads
              .map((it) => {
                const tr = Util.transform(viewport.transform, it.transform);
                const h = Math.max(6, (it.height || Math.abs(it.transform[3]) || 8) * RENDER_SCALE);
                const w = Math.max(4, (it.width || 0) * RENDER_SCALE);
                return { str: it.str, x0: tr[4], x1: tr[4] + w, y1: tr[5] + h * 0.25, y0: tr[5] - h };
              });
            for (const tb of [...findTableRegions(titems, viewport), ...findFigureRegions(titems, viewport), ...findGridRegions(titems, viewport)]) {
              const tArea = (tb.x1 - tb.x0) * (tb.y1 - tb.y0);
              const overlap = regions.some((r) => {
                const ix = Math.min(r.box.x1, tb.x1) - Math.max(r.box.x0, tb.x0);
                const iy = Math.min(r.box.y1, tb.y1) - Math.max(r.box.y0, tb.y0);
                return ix > 0 && iy > 0 && (ix * iy) / tArea > 0.4;
              });
              if (!overlap) regions.push({ box: tb, kind: tb.kind || 'table' });
            }
          } catch (e) { /* best-effort */ }
        }

        // 2) diagram drawn with vector graphics (no raster image at all)
        if (
          includeVectorPages &&
          regions.length === 0 &&
          sized.length === 0 &&
          vectorOps >= VECTOR_OPS_THRESHOLD &&
          textLen < 1500
        ) {
          regions.push({ box: { x0: 0, y0: 0, x1: viewport.width, y1: viewport.height }, kind: 'vector' });
        }

        if (regions.length === 0) {
          page.cleanup();
          continue;
        }

        // 3) render once, crop each region
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        // biggest figures first (by area), so the main diagram wins over small ones
        const area = (r) => (r.box.x1 - r.box.x0) * (r.box.y1 - r.box.y0);
        regions.sort((a, b) => area(b) - area(a));
        for (const { box, kind } of regions.slice(0, maxPerPage)) {
          if (found.length >= maxTotal) break;

          const pad = 6;
          const sx = Math.max(0, Math.floor(box.x0 - pad));
          const sy = Math.max(0, Math.floor(box.y0 - pad));
          const sw = Math.min(canvas.width - sx, Math.ceil(box.x1 - box.x0 + pad * 2));
          const sh = Math.min(canvas.height - sy, Math.ceil(box.y1 - box.y0 + pad * 2));
          if (sw < 40 || sh < 40) continue;

          const maxW = kind === 'scan' ? MAX_SCAN_WIDTH : MAX_OUTPUT_WIDTH;
          const outScale = sw > maxW ? maxW / sw : 1;
          const ow = Math.round(sw * outScale);
          const oh = Math.round(sh * outScale);
          const out = createCanvas(ow, oh);
          const octx = out.getContext('2d');
          octx.fillStyle = '#ffffff';
          octx.fillRect(0, 0, ow, oh);
          octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, ow, oh);
          if (kind === 'image' && (box.junk || isBrandingJunk(box, viewport, out))) continue;

          const buf = out.toBuffer('image/jpeg', JPEG_QUALITY);
          const phash = dHash(out);
          const { ph2, ar2 } = trimmedHash(out);
          const hash = crypto.createHash('sha1').update(buf).digest('hex');
          if (!hashPages.has(hash)) hashPages.set(hash, new Set());
          hashPages.get(hash).add(pageNum);

          found.push({
            pageNumber: pageNum,
            image: `data:image/jpeg;base64,${buf.toString('base64')}`,
            width: ow,
            height: oh,
            kind,
            _hash: hash,
            phash,
            ph2,
            ar2,
          });
        }
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  // drop logos/watermarks that repeat on many pages, and exact duplicates
  const kept = [];
  for (const f of found) {
    if ((hashPages.get(f._hash)?.size || 0) >= REPEAT_PAGES_LIMIT) continue;
    // exact or near-identical copy of a figure already kept from this document
    if (kept.some((k) =>
      k._hash === f._hash ||
      // same figure re-encoded: near-identical shape AND near-identical size ratio
      // (similar-looking tables/forms must NOT be mistaken for copies of each other)
      (hamming(k.phash, f.phash) <= NEAR_DUP_BITS && Math.abs(k.width / k.height - f.width / f.height) < 0.03)
    )) continue;
    kept.push(f);
  }
  return kept.map(({ _hash, ...rest }) => rest);
}

module.exports = { extractImagesFromPDF, hamming, NEAR_DUP_BITS };
