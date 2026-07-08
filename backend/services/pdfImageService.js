// backend/services/pdfImageService.js
// ─────────────────────────────────────────────
//  Renders each page of a PDF to a PNG image so a
//  vision model can describe diagrams/charts that
//  pdf-parse (text-only) silently drops.
// ─────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const IMAGE_DIR = path.join(__dirname, '..', 'uploads', 'page-images');
if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

// pdfjs-dist v6+ ships ESM-only (.mjs) — no CommonJS build anymore — so we
// can't `require()` it from this CommonJS file. `import()` works from CJS
// even though `require()` doesn't; cache it so we only pay the import
// cost once per process instead of on every call.
let pdfjsLibPromise = null;
function getPdfjsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsLibPromise;
}

/**
 * Render every page (or up to maxPages) of a PDF to a base64 PNG.
 * @param {string} filePath - absolute path to the PDF on disk
 * @param {object} opts
 * @param {number} [opts.maxPages] - cap on pages rendered (cost control)
 * @param {number} [opts.scale] - render scale; 1.5-2 is a good OCR-legible size
 * @returns {Promise<{ pageNumber: number, base64: string }[]>}
 */
async function renderPagesToImages(filePath, { maxPages = null, scale = 1.5 } = {}) {
  const pdfjsLib = await getPdfjsLib();
  const data = new Uint8Array(fs.readFileSync(filePath));

  // Points pdfjs at its own bundled standard fonts so pages using
  // non-embedded fonts (very common) render correctly instead of
  // warning and falling back to blank/incorrect glyphs.
  // NOTE: pdfjs treats this as a URL-like string internally and requires
  // a forward-slash trailing separator — on Windows, path.sep is "\",
  // which pdfjs rejects ("must include trailing slash"). So we build
  // this with a literal "/" and normalize any backslashes too.
  const standardFontDataUrl =
    path
      .join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')
      .split(path.sep)
      .join('/') + '/';

  const loadingTask = pdfjsLib.getDocument({ data, disableFontFace: true, standardFontDataUrl });
  const pdfDoc = await loadingTask.promise;

  const pageCount = maxPages ? Math.min(maxPages, pdfDoc.numPages) : pdfDoc.numPages;
  const images = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    images.push({
      pageNumber: pageNum,
      base64: canvas.toBuffer('image/png').toString('base64'),
    });

    page.cleanup();
  }

  await loadingTask.destroy();
  return images;
}

/**
 * Save specific page images (by pageNumber) to disk and return their
 * public URLs. Called AFTER vision-describing pages, so we only save
 * the pages that actually contain a diagram/chart — not every page.
 * @param {string} sourceDocumentId - used as a folder name, keeps files organized per PDF
 * @param {{ pageNumber: number, base64: string }[]} pageImages - full render output
 * @param {number[]} pageNumbersToSave - which pages to actually write to disk
 * @returns {{ pageNumber: number, url: string }[]}
 */
function saveSelectedPages(sourceDocumentId, pageImages, pageNumbersToSave) {
  const wanted = new Set(pageNumbersToSave);
  const docDir = path.join(IMAGE_DIR, String(sourceDocumentId));
  if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true });

  const saved = [];
  for (const { pageNumber, base64 } of pageImages) {
    if (!wanted.has(pageNumber)) continue;
    const fileName = `page-${pageNumber}.png`;
    fs.writeFileSync(path.join(docDir, fileName), Buffer.from(base64, 'base64'));
    saved.push({
      pageNumber,
      url: `/page-images/${sourceDocumentId}/${fileName}`,
    });
  }
  return saved;
}

module.exports = { renderPagesToImages, saveSelectedPages };