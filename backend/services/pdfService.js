// backend/services/pdfService.js
// ─────────────────────────────────────────────
//  Phase 2: Text Extraction
//  Extracts raw text (+ rough page boundaries) from
//  a PDF file on disk.
// ─────────────────────────────────────────────

const fs = require('fs');
const pdfParse = require('pdf-parse');

/**
 * Extract text from a PDF file.
 * @param {string} filePath - absolute path to the PDF on disk
 * @returns {Promise<{ text: string, pageCount: number, pages: string[] }>}
 */
async function extractTextFromPDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);

  // pdf-parse gives us full text; to recover a page-by-page split we use
  // its pagerender hook to capture text per page as it renders.
  const pages = [];

  const options = {
    pagerender: async (pageData) => {
      const renderOpts = {
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      };
      const textContent = await pageData.getTextContent(renderOpts);
      const pageText = textContent.items.map((item) => item.str).join(' ');
      pages.push(pageText);
      return pageText;
    },
  };

  const result = await pdfParse(dataBuffer, options);

  const cleanText = cleanExtractedText(result.text);

  return {
    text: cleanText,
    pageCount: result.numpages,
    pages: pages.map(cleanExtractedText),
  };
}

/**
 * Basic cleanup: collapse excess whitespace, strip control chars,
 * normalize line breaks. This is Phase 2's "Clean Text" step.
 */
function cleanExtractedText(raw) {
  if (!raw) return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { extractTextFromPDF, cleanExtractedText };