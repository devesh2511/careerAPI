// Sets a new password for an existing admin and signs them out everywhere.
// For when an admin is locked out; there is no reset flow in the app.
//   npm run reset-admin-password -- <email> <new password>
import pg from 'pg';
import { hashPassword } from '../src/Services/password.service.js';
import { PASSWORD_MIN, PASSWORD_MAX } from '../src/DTO/auth.requests.js';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('usage: npm run reset-admin-password -- <email> <new password>');
  process.exit(1);
}
if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
  console.error(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rows } = await client.query(
    'UPDATE admins SET password_hash = $1 WHERE lower(email) = lower($2) RETURNING id, is_deleted',
    [await hashPassword(password), email.trim()]);
  if (!rows.length) {
    console.error(`no admin with email ${email}`);
    process.exitCode = 1;
  } else {
    await client.query('DELETE FROM admin_sessions WHERE admin_id = $1', [rows[0].id]);
    console.log(`password reset for ${email} (${rows[0].id})`);
    if (rows[0].is_deleted) console.log('note: this admin is soft-deleted and still cannot log in until restored');
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
