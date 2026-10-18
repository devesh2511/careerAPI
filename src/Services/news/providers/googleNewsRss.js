// Google News search, through its public RSS feed (India edition, English).
// No key and no quota, so it is always on. Google's feed terms allow
// "personal, non-commercial use" only: set NEWS_DISABLE=Google News to
// switch it off once a commercial provider covers the app.
import { searchString } from '../query.js';

export const googleNewsRss = {
  name: 'Google News',

  enabled() { return true; },

  async search(q, { signal }) {
    const params = new URLSearchParams({
      q: `${searchString(q)} when:${q.days}d`,
      hl: 'en-IN', gl: 'IN', ceid: 'IN:en',
    });
    const res = await fetch(`https://news.google.com/rss/search?${params}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseItems(await res.text());
  },
};

// The feed is flat and regular, so a few patterns read it without an XML
// parser dependency.
function parseItems(xml) {
  const items = [];
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const source = tag(item, 'source');
    let title = tag(item, 'title');
    // Titles end in " - Publisher", which the card shows separately.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const date = new Date(tag(item, 'pubDate'));
    items.push({
      title,
      url: tag(item, 'link'),
      source,
      published_at: isNaN(date) ? null : date.toISOString(),
      image: null,
    });
  }
  return items;
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  const text = m[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1');
  return decodeEntities(text).trim();
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return NAMED[e.toLowerCase()] ?? all;
  });
}
