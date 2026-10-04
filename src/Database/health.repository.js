import { db as defaultDb } from './db.js';

export async function databaseInfo(db = defaultDb) {
  const { rows } = await db.query('SELECT version(), now() AS server_time');
  return rows[0];
}
