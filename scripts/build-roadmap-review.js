// Builds docs/roadmaps/review.html: every career_roadmaps/*.json file drawn
// like app.html#/roadmap, in catalogue order, each marked against the
// database: Live (same as saved), File differs from database (edited in the
// file, or by an admin in the panel — the database is the live copy) or
// New (not saved yet). Also checks each file against the careers table.
//   npm run roadmap-review
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';

const dir = new URL('../career_roadmaps/', import.meta.url);
const out = new URL('../docs/roadmaps/review.html', import.meta.url);

const files = {};
for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const rm = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  files[rm.career] = rm;
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let careers, saved;
try {
  careers = (await client.query('SELECT * FROM careers ORDER BY sort_order, title')).rows;
  saved = Object.fromEntries((await client.query('SELECT career, emoji, steps FROM career_roadmaps')).rows
    .map(r => [r.career, r]));
} finally {
  await client.end();
}

// ── Checks ──────────────────────────────────────────────────────────────
const problems = [];
const titles = new Set(careers.map(c => c.title));
Object.keys(files).filter(t => !titles.has(t)).forEach(t => problems.push(`not a career in the catalogue: ${t}`));
for (const c of careers) {
  const rm = files[c.title];
  if (!rm) { problems.push(`no roadmap file: ${c.title}`); continue; }
  if (rm.steps.length !== 5) problems.push(`${c.title}: ${rm.steps.length} steps (expected 5)`);
  const salary = c.salary.replace(/ starting$/, '');
  const last = rm.steps[rm.steps.length - 1].title;
  if (c.salary !== 'Varies widely' && !last.includes(salary)) {
    problems.push(`${c.title}: last step "${last}" doesn't show the catalogue salary "${c.salary}"`);
  }
}

const status = c => {
  const rm = files[c.title], db = saved[c.title];
  if (!db) return ['new', 'New · not saved yet'];
  return isDeepStrictEqual(db.steps, rm.steps) && db.emoji === rm.emoji
    ? ['live', 'Live'] : ['changed', 'File differs from database'];
};

// ── Page ────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const anchor = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const shown = careers.filter(c => files[c.title]);
const counts = { live: 0, changed: 0, new: 0 };
shown.forEach(c => counts[status(c)[0]]++);

const families = [];
for (const c of shown) {
  const last = families[families.length - 1];
  if (last && last.name === c.family) last.items.push(c);
  else families.push({ name: c.family, items: [c] });
}

const card = c => {
  const rm = files[c.title];
  const [cls, label] = status(c);
  return `<section class="career" id="${anchor(c.title)}">
  <div class="head"><h2>${esc(c.emoji + ' ' + c.title)}</h2><span class="tag ${cls}">${label}</span></div>
  <div class="meta">${esc(c.field)} · ${esc(c.stream)} · ${esc(c.salary)}</div>
  <div class="timeline">${rm.steps.map((s, i) => `
    <div class="tl-item${i === 0 ? ' done' : ''}"><div class="tl-dot"></div><div class="tl-card">
      <div class="tl-year">${esc(s.period)}</div><div class="tl-title">${esc(s.title)}</div>
      ${s.actions.map(a => `<div class="tl-action">${esc(a)}</div>`).join('')}
    </div></div>`).join('')}
  </div>
</section>`;
};

writeFileSync(out, `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Career roadmaps · review</title>
<style>
:root{--bg:#0d0c14;--surface:#16151f;--border:#2a2838;--text:#ecebf5;--muted:#9a97ad;--accent:#6c63ff;--accent2:#43e8d8;--warn:#ffb547;--bad:#ff6584}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
.layout{display:grid;grid-template-columns:280px 1fr;max-width:1200px;margin:0 auto}
nav{position:sticky;top:0;height:100vh;overflow-y:auto;padding:28px 18px;border-right:1px solid var(--border);font-size:13px}
nav h3{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:18px 0 6px}
nav a{display:block;color:#cfcde0;text-decoration:none;padding:3px 0}nav a:hover{color:var(--accent2)}
main{padding:36px 32px 80px;max-width:860px}h1{font-size:26px;margin:0 0 6px}.sub{color:var(--muted);margin:0 0 20px}
.note{border-radius:12px;padding:12px 16px;font-size:14px;margin-bottom:20px;background:rgba(255,181,71,.08);border:1px solid rgba(255,181,71,.3)}
.note.bad{background:rgba(255,101,132,.08);border-color:rgba(255,101,132,.35)}
.career{margin:0 0 48px;padding-top:12px;border-top:1px solid var(--border)}.head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
h2{font-size:20px;margin:8px 0 2px}.meta{color:var(--muted);font-size:13px;margin-bottom:16px}
.tag{font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px}.live{background:rgba(67,232,216,.12);color:var(--accent2)}
.new,.changed{background:rgba(255,181,71,.12);color:var(--warn)}
.timeline{position:relative;padding-left:36px}.timeline::before{content:'';position:absolute;left:14px;top:20px;bottom:20px;width:2px;background:linear-gradient(to bottom,var(--accent),var(--accent2))}
.tl-item{position:relative;margin-bottom:16px}.tl-dot{position:absolute;left:-29px;top:18px;width:14px;height:14px;border-radius:50%;background:var(--bg);border:2px solid var(--accent)}
.tl-item.done .tl-dot{background:var(--accent2);border-color:var(--accent2)}
.tl-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 18px}
.tl-year{font-size:12px;font-weight:700;color:var(--accent2);text-transform:uppercase;letter-spacing:.5px}.tl-title{font-size:15px;font-weight:800;margin:3px 0 8px}
.tl-action{position:relative;padding-left:18px;color:#cfcde0;font-size:14px;margin-bottom:4px}.tl-action::before{content:'→';position:absolute;left:0;color:var(--accent)}
code{background:#0a0910;border:1px solid var(--border);border-radius:6px;padding:1px 6px;font-size:13px}
@media(max-width:860px){.layout{grid-template-columns:1fr}nav{position:static;height:auto;border-right:0}}
</style></head><body><div class="layout">
<nav><strong>Careers</strong>${families.map(f => `<h3>${esc(f.name)}</h3>${f.items.map(c =>
  `<a href="#${anchor(c.title)}">${esc(c.emoji + ' ' + c.title)}</a>`).join('')}`).join('')}</nav>
<main>
<h1>Career roadmaps · review</h1>
<p class="sub">${shown.length} roadmaps from <code>career_roadmaps/*.json</code> · ${counts.live} live · ${counts.changed} changed · ${counts.new} new.
Save with <code>npm run seed-roadmaps</code>; rebuild this page with <code>npm run roadmap-review</code>.</p>
${problems.length ? `<div class="note bad"><strong>${problems.length} problem(s):</strong><br>${problems.map(esc).join('<br>')}</div>` : ''}
<div class="note"><strong>Check before saving:</strong> exam names and eligibility, institute names, and salary growth figures.
Starting salaries come from the careers table so the app stays consistent.</div>
${shown.map(card).join('\n')}
</main></div></body></html>
`);

console.log(`docs/roadmaps/review.html: ${counts.live} live, ${counts.changed} changed, ${counts.new} new`);
if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; }
