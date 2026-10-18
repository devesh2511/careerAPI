// My Career Space: the latest news, jobs, exams and scholarships for one
// career, merged from every provider in news/providers/. A career's feed is
// kept in career_news for NEWS_CACHE_HOURS (default 6), so most page views
// never reach a provider and the paid APIs' daily quotas last.
import { ApiError } from '../DTO/ApiError.js';
import { CareerNewsDTO } from '../DTO/CareerNewsDTO.js';
import * as news from '../Database/news.repository.js';
import { activeProviders } from './news/providers/index.js';

// The tabs, in order. queries(terms, career) → the NewsQuerys (news/query.js)
// whose results fill the tab; each one is a request to every provider.
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
    // is exam news for an engineering aspirant.
    key: 'exams', label: 'Exams & Admissions',
    queries: (terms, career) => [
      { terms, topic: ['exam', 'entrance', 'admission', 'admissions', 'counselling'], days: 30 },
      ...(career.exam_terms && career.exam_terms.length ? [{ terms: career.exam_terms, topic: [], days: 30 }] : []),
    ],
  },
  {
    key: 'scholarships', label: 'Scholarships & Competitions',
    queries: terms => [{ terms, topic: ['scholarship', 'olympiad', 'competition', 'hackathon', 'fellowship'], days: 60 }],
  },
];

const PER_CATEGORY = 30;
const TIMEOUT_MS = 6_000;
// Headlines a Class 10 student shouldn't be shown alongside career advice.
const BLOCKED = /\b(rape[ds]?|raping|murder(ed|s)?|suicides?|porn\w*|sex(ual)? (assault|abuse|harassment)|molest\w*|beheaded)\b/i;

const cacheHours = () => Number(process.env.NEWS_CACHE_HOURS) || 6;

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

// Asks every active provider every category's queries at once. → { feed, sources }
export async function fetchFeed(career, providers = activeProviders()) {
  const terms = career.news_terms && career.news_terms.length ? career.news_terms : termsFromTitle(career.title);
  const answered = new Set();

  const search = (p, query, cat) => p.search(query, { signal: AbortSignal.timeout(TIMEOUT_MS) }).then(items => {
    answered.add(p.name);
    const named = mentions(query.terms);
    return items.map(item => ({ ...item, provider: p.name, strong: named.test(item.title || '') }));
  }, err => {
    console.error(`news: ${p.name} failed for ${career.title} / ${cat.key}: ${err.message}`);
    return [];
  });

  const lists = await Promise.all(CATEGORIES.map(async cat => {
    const results = await Promise.all(cat.queries(terms, career).flatMap(query => providers.map(p => search(p, query, cat))));
    return [cat.key, merge(results)];
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

// lists: one result list per (query, provider), items marked `strong` when
// the headline names the query's terms. Strong items fill the tab first, the
// rest only the places left over. Within each pass it takes from every list
// in turn, so a query with lots of hits can't crowd out the others. Skips
// unusable and blocked items and repeats (the same story from two
// providers, or syndicated under one headline). → up to PER_CATEGORY, newest first.
function merge(lists) {
  const byDate = (a, b) => (b.published_at || '').localeCompare(a.published_at || '');
  const usable = lists.map(list => list
    .filter(item => item.title && /^https?:\/\//i.test(item.url || '') && !BLOCKED.test(item.title))
    .sort(byDate));
  const seen = new Set(), out = [];
  for (const strong of [true, false]) {
    const queues = usable.map(list => list.filter(item => item.strong === strong));
    for (let i = 0; out.length < PER_CATEGORY && queues.some(q => i < q.length); i++) {
      for (const q of queues) {
        const item = q[i];
        if (!item || out.length >= PER_CATEGORY) continue;
        const key = item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 80);
        if (seen.has(key)) continue;
        seen.add(key);
        const { strong: _, ...kept } = item;
        out.push(kept);
      }
    }
  }
  return out.sort(byDate);
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
