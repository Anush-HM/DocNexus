// backend/services/rateLimiter.js
// ─────────────────────────────────────────────
//  Shared rate limiter for Cohere's trial-tier cap
//  (20 API calls / minute, account-wide — shared
//  across vision, SVG generation, fusion, everything
//  using the same COHERE_API_KEY).
//
//  Concurrency settings elsewhere (VISION_CONCURRENCY,
//  SVG_CONCURRENCY) control how many calls run in
//  parallel, but NOT how many happen per minute — you
//  can still blow through 20/min even at low concurrency
//  if there's enough work queued up. This tracks actual
//  call timestamps in a rolling 60s window and makes
//  callers wait if they'd exceed the cap, so concurrency
//  can be tuned for speed without separately worrying
//  about 429s.
// ─────────────────────────────────────────────

const MAX_CALLS_PER_WINDOW = 18; // stay a little under Cohere's 20/min cap as safety margin
const WINDOW_MS = 60 * 1000;

const callTimestamps = [];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call this right before making a Cohere API request. Resolves
 * immediately if under the limit; otherwise waits until a slot
 * frees up in the rolling window.
 */
async function throttle() {
  while (true) {
    const now = Date.now();
    while (callTimestamps.length && now - callTimestamps[0] > WINDOW_MS) {
      callTimestamps.shift();
    }

    if (callTimestamps.length < MAX_CALLS_PER_WINDOW) {
      callTimestamps.push(now);
      return;
    }

    const waitMs = WINDOW_MS - (now - callTimestamps[0]) + 50;
    await wait(Math.max(waitMs, 100));
  }
}

module.exports = { throttle };