// Student registration and login. Returns plain results; the controller
// decides status codes and sets the session cookie from `token`.
import { withTransaction } from '../Database/db.js';
import * as students from '../Database/student.repository.js';
import { findJoinableByCode } from '../Database/school.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { SessionResponse } from '../DTO/SessionResponse.js';
import { hashPassword, verifyPassword, DUMMY_HASH } from './password.service.js';
import { createSession, endSession } from './session.service.js';
import { accessFor } from './access.service.js';
import { toStudentDTO } from './student.service.js';

// req: RegisterRequest. Creates the student, their password login and a
// session in one transaction.
export async function register(req, userAgent) {
  // Hash before the transaction: it's the slow part, and needs no locks.
  const passwordHash = await hashPassword(req.password);

  return withTransaction(async db => {
    let schoolId = null;
    if (req.schoolCode) {
      const school = await findJoinableByCode(req.schoolCode, db);
      if (!school) {
        throw new ApiError(400, 'unknown_school_id',
          "We couldn't find that School ID. Check it with your school, or leave it blank.", 'school_code');
      }
      schoolId = school.id;
    }

    let student;
    try {
      student = await students.insertStudent({ email: req.email, fullName: req.fullName, schoolId }, db);
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'students_email_key') {
        throw new ApiError(409, 'email_taken', 'An account with this email already exists. Try logging in.', 'email');
      }
      throw err;
    }
    await students.insertPasswordIdentity({ studentId: student.id, email: req.email, passwordHash }, db);
    const token = await createSession(student.id, userAgent, db);
    const body = new SessionResponse(await toStudentDTO(student, db), await accessFor(student.id, db));
    return { token, body };
  });
}

// req: LoginRequest. Same answer for an unknown email, a wrong password and
// a deleted account, and all three take about as long.
export async function login(req, userAgent) {
  const found = await students.findPasswordLogin(req.email);
  const ok = await verifyPassword(req.password, found ? found.password_hash : DUMMY_HASH);
  if (!found || !ok || found.is_deleted) {
    throw new ApiError(401, 'bad_credentials', 'Email or password is incorrect.');
  }
  const { identity_id, password_hash, ...student } = found;
  await students.touchLastLogin(identity_id);
  const token = await createSession(student.id, userAgent);
  const body = new SessionResponse(await toStudentDTO(student), await accessFor(student.id));
  return { token, body };
}

export async function logout(token) {
  await endSession(token);
}
