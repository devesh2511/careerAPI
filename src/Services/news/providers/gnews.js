// GNews (gnews.io): a news search API. Needs GNEWS_API_KEY; without it this
// provider is switched off and the others carry on. The free plan allows
// 100 requests a day and 10 articles per request; a paid plan is needed for
// commercial use and lifts both limits (set GNEWS_MAX to its article cap).
import { searchString } from '../query.js';

const DAY = 24 * 3600e3;
// GNews answers 429 to requests closer together than about a second, and a
// feed refresh asks it 4-5 queries at once, so they are sent one at a time,
// GAP_MS apart; network jitter can still land two closer together, so a 429
// gets one retry in the next slot. A query still waiting when its signal
// times out is dropped.
const GAP_MS = 1_100;
let nextSlot = 0;

function waitTurn(signal) {
  const wait = Math.max(0, nextSlot - Date.now());
  nextSlot = Date.now() + wait + GAP_MS;
  if (!wait) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, wait);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}

export const gnews = {
  name: 'GNews',

  enabled() { return !!process.env.GNEWS_API_KEY; },

  async search(q, { signal }) {
    const params = new URLSearchParams({
      q: searchString(q, ' AND '),
      lang: 'en',
      country: 'in',
      max: process.env.GNEWS_MAX || '10',
      sortby: 'publishedAt',
      from: new Date(Date.now() - q.days * DAY).toISOString().replace(/\.\d+Z$/, 'Z'),
      apikey: process.env.GNEWS_API_KEY,
    });
    const url = `https://gnews.io/api/v4/search?${params}`;
    await waitTurn(signal);
    let res = await fetch(url, { signal });
    if (res.status === 429) {
      await waitTurn(signal);
      res = await fetch(url, { signal });
    }
    if (!res.ok) {
      // 403: daily quota used up; 429: too many requests at once.
      const body = await res.json().catch(() => ({}));
      throw new Error(`HTTP ${res.status} ${(body.errors || []).join('; ')}`);
    }
    const { articles = [] } = await res.json();
    return articles.map(a => ({
      title: a.title,
      url: a.url,
      source: a.source && a.source.name,
      published_at: a.publishedAt,
      image: a.image || null,
    }));
  },
};
