// Every news provider My Career Space pulls from. Results from all of them
// are merged, de-duplicated and sorted newest first (news.service.js).
//
// Adding a provider: create a file here exporting
//   { name,                         shown under the feed ("Headlines from …")
//     enabled(),                    false when its API key isn't set
//     async search(query, { signal }) → [{ title, url, source, published_at, image }] }
// where `query` is a NewsQuery (../query.js has the shape and formatters),
// then add it to PROVIDERS. A provider that throws or times out is skipped
// for that request; the others still answer.
//
// NEWS_DISABLE (comma-separated names, e.g. "Google News") switches
// providers off without a deploy.
import { gnews } from './gnews.js';
import { googleNewsRss } from './googleNewsRss.js';

const PROVIDERS = [gnews, googleNewsRss];

export function activeProviders() {
  const off = (process.env.NEWS_DISABLE || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return PROVIDERS.filter(p => p.enabled() && !off.includes(p.name.toLowerCase()));
}
