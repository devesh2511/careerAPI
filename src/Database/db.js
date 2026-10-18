import pg from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env');
}

// Layerbase requires TLS; sslmode=require in the URL enables it.
// On Vercel a function sits frozen between requests, so its idle
// connections can be dead when it wakes: close them early and recycle the
// rest, so a request doesn't land on a socket the server already dropped.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 5_000,
  maxLifetimeSeconds: 60,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
});
// An idle connection dying emits 'error' on the pool; unhandled, it would
// crash the function and fail every request in flight on it.
pool.on('error', err => console.error('idle database connection failed:', err.message));

export const query = (text, params) => pool.query(text, params);

// The default executor for repository functions. Inside a transaction they
// are passed the transaction's client instead, which has the same .query().
export const db = { query };

// Runs fn(client) inside BEGIN/COMMIT, rolling back if it throws. A client
// that can't even roll back has a broken connection: it's thrown away, not
// handed back to the pool for the next request to fail on.
export async function withTransaction(fn) {
  const client = await pool.connect();
  let broken;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(e => { broken = e; });
    throw err;
  } finally {
    client.release(broken);
  }
}
