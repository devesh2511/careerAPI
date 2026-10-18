// Applies migrations/*.sql in filename order, each in its own transaction,
// and records them in schema_migrations so each runs only once.
//   npm run migrate
// Every migration must still be idempotent, so re-running one is harmless:
// CREATE ... IF NOT EXISTS / CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS,
// INSERT ... ON CONFLICT DO NOTHING, and a guard on anything else (UPDATEs,
// ADD CONSTRAINT) so a second run changes nothing.
import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';

const dir = new URL('../migrations/', import.meta.url);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    text        PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await client.query('SELECT version FROM schema_migrations');
  const done = new Set(rows.map(r => r.version));
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(new URL(file, dir), 'utf8'));
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log('applied', file);
      applied++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`failed ${file}: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!applied && !process.exitCode) console.log('database is up to date');
} finally {
  await client.end();
}
