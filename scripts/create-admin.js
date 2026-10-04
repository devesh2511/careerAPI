// Creates an admin account. There is no admin sign-up, so the first admin
// comes from here; after that, admins add each other in the admin panel.
//   npm run create-admin -- <email> "<full name>" <password>
import pg from 'pg';
import { hashPassword } from '../src/Services/password.service.js';
import { CreateAdminRequest } from '../src/DTO/admin.requests.js';

const [email, fullName, password] = process.argv.slice(2);
if (!email || !fullName || !password) {
  console.error('usage: npm run create-admin -- <email> "<full name>" <password>');
  process.exit(1);
}

let req;
try {
  req = new CreateAdminRequest({ email, full_name: fullName, password });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rows } = await client.query(
    'INSERT INTO admins (email, full_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [req.email, req.fullName, await hashPassword(req.password)]);
  console.log(`created admin ${req.email} (${rows[0].id})`);
} catch (err) {
  console.error(err.code === '23505' ? `an admin with email ${req.email} already exists` : err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
