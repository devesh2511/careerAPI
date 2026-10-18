// Turns a NewsQuery into search syntax. Every provider in providers/ is
// handed the same NewsQuery, so a new provider only has to format it:
//   { terms: ['robotics', 'mechatronics'],   any of these (the career)
//     topic: ['jobs', 'hiring'],             and any of these (the tab); may be empty
//     days:  30 }                            published in the last `days` days
// GNews and Google News both read OR, parentheses and "quoted phrases".
// Keep queries to one AND of two OR groups: Google News quietly returns
// almost nothing for deeper nesting like ((a b) OR c).

// A bare word stays bare; anything else (spaces, "e-commerce", "UI/UX") is quoted.
export function term(t) {
  return /^[\p{L}\p{N}]+$/u.test(t) ? t : `"${t.replace(/"/g, '')}"`;
}

export function anyOf(list) {
  const parts = list.map(term);
  return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
}

// (terms) AND (topic). `and` is the provider's AND operator: Google News
// reads a space, GNews wants AND.
export function searchString(q, and = ' ') {
  let s = anyOf(q.terms);
  if (q.topic && q.topic.length) s += and + anyOf(q.topic);
  return s;
}
