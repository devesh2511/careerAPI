// The CareerNews object in docs/openapi.yaml: one career's My Career Space feed.
export class CareerNewsDTO {
  // career: careers row; row: career_news row; categories: news.service CATEGORIES.
  constructor(career, row, categories) {
    this.career = { title: career.title, emoji: career.emoji };
    this.categories = categories.map(c => ({
      key: c.key,
      label: c.label,
      items: (row.feed[c.key] || []).map(item => new NewsItemDTO(item)),
    }));
    this.sources = row.sources;
    this.updated_at = row.fetched_at;
  }
}

export class NewsItemDTO {
  constructor(item) {
    this.title = item.title;
    this.url = item.url;
    this.source = item.source || null;
    this.published_at = item.published_at || null;
    this.image = item.image || null;
    this.provider = item.provider;
  }
}
