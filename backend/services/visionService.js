// backend/services/visionService.js
// ─────────────────────────────────────────────
//  Sends a rendered PDF-page image to Cohere's vision
//  model and gets back a text description, so diagrams
//  and charts become searchable/embeddable text.
//
//  NOTE: verify the exact model name your COHERE_API_KEY
//  has access to — Cohere's docs currently list
//  "command-a-vision-07-2025". Check docs.cohere.com/docs/command-a-vision
//  and update VISION_MODEL below if it differs from your plan's
//  "command-a-vision-03-2025".
// ─────────────────────────────────────────────

const VISION_MODEL = process.env.COHERE_VISION_MODEL || 'command-a-vision-07-2025';
const COHERE_CHAT_V2_URL = 'https://api.cohere.com/v2/chat';

const DESCRIBE_PROMPT = `This is a page from a study document. Ignore any body text you can already
read elsewhere — focus ONLY on diagrams, charts, graphs, tables, or figures
present on this page. For each one, describe what it shows in plain text
(labels, relationships, trends, structure) so a student who cannot see the
image can still understand it. If the page has no diagrams/charts/figures,
respond with exactly: NO_VISUAL_CONTENT`;

/**
 * Describe the diagrams/charts on a single page image.
 * @param {string} base64Png - base64-encoded PNG (no data: prefix)
 * @returns {Promise<string|null>} description text, or null if no visual content
 */
async function describePageImage(base64Png) {
  const res = await fetch(COHERE_CHAT_V2_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: DESCRIBE_PROMPT },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${base64Png}` },
            },
          ],
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Cohere vision call failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.message?.content?.[0]?.text?.trim() || '';

  if (!text || text === 'NO_VISUAL_CONTENT') return null;
  return text;
}

/**
 * Describe multiple rendered pages, skipping pages with no visual content.
 * Runs sequentially to stay well within trial-key rate limits — bump
 * concurrency later once you're off the free tier.
 * @param {{ pageNumber: number, base64: string }[]} pageImages
 * @returns {Promise<{ pageNumber: number, description: string }[]>}
 */
async function describePages(pageImages) {
  const results = [];
  for (const { pageNumber, base64 } of pageImages) {
    try {
      const description = await describePageImage(base64);
      if (description) results.push({ pageNumber, description });
    } catch (err) {
      console.error(`[visionService] Page ${pageNumber} failed:`, err.message);
      // Don't let one bad page kill the whole pipeline
    }
  }
  return results;
}

module.exports = { describePageImage, describePages };