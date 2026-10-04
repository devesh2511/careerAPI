// Password hashing with Node's built-in scrypt, so there is no native module
// to build. Stored as  scrypt$N$r$p$<salt b64>$<hash b64>  so the cost can be
// raised later without breaking old hashes.
import { scrypt as scryptCb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [alg, n, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length,
    { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);
}

// Hashed once at startup. Login checks unknown emails against it, so a
// wrong email takes as long as a wrong password and can't be told apart.
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));
