// My Career Space: the latest news, jobs, exams and scholarships for one
// career, merged from every provider in news/providers/. A career's feed is
// kept in career_news for NEWS_CACHE_HOURS (default 12), so most page views
// never reach a provider and the paid APIs' daily quotas last.
import { ApiError } from '../DTO/ApiError.js';
import { CareerNewsDTO } from '../DTO/CareerNewsDTO.js';
import * as news from '../Database/news.repository.js';
import { activeProviders } from './news/providers/index.js';

// The tabs, in order. queries(terms, career) → the NewsQuerys (news/query.js)
// whose results fill the tab; each one is a request to every provider.
// indiaPlaces: how many of the tab's places India stories get first
// (default INDIA_PLACES).
export const CATEGORIES = [
  {
    key: 'news', label: 'News & Trends',
    queries: terms => [{ terms, topic: [], days: 14 }],
  },
  {
    key: 'jobs', label: 'Jobs & Internships',
    queries: terms => [{ terms, topic: ['jobs', 'hiring', 'internship', 'recruitment', 'vacancies', 'placements'], days: 30 }],
  },
  {
    // Plus the career's entrance exams on their own: any "JEE Main" story
    // is exam news for an engineering aspirant. Another country's school
    // exams are rarely any use to a student here, so fewer world places.
    key: 'exams', label: 'Exams & Admissions', indiaPlaces: 25,
    queries: (terms, career) => [
      { terms, topic: ['exam', 'entrance', 'admission', 'admissions', 'counselling'], days: 30 },
      ...(career.exam_terms && career.exam_terms.length ? [{ terms: career.exam_terms, topic: [], days: 30, aboutIndia: true }] : []),
    ],
  },
  {
    key: 'scholarships', label: 'Scholarships & Competitions',
    queries: terms => [{ terms, topic: ['scholarship', 'olympiad', 'competition', 'hackathon', 'fellowship'], days: 60 }],
  },
];

const PER_CATEGORY = 30;
// Of a tab's places, up to this many go to India stories and the rest to
// stories from anywhere; either side fills the places the other can't.
const INDIA_PLACES = 20;
const TIMEOUT_MS = 6_000;
// Headlines a Class 10 student shouldn't be shown alongside career advice.
const BLOCKED = /\b(rape[ds]?|raping|murder(ed|s)?|suicides?|porn\w*|sex(ual)? (assault|abuse|harassment)|molest\w*|beheaded)\b/i;

const cacheHours = () => Number(process.env.NEWS_CACHE_HOURS) || 12;

// GET /career-news?career=. req: CareerRequest.
export async function getCareerNews(req) {
  const career = await news.findCareer(req.career);
  if (!career) throw ApiError.notFound('career');

  const cached = await news.findFeed(career.title);
  if (cached && Date.now() - new Date(cached.fetched_at) < cacheHours() * 3600e3) {
    return new CareerNewsDTO(career, cached, CATEGORIES);
  }

  const { feed, sources } = await refresh(career);
  // Every provider failed: an old feed beats an empty page.
  if (!sources.length && cached) return new CareerNewsDTO(career, cached, CATEGORIES);
  const row = await news.saveFeed(career.title, feed, sources);
  return new CareerNewsDTO(career, row, CATEGORIES);
}

// Two students opening the same career at once share one fetch.
const inFlight = new Map();
function refresh(career) {
  if (!inFlight.has(career.title)) {
    inFlight.set(career.title, fetchFeed(career).finally(() => inFlight.delete(career.title)));
  }
  return inFlight.get(career.title);
}

// Asks every active provider every category's queries at once. Each query
// runs twice, once narrowed to India (only for providers that can) and once
// worldwide, unless its results are Indian anyway. → { feed, sources }
export async function fetchFeed(career, providers = activeProviders()) {
  const terms = career.news_terms && career.news_terms.length ? career.news_terms : termsFromTitle(career.title);
  const answered = new Set();

  const search = (p, query, cat) => p.search(query, { signal: AbortSignal.timeout(TIMEOUT_MS) }).then(items => {
    answered.add(p.name);
    const named = mentions(query.terms);
    const indian = !!(query.india || query.aboutIndia || p.indiaOnly);
    return items.map(item => ({
      ...item, provider: p.name, strong: named.test(item.title || ''),
      india: indian || indianSite(item.source_url),
    }));
  }, err => {
    console.error(`news: ${p.name} failed for ${career.title} / ${cat.key}: ${err.message}`);
    return [];
  });

  const lists = await Promise.all(CATEGORIES.map(async cat => {
    const queries = cat.queries(terms, career).flatMap(q => (q.aboutIndia ? [q] : [{ ...q, india: true }, q]));
    const results = await Promise.all(queries.flatMap(query => providers
      .filter(p => !query.india || p.regional)
      .map(p => search(p, query, cat))));
    return [cat.key, merge(results, cat.indiaPlaces || INDIA_PLACES)];
  }));

  return {
    feed: Object.fromEntries(lists),
    sources: providers.map(p => p.name).filter(name => answered.has(name)),
  };
}

// Does a headline name one of these terms? Providers also match on the
// article body, which lets in stories that only mention the career in passing.
function mentions(terms) {
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})`, 'i');
}

// Is this publisher's site Indian? Only a .in address is sure: .com ones
// (ndtv.com, punchng.com) could be anywhere.
function indianSite(url) {
  try { return /\.in$/i.test(new URL(url).hostname); } catch { return false; }
}

// lists: one result list per (query, provider), items marked `strong` when
// the headline names the query's terms and `india` when they're Indian news.
// Up to indiaPlaces places go to India stories and the rest to the others;
// either side fills what the other can't. On each side strong items come
// first, the rest only get the places left over, and every list is taken
// from in turn, so a query with lots of hits can't crowd out the others.
// Skips unusable and blocked items and repeats (the same story from two
// providers or searches, or syndicated under one headline); a story any
// search marked India counts as India. → up to PER_CATEGORY, newest first.
function merge(lists, indiaPlaces) {
  const byDate = (a, b) => (b.published_at || '').localeCompare(a.published_at || '');
  const keyOf = item => item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 80);
  const usable = lists.map(list => list
    .filter(item => item.title && /^https?:\/\//i.test(item.url || '') && !BLOCKED.test(item.title))
    .sort(byDate));
  const indian = new Set(usable.flat().filter(item => item.india).map(keyOf));

  // Every story once, best first.
  const seen = new Set(), ranked = [];
  for (const strong of [true, false]) {
    const queues = usable.map(list => list.filter(item => item.strong === strong));
    for (let i = 0; queues.some(q => i < q.length); i++) {
      for (const q of queues) {
        const item = q[i];
        if (!item) continue;
        const key = keyOf(item);
        if (seen.has(key)) continue;
        seen.add(key);
        ranked.push({ item, india: indian.has(key) });
      }
    }
  }

  const picked = new Set([
    ...ranked.filter(r => r.india).slice(0, indiaPlaces),
    ...ranked.filter(r => !r.india).slice(0, PER_CATEGORY - indiaPlaces),
  ]);
  for (const r of ranked) {
    if (picked.size >= PER_CATEGORY) break;
    picked.add(r);
  }
  // strong, india and source_url are only for picking; the feed doesn't keep them.
  return [...picked]
    .map(({ item: { strong: _s, india: _i, source_url: _u, ...kept } }) => kept)
    .sort(byDate);
}

// For a career with no news_terms: "Drone Technology Specialist" → ["Drone Technology"],
// "Data Scientist / Data Analyst" → ["Data Scientist", "Data Analyst"].
const ROLE = /\s+(engineer|specialist|developer|officer|manager|executive|consultant|technologist)$/i;
export function termsFromTitle(title) {
  return title
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s*[\/&]\s*/)
    .map(part => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map(part => (ROLE.test(part) && part.replace(ROLE, '').length >= 5 ? part.replace(ROLE, '') : part));
}
