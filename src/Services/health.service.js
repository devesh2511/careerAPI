import { databaseInfo } from '../Database/health.repository.js';

export async function checkHealth() {
  const info = await databaseInfo();
  return { ok: true, db: info.version, server_time: info.server_time };
}
