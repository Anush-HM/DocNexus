// backend/services/chunkService.js
// ─────────────────────────────────────────────
//  Phase 3: Document Chunking (LangChain.js)
//  Splits cleaned text into semantic chunks that are
//  easier to embed, compare, and retrieve.
// ─────────────────────────────────────────────

const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 150,
  separators: ['\n\n', '\n', '. ', ' ', ''],
});

/**
 * Split raw text into chunks.
 * @param {string} text
 * @returns {Promise<string[]>}
 */
async function chunkText(text) {
  if (!text || !text.trim()) return [];
  const docs = await splitter.createDocuments([text]);
  return docs.map((d) => d.pageContent.trim()).filter((t) => t.length > 20);
}

/**
 * Chunk text per-page so we can keep page-number attribution
 * for citations later (Phase 6 "source attribution").
 * @param {string[]} pages - array of page text
 * @returns {Promise<{ text: string, pageNumber: number }[]>}
 */
async function chunkPages(pages) {
  const allChunks = [];
  for (let i = 0; i < pages.length; i++) {
    const pageChunks = await chunkText(pages[i]);
    pageChunks.forEach((chunkText) => {
      allChunks.push({ text: chunkText, pageNumber: i + 1 });
    });
  }
  return allChunks;
}

module.exports = { chunkText, chunkPages };