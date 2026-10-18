// Loads career_roadmaps/*.json into the career_roadmaps table, all in one
// transaction. The database is the live copy — admins edit it in the admin
// panel (Roadmaps) — so by default only careers with no roadmap yet are
// filled in; an admin's edits are never overwritten unless you ask.
//   npm run seed-roadmaps                  add missing roadmaps
//   npm run seed-roadmaps -- --overwrite   also replace existing ones (discards admin edits)
//   npm run seed-roadmaps -- --check       validate the files only (no database)
//
// One file per career: { career, emoji, steps: [{ period, title, actions[] }] }.
// `career` must match a title in the careers table exactly (foreign key).
import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';

const dir = new URL('../career_roadmaps/', import.meta.url);
const checkOnly = process.argv.includes('--check');
const overwrite = process.argv.includes('--overwrite');

function validate(file, rm) {
  const fail = msg => { throw new Error(`${file}: ${msg}`); };
  const text = v => typeof v === 'string' && v.trim().length > 0;
  if (!text(rm.career) || rm.career.length > 80) fail('career must be 1-80 characters');
  if (!Array.isArray(rm.steps) || rm.steps.length === 0) fail('steps must be a non-empty array');
  rm.steps.forEach((s, i) => {
    if (!text(s.period) || !text(s.title)) fail(`step ${i + 1} needs a period and a title`);
    if (!Array.isArray(s.actions) || !s.actions.length || !s.actions.every(text)) fail(`step ${i + 1} needs actions`);
  });
}

const roadmaps = readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(file => {
  const rm = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  validate(file, rm);
  return rm;
});
const dupes = roadmaps.map(r => r.career).filter((c, i, all) => all.indexOf(c) !== i);
if (dupes.length) throw new Error(`more than one file for: ${dupes.join(', ')}`);
console.log(`${roadmaps.length} roadmaps valid`);
if (checkOnly) process.exit(0);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  // An overwrite bumps the version, so an admin mid-edit gets a conflict
  // instead of silently undoing it.
  const onConflict = overwrite
    ? `DO UPDATE SET emoji = EXCLUDED.emoji, steps = EXCLUDED.steps, updated_by = NULL,
         version = career_roadmaps.version + 1, updated_at = now()`
    : 'DO NOTHING';
  let saved = 0;
  for (const rm of roadmaps) {
    const { rowCount } = await client.query(
      `INSERT INTO career_roadmaps (career, emoji, steps) VALUES ($1, $2, $3)
       ON CONFLICT (career) ${onConflict}`,
      [rm.career, rm.emoji || null, JSON.stringify(rm.steps)]);
    saved += rowCount;
  }
  await client.query('COMMIT');
  console.log(overwrite ? `saved ${saved} roadmaps` :
    `added ${saved} missing roadmaps; ${roadmaps.length - saved} already in the database were left as they are`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error(`nothing saved: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
